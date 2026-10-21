"use client";

import { useState, useEffect, useOptimistic, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Star, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { completeMealAction, getIngredientPreviewAction } from "./actions";
import type { IngredientPreview } from "@/lib/db/queries/meal-plan";

interface MealEntry {
  id: string;
  mealType: string;
  description: string | null;
  forUser: string | null;
  completed: boolean | null;
  recipeId: string | null;
  recipeName: string | null;
}

export function MealCard({ entry }: { entry: MealEntry }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [optimisticCompleted, setOptimisticCompleted] = useOptimistic(
    entry.completed ?? false
  );

  // Ingredient preview state
  const [ingredients, setIngredients] = useState<IngredientPreview[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (dialogOpen && entry.recipeId) {
      setLoadingPreview(true);
      getIngredientPreviewAction(entry.recipeId).then((previews) => {
        setIngredients(previews);
        // Pre-select items that have a pantry match
        const matched = new Set(
          previews
            .filter((p) => p.pantryItemId)
            .map((p) => p.pantryItemId!)
        );
        setSelectedIds(matched);
        setLoadingPreview(false);
      });
    }
  }, [dialogOpen, entry.recipeId]);

  function toggleItem(pantryItemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pantryItemId)) {
        next.delete(pantryItemId);
      } else {
        next.add(pantryItemId);
      }
      return next;
    });
  }

  function handleConfirm() {
    const itemsToDeduct = ingredients
      .filter((ing) => ing.pantryItemId && selectedIds.has(ing.pantryItemId))
      .map((ing) => ({
        pantryItemId: ing.pantryItemId!,
        quantity: ing.quantity,
      }));

    startTransition(async () => {
      setOptimisticCompleted(true);
      setDialogOpen(false);
      await completeMealAction(entry.id, {
        recipeId: entry.recipeId,
        itemsToDeduct,
        rating: rating > 0 ? rating : undefined,
      });
      setRating(0);
      setIngredients([]);
      setSelectedIds(new Set());
    });
  }

  function handleCheckClick() {
    if (optimisticCompleted) return;
    if (entry.recipeId) {
      setDialogOpen(true);
    } else {
      startTransition(async () => {
        setOptimisticCompleted(true);
        await completeMealAction(entry.id, {});
      });
    }
  }

  const matchedCount = ingredients.filter((i) => i.pantryItemId).length;

  return (
    <>
      <Card className={cn("py-0", optimisticCompleted && "opacity-50")}>
        <CardContent className="flex items-center gap-3 px-3 py-2">
          <button
            type="button"
            onClick={handleCheckClick}
            disabled={isPending || optimisticCompleted}
            className="shrink-0 text-muted-foreground hover:text-primary disabled:cursor-default transition-colors"
          >
            {optimisticCompleted ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <Circle className="h-5 w-5" />
            )}
          </button>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-14">
            {entry.mealType}
          </span>
          <div className="flex-1 min-w-0">
            {entry.recipeId ? (
              <Link
                href={`/receitas/${entry.recipeId}`}
                className={cn(
                  "text-sm hover:underline",
                  optimisticCompleted && "line-through"
                )}
              >
                {entry.recipeName || entry.description}
              </Link>
            ) : (
              <span
                className={cn(
                  "text-sm",
                  optimisticCompleted && "line-through"
                )}
              >
                {entry.description}
              </span>
            )}
          </div>
          {entry.forUser && entry.forUser !== "both" && (
            <Badge variant="outline" className="text-[10px]">
              {entry.forUser}
            </Badge>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar refeição</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {entry.recipeName || entry.description}
            </p>

            {entry.recipeId && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      Deduzir da despensa
                    </span>
                    {!loadingPreview && matchedCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {selectedIds.size}/{matchedCount}
                      </span>
                    )}
                  </div>

                  {loadingPreview ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {ingredients.map((ing) => (
                        <label
                          key={ing.ingredientName}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                            ing.pantryItemId
                              ? "cursor-pointer hover:bg-muted/50"
                              : "opacity-40"
                          )}
                        >
                          <Checkbox
                            checked={
                              ing.pantryItemId
                                ? selectedIds.has(ing.pantryItemId)
                                : false
                            }
                            onCheckedChange={() =>
                              ing.pantryItemId && toggleItem(ing.pantryItemId)
                            }
                            disabled={!ing.pantryItemId}
                          />
                          <span className="flex-1 truncate">
                            {ing.ingredientName}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {ing.quantity}
                            {ing.unit && ` ${ing.unit}`}
                          </span>
                          {ing.pantryItemId && ing.pantryQty != null && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] shrink-0"
                            >
                              {ing.pantryQty} na despensa
                            </Badge>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-sm font-medium">Nota</span>
                  <div className="mt-1 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(rating === n ? 0 : n)}
                        className="transition-colors"
                      >
                        <Star
                          className={cn(
                            "h-6 w-6",
                            n <= rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground/30"
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={handleConfirm}
              disabled={isPending || loadingPreview}
              className="w-full"
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
