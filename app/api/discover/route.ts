import { anthropic } from "@ai-sdk/anthropic";
import { streamObject } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getPantryByCategory } from "@/lib/db/queries/pantry";
import { getFavoriteRecipes, getRecipes } from "@/lib/db/queries/recipes";
import { getRecentMealHistory } from "@/lib/db/queries/meal-plan";

const MODEL = anthropic("claude-sonnet-4-20250514");

const recipeSuggestionSchema = z.object({
  recipes: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      servings: z.number().default(2),
      prepMinutes: z.number(),
      cookMinutes: z.number(),
      ingredients: z.array(
        z.object({
          name: z.string(),
          quantity: z.number().or(z.string()),
          unit: z.string(),
        })
      ),
      instructions: z.array(z.string()),
      tags: z.array(z.string()),
      nutrition: z.object({
        calories: z.number(),
        protein: z.number(),
        carbs: z.number(),
        fat: z.number(),
      }),
      mealType: z.string().describe("café, almoço, lanche, ou jantar"),
    })
  ),
});

async function buildDiscoverPrompt(mealType?: string, customPrompt?: string) {
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

  return `Você é um chef nutricionista criativo que sugere receitas personalizadas para um casal brasileiro morando na Espanha.

## Perfis dos usuários
${userProfiles}

## Despensa atual
${pantryList || "Despensa vazia"}

## Receitas favoritas (referência de gosto)
${favoriteNames || "Nenhuma favorita ainda"}

## Receitas já salvas (NÃO repita estas)
${existingNames || "Nenhuma"}

## Refeições recentes (NÃO repita)
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
${mealType ? `- Foque em receitas para: ${mealType}` : "- Varie entre todos os tipos de refeição"}
${customPrompt ? `\n## Pedido especial do usuário\n${customPrompt}` : ""}

Gere 6 receitas criativas e variadas.`;
}

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const { mealType, prompt: customPrompt } = body;

  const systemPrompt = await buildDiscoverPrompt(mealType, customPrompt);

  const result = streamObject({
    model: MODEL,
    schema: recipeSuggestionSchema,
    prompt: systemPrompt,
  });

  return result.toTextStreamResponse();
}
