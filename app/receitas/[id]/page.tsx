export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getRecipeById } from "@/lib/db/queries/recipes";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipeById(id);

  if (!recipe) notFound();

  const totalTime = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  let tags: string[] = [];
  if (recipe.tags) {
    try {
      const parsed = JSON.parse(recipe.tags);
      tags = Array.isArray(parsed) ? parsed : [recipe.tags];
    } catch {
      tags = recipe.tags.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }

  let ingredients: string[] = [];
  try {
    const parsed = JSON.parse(recipe.ingredients);
    if (Array.isArray(parsed)) {
      ingredients = parsed.map((item) =>
        typeof item === "string"
          ? item
          : [item.quantity, item.unit, item.name].filter(Boolean).join(" ")
      );
    }
  } catch {
    ingredients = recipe.ingredients
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  let instructions: string[] = [];
  try {
    const parsed = JSON.parse(recipe.instructions);
    instructions = Array.isArray(parsed) ? parsed : [recipe.instructions];
  } catch {
    instructions = recipe.instructions
      .split("\n")
      .map((l) => l.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
  }

  let nutrition: Record<string, string> | null = null;
  if (recipe.nutrition) {
    try {
      nutrition = JSON.parse(recipe.nutrition);
    } catch {
      nutrition = null;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/receitas">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">{recipe.name}</h1>
        {recipe.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {recipe.description}
          </p>
        )}
        <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {totalTime}min
            </span>
          )}
          {recipe.servings && (
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {recipe.servings} porcoes
            </span>
          )}
          {recipe.rating && (
            <span>{"★".repeat(recipe.rating)}</span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Ingredients */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">Ingredientes</h2>
        <ul className="space-y-1.5">
          {ingredients.map((ingredient, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
              {ingredient}
            </li>
          ))}
        </ul>
      </div>

      <Separator />

      {/* Instructions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">Preparo</h2>
        <ol className="space-y-3">
          {instructions.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Nutrition */}
      {nutrition && (
        <>
          <Separator />
          <div>
            <h2 className="mb-3 text-sm font-semibold">Nutricao</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(nutrition).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-lg bg-muted p-3 text-center"
                >
                  <p className="text-xs text-muted-foreground capitalize">
                    {key}
                  </p>
                  <p className="text-sm font-medium">{value as string}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
