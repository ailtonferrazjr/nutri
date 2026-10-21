"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SuggestionCard } from "./suggestion-card";
import type { RecipeSuggestion } from "./actions";

interface PoolSuggestion {
  id: string;
  mealType: string;
  name: string;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: string;
  instructions: string;
  tags: string | null;
  nutrition: string | null;
  missingIngredients: string | null;
}

function poolToRecipe(s: PoolSuggestion): RecipeSuggestion {
  return {
    name: s.name,
    description: s.description ?? "",
    servings: s.servings ?? 2,
    prepMinutes: s.prepMinutes ?? 0,
    cookMinutes: s.cookMinutes ?? 0,
    ingredients: JSON.parse(s.ingredients),
    instructions: JSON.parse(s.instructions),
    tags: s.tags ? JSON.parse(s.tags) : [],
    nutrition: s.nutrition
      ? JSON.parse(s.nutrition)
      : { calories: 0, protein: 0, carbs: 0, fat: 0 },
    mealType: s.mealType,
  };
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  café: "Café da manhã",
  almoço: "Almoço",
  lanche: "Lanche",
  jantar: "Jantar",
};

const MEAL_TYPE_ORDER = ["café", "almoço", "lanche", "jantar"];

interface DiscoveryFeedProps {
  initialSuggestions: PoolSuggestion[];
}

export function DiscoveryFeed({ initialSuggestions }: DiscoveryFeedProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [generatedRecipes, setGeneratedRecipes] = useState<RecipeSuggestion[]>([]);
  const [isGenerating, startGeneration] = useTransition();

  const poolSuggestions = initialSuggestions.filter(
    (s) => !dismissedIds.has(s.id)
  );

  // Group pool suggestions by meal type
  const grouped = new Map<
    string,
    { suggestion: PoolSuggestion; recipe: RecipeSuggestion }[]
  >();
  for (const s of poolSuggestions) {
    const list = grouped.get(s.mealType) ?? [];
    list.push({ suggestion: s, recipe: poolToRecipe(s) });
    grouped.set(s.mealType, list);
  }

  const hasPool = poolSuggestions.length > 0;
  const hasGenerated = generatedRecipes.length > 0;

  function handleDismiss(id: string) {
    setDismissedIds((prev) => new Set(prev).add(id));
  }

  function handleDismissGenerated(index: number) {
    setGeneratedRecipes((prev) => prev.filter((_, i) => i !== index));
  }

  function handleGenerateMore() {
    startGeneration(async () => {
      try {
        const res = await fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const reader = res.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let accumulated = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
        }
        // Extract JSON chunks from the stream
        const jsonChunks = accumulated
          .split("\n")
          .filter((line) => line.startsWith("0:"))
          .map((line) => {
            try { return JSON.parse(line.slice(2)); } catch { return ""; }
          })
          .join("");
        const parsed = JSON.parse(jsonChunks);
        if (parsed.recipes) {
          setGeneratedRecipes((prev) => [...prev, ...parsed.recipes]);
        }
      } catch {
        // silently fail
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Pool suggestions grouped by meal type */}
      {MEAL_TYPE_ORDER.filter((mt) => grouped.has(mt)).map((mealType) => {
        const items = grouped.get(mealType)!;
        return (
          <div key={mealType}>
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              {MEAL_TYPE_LABELS[mealType] ?? mealType}
            </h2>
            <div className="space-y-3">
              {items.map(({ suggestion, recipe }) => {
                const missing = suggestion.missingIngredients
                  ? (JSON.parse(suggestion.missingIngredients) as string[])
                  : [];
                return (
                  <SuggestionCard
                    key={suggestion.id}
                    recipe={recipe}
                    suggestionId={suggestion.id}
                    missingIngredients={missing}
                    onDismiss={() => handleDismiss(suggestion.id)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* On-demand generated suggestions */}
      {hasGenerated && (
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Geradas agora
          </h2>
          <div className="space-y-3">
            {generatedRecipes.map((recipe, index) => (
              <SuggestionCard
                key={`gen-${index}-${recipe.name}`}
                recipe={recipe}
                onDismiss={() => handleDismissGenerated(index)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasPool && !hasGenerated && !isGenerating && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <h2 className="text-sm font-medium mb-1">Sem sugestões no momento</h2>
          <p className="text-xs text-muted-foreground mb-6 max-w-xs">
            Novas sugestões são geradas diariamente. Ou gere agora:
          </p>
          <Button onClick={handleGenerateMore} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Gerar sugestões
          </Button>
        </div>
      )}

      {/* Loading */}
      {isGenerating && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
          <span className="text-sm text-muted-foreground">
            Gerando receitas personalizadas...
          </span>
        </div>
      )}

      {/* Generate more button */}
      {(hasPool || hasGenerated) && !isGenerating && (
        <div className="flex justify-center pt-2 pb-4">
          <Button
            variant="outline"
            onClick={handleGenerateMore}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Gerar mais
          </Button>
        </div>
      )}
    </div>
  );
}
