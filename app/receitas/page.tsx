export const dynamic = "force-dynamic";

import Link from "next/link";
import { ChefHat, Clock, Users, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { getRecipes } from "@/lib/db/queries/recipes";

type Recipe = Awaited<ReturnType<typeof getRecipes>>[number];

const MEAL_SECTIONS = [
  { key: "café", label: "Café da manhã", tags: ["café", "cafe", "café da manhã"] },
  { key: "almoço", label: "Almoço", tags: ["almoço", "almoco"] },
  { key: "lanche", label: "Lanche", tags: ["lanche", "chá da tarde", "cha da tarde"] },
  { key: "jantar", label: "Jantar", tags: ["jantar", "janta"] },
];

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [tags];
  } catch {
    return tags.split(",").map((t) => t.trim()).filter(Boolean);
  }
}

function getMealSection(tags: string[]): string | null {
  const lower = tags.map((t) => t.toLowerCase());
  for (const section of MEAL_SECTIONS) {
    if (section.tags.some((t) => lower.includes(t))) return section.key;
  }
  return null;
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const totalTime = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  const tags = parseTags(recipe.tags);
  // Filter out meal-type tags from display
  const mealTags = MEAL_SECTIONS.flatMap((s) => s.tags);
  const displayTags = tags.filter((t) => !mealTags.includes(t.toLowerCase()));

  return (
    <Link href={`/receitas/${recipe.id}`}>
      <Card className="transition-colors hover:bg-muted/50 h-full">
        <CardContent className="p-4 h-full flex flex-col">
          <div className="flex items-center gap-1.5 mb-1">
            <h3 className="font-medium text-sm">{recipe.name}</h3>
            {recipe.favorite && (
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 shrink-0" />
            )}
          </div>
          {recipe.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {recipe.description}
            </p>
          )}
          <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {totalTime}min
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {recipe.servings}
              </span>
            )}
            {recipe.rating && <span>{"★".repeat(recipe.rating)}</span>}
          </div>
          {displayTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {displayTags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function ReceitasPage() {
  const recipes = await getRecipes();

  if (recipes.length === 0) {
    return (
      <>
        <PageHeader title="Receitas" />
        <EmptyState
          icon={ChefHat}
          title="Nenhuma receita salva"
          description="Peca sugestoes de receitas no chat."
          chatPrompt="Sugere receitas pro jantar"
        />
      </>
    );
  }

  // Group recipes by meal section
  const grouped = new Map<string, Recipe[]>();
  const uncategorized: Recipe[] = [];

  for (const recipe of recipes) {
    const tags = parseTags(recipe.tags);
    const section = getMealSection(tags);
    if (section) {
      const list = grouped.get(section) ?? [];
      list.push(recipe);
      grouped.set(section, list);
    } else {
      uncategorized.push(recipe);
    }
  }

  const sections = MEAL_SECTIONS
    .filter((s) => grouped.has(s.key))
    .map((s) => ({ label: s.label, recipes: grouped.get(s.key)! }));

  if (uncategorized.length > 0) {
    sections.push({ label: "Outras", recipes: uncategorized });
  }

  return (
    <>
      <PageHeader
        title="Receitas"
        description={`${recipes.length} receitas`}
      />

      <div className="space-y-6">
        {sections.map(({ label, recipes: sectionRecipes }) => (
          <div key={label}>
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              {label}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {sectionRecipes.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
