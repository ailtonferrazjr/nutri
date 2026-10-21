"use client";

import { useState, useTransition } from "react";
import {
  Bookmark,
  Star,
  X,
  Pencil,
  Clock,
  Send,
  Loader2,
  ShoppingCart,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  saveRecipeAction,
  saveFavoriteAction,
  dismissWithReasonAction,
  saveAlterFeedbackAction,
  type RecipeSuggestion,
} from "./actions";

interface SuggestionCardProps {
  recipe: RecipeSuggestion;
  suggestionId?: string;
  missingIngredients?: string[];
  onDismiss: () => void;
}

const DISMISS_REASONS = [
  { key: "not_interested", label: "Não curti" },
  { key: "too_complex", label: "Difícil" },
  { key: "bad_ingredient", label: "Ingrediente" },
] as const;

export function SuggestionCard({
  recipe,
  suggestionId,
  missingIngredients = [],
  onDismiss,
}: SuggestionCardProps) {
  const [saved, setSaved] = useState<"saved" | "favorited" | null>(null);
  const [showDismissReasons, setShowDismissReasons] = useState(false);
  const [showIngredientInput, setShowIngredientInput] = useState(false);
  const [ingredientDetail, setIngredientDetail] = useState("");
  const [dismissReason, setDismissReason] = useState<string | null>(null);
  const [dismissComment, setDismissComment] = useState("");
  const [showAlterInput, setShowAlterInput] = useState(false);
  const [alterPrompt, setAlterPrompt] = useState("");
  const [isPending, startTransition] = useTransition();

  const totalTime = recipe.prepMinutes + recipe.cookMinutes;
  const ingredientNames = recipe.ingredients
    .map((i) => i.name)
    .slice(0, 6)
    .join(", ");
  const tagsJson = JSON.stringify(recipe.tags);
  const ingredientsJson = JSON.stringify(
    recipe.ingredients.map((i) => i.name)
  );

  function handleSave() {
    startTransition(async () => {
      await saveRecipeAction(recipe, suggestionId);
      setSaved("saved");
    });
  }

  function handleFavorite() {
    startTransition(async () => {
      await saveFavoriteAction(recipe, suggestionId);
      setSaved("favorited");
    });
  }

  function handleDismissClick() {
    if (suggestionId) {
      setShowDismissReasons(true);
    } else {
      onDismiss();
    }
  }

  function handleDismissReason(reason: string) {
    if (reason === "bad_ingredient") {
      setShowIngredientInput(true);
      return;
    }
    setDismissReason(reason);
  }

  function submitDismiss(reason: string, detail?: string) {
    const combinedDetail = [detail, dismissComment.trim()]
      .filter(Boolean)
      .join(" — ");
    startTransition(async () => {
      if (suggestionId) {
        await dismissWithReasonAction(
          suggestionId,
          recipe.name,
          reason,
          combinedDetail || undefined,
          tagsJson,
          ingredientsJson
        );
      }
      onDismiss();
    });
  }

  function handleIngredientSubmit() {
    submitDismiss("bad_ingredient", ingredientDetail.trim() || undefined);
  }

  function handleDismissConfirm() {
    submitDismiss(dismissReason!);
  }

  function handleAlterSubmit() {
    if (!alterPrompt.trim()) return;
    startTransition(async () => {
      await saveAlterFeedbackAction(
        suggestionId,
        recipe.name,
        alterPrompt.trim(),
        tagsJson,
        ingredientsJson
      );
      setShowAlterInput(false);
      setAlterPrompt("");
    });
  }

  if (saved) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-primary">
          {saved === "favorited" ? (
            <Star className="h-4 w-4 fill-current" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
          <span className="font-medium">{recipe.name}</span>
          <span className="text-muted-foreground">
            — {saved === "favorited" ? "salva como favorita" : "salva"}
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-medium text-sm">{recipe.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {recipe.description}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismissClick}
            disabled={isPending}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {totalTime}min
            </span>
          )}
          <span>{recipe.servings} porções</span>
          <span>{recipe.nutrition.calories} kcal</span>
        </div>

        <div className="flex flex-wrap gap-1">
          {recipe.tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Ingredientes:</span> {ingredientNames}
          {recipe.ingredients.length > 6 && "..."}
        </p>

        {missingIngredients.length > 0 && (
          <div className="flex items-start gap-1.5 text-xs text-orange-600 bg-orange-50 rounded-md px-2.5 py-1.5">
            <ShoppingCart className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              <span className="font-medium">Precisa comprar:</span>{" "}
              {missingIngredients.join(", ")}
            </span>
          </div>
        )}

        {/* Dismiss reasons */}
        {showDismissReasons && !showIngredientInput && !dismissReason && (
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">
              Por que não curtiu?
            </span>
            <div className="flex gap-2">
              {DISMISS_REASONS.map((r) => (
                <Button
                  key={r.key}
                  variant="outline"
                  size="sm"
                  onClick={() => handleDismissReason(r.key)}
                  disabled={isPending}
                  className="text-xs flex-1"
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Ingredient detail input */}
        {showIngredientInput && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={ingredientDetail}
                onChange={(e) => setIngredientDetail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleIngredientSubmit()}
                placeholder="Qual ingrediente?"
                className="text-sm"
                autoFocus
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={handleIngredientSubmit}
                disabled={isPending}
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Comment + confirm after selecting reason */}
        {dismissReason && !showIngredientInput && (
          <div className="space-y-2">
            <Input
              value={dismissComment}
              onChange={(e) => setDismissComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDismissConfirm()}
              placeholder="Comentário opcional (ex: quase boa, mas...)"
              className="text-sm"
            />
            <Button
              size="sm"
              onClick={handleDismissConfirm}
              disabled={isPending}
              className="w-full"
            >
              Enviar
            </Button>
          </div>
        )}

        {/* Alter input */}
        {showAlterInput ? (
          <div className="flex gap-2">
            <Input
              value={alterPrompt}
              onChange={(e) => setAlterPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAlterSubmit()}
              placeholder="Ex: mais rápida, sem cebola..."
              className="text-sm"
              autoFocus
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleAlterSubmit}
              disabled={!alterPrompt.trim() || isPending}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          !showDismissReasons && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAlterInput(true)}
                className="gap-1.5 flex-1"
              >
                <Pencil className="h-3.5 w-3.5" />
                Alterar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={isPending}
                className="gap-1.5 flex-1"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bookmark className="h-3.5 w-3.5" />
                )}
                Salvar
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleFavorite}
                disabled={isPending}
                className="gap-1.5 flex-1"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Star className="h-3.5 w-3.5" />
                )}
                Favoritar
              </Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
