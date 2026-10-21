import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getPantryByCategory } from "@/lib/db/queries/pantry";
import { getFavoriteRecipes, getRecipes } from "@/lib/db/queries/recipes";
import { getRecentMealHistory } from "@/lib/db/queries/meal-plan";
import {
  countSuggestionsByMealType,
  insertSuggestions,
  computeMissingIngredients,
} from "@/lib/db/queries/suggestions";
import { extractJsonArray } from "@/lib/parse-llm-json";
import type { RecipeIngredient } from "@/lib/ingredients/match";

type GeneratedRecipe = {
  name: string;
  description?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: RecipeIngredient[];
  instructions: string[];
  tags: string[];
  nutrition: Record<string, number>;
};

const MEAL_TYPES = ["café", "almoço", "lanche", "jantar"];
const MEAL_TYPE_LABELS: Record<string, string> = {
  café: "café da manhã (refeições matinais como ovos, torradas, panquecas, smoothies — NÃO receitas de café/bebida)",
  almoço: "almoço (refeições completas para o meio do dia)",
  lanche: "lanche da tarde (snacks e comidinhas leves)",
  jantar: "jantar (refeições leves para a noite)",
};
const TARGET_PER_TYPE = 5;

const client = new Anthropic();

async function buildPrompt(mealType: string, count: number) {
  const [allUsers, { items: pantryItems }, favorites, existing, recentMeals] =
    await Promise.all([
      db.select().from(users),
      getPantryByCategory(),
      getFavoriteRecipes(),
      getRecipes(),
      getRecentMealHistory(2),
    ]);

  const userProfiles = allUsers
    .map(
      (u) =>
        `${u.name}: restrições=${u.restrictions}, preferências=${u.preferences}, metas=${u.healthGoals}`
    )
    .join("\n");

  const pantryList = pantryItems
    .map((i) => `${i.name} (${i.quantity} ${i.unit})`)
    .join(", ");

  const favoriteNames = favorites.map((r) => r.name).join(", ");
  const existingNames = existing.map((r) => r.name).join(", ");
  const recentMealsList = recentMeals
    .map((m) => `${m.date} ${m.mealType}: ${m.recipeName || m.description}`)
    .join("\n");

  const label = MEAL_TYPE_LABELS[mealType] ?? mealType;
  return `Gere ${count} receitas de COMIDA para ${label} no formato JSON.

## Perfis dos usuários
${userProfiles}

## Despensa atual
${pantryList || "Despensa vazia"}

## Receitas favoritas (referência de gosto)
${favoriteNames || "Nenhuma favorita ainda"}

## Receitas já existentes (NÃO repita estas)
${existingNames}

## Refeições recentes
${recentMealsList || "Sem histórico"}

## Regras
- Respeite as restrições de TODOS os perfis acima: restrições são absolutas, nunca sugira algo que viole uma delas
- Evite ingredientes listados nos dislikes de qualquer perfil
- Seja CRIATIVO e variado: inspire-se em cozinhas do mundo (asiática, mexicana, mediterrânea, indiana, etc.)
- NÃO fique preso à despensa — sugira receitas novas e interessantes, mesmo que precise comprar ingredientes
- A despensa serve de referência do que já têm, não como limitação
- Receitas FÁCEIS e práticas (max 45min), mas com sabor surpreendente
- Ingredientes facilmente encontrados em supermercados espanhóis (Mercadona, Carrefour)
- Evite ingredientes difíceis de achar na Espanha (ex: tapioca)
- Inclua tags relevantes: vegetariana, rapida, airfryer, forno, etc.
- Idioma: português. Surpreenda com receitas que o casal nunca experimentou!

Responda APENAS com um JSON array, sem markdown:
[
  {
    "name": "Nome da receita",
    "description": "Descrição curta",
    "servings": 2,
    "prepMinutes": 10,
    "cookMinutes": 20,
    "ingredients": [{"name": "item", "quantity": 1, "unit": "un"}],
    "instructions": ["Passo 1", "Passo 2"],
    "tags": ["vegetariana", "rapida"],
    "nutrition": {"calories": 300, "protein": 20, "carbs": 30, "fat": 10}
  }
]`;
}

async function generateForMealType(mealType: string, count: number) {
  console.log(`Gerando ${count} sugestões para "${mealType}"...`);

  const prompt = await buildPrompt(mealType, count);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const recipes = extractJsonArray(text) as GeneratedRecipe[] | null;
  if (!recipes) {
    console.error(`Falha ao parsear JSON para ${mealType}`);
    return;
  }

  const suggestions = [];
  for (const recipe of recipes) {
    const missing = await computeMissingIngredients(recipe.ingredients);

    suggestions.push({
      mealType,
      name: recipe.name,
      description: recipe.description,
      servings: recipe.servings ?? 2,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      ingredients: JSON.stringify(recipe.ingredients),
      instructions: JSON.stringify(recipe.instructions),
      tags: JSON.stringify(recipe.tags),
      nutrition: JSON.stringify(recipe.nutrition),
      missingIngredients: JSON.stringify(missing),
    });
  }

  const inserted = await insertSuggestions(suggestions);
  console.log(`  → ${inserted.length} sugestões inseridas`);
}

async function main() {
  const counts = await countSuggestionsByMealType();
  console.log("Pool atual:", counts);

  let generated = false;

  for (const mealType of MEAL_TYPES) {
    const current = counts[mealType] ?? 0;
    const needed = TARGET_PER_TYPE - current;

    if (needed > 0) {
      await generateForMealType(mealType, needed);
      generated = true;
    } else {
      console.log(`"${mealType}" já tem ${current} sugestões, ok`);
    }
  }

  if (!generated) {
    console.log("Pool completo, nada a gerar.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
