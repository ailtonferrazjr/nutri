"use server";

import { revalidatePath } from "next/cache";
import { createRecipe } from "@/lib/db/queries/recipes";
import { markSuggestionUsed } from "@/lib/db/queries/suggestions";
import { saveFeedback } from "@/lib/db/queries/feedback";
import { db } from "@/lib/db";
import { recipes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface RecipeSuggestion {
  name: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: { name: string; quantity: number | string; unit: string }[];
  instructions: string[];
  tags: string[];
  nutrition: { calories: number; protein: number; carbs: number; fat: number };
  mealType: string;
}

export async function saveRecipeAction(
  data: RecipeSuggestion,
  suggestionId?: string
) {
  const recipe = await createRecipe({
    name: data.name,
    description: data.description,
    servings: data.servings,
    prepMinutes: data.prepMinutes,
    cookMinutes: data.cookMinutes,
    ingredients: JSON.stringify(data.ingredients),
    instructions: JSON.stringify(data.instructions),
    tags: JSON.stringify(data.tags),
    nutrition: JSON.stringify(data.nutrition),
    source: "discover",
  });
  if (suggestionId) await markSuggestionUsed(suggestionId);
  await saveFeedback({
    suggestionId,
    recipeName: data.name,
    action: "saved",
    tags: JSON.stringify(data.tags),
    ingredients: JSON.stringify(data.ingredients.map((i) => i.name)),
  });
  revalidatePath("/receitas");
  revalidatePath("/descobrir");
  return recipe;
}

export async function saveFavoriteAction(
  data: RecipeSuggestion,
  suggestionId?: string
) {
  const recipe = await createRecipe({
    name: data.name,
    description: data.description,
    servings: data.servings,
    prepMinutes: data.prepMinutes,
    cookMinutes: data.cookMinutes,
    ingredients: JSON.stringify(data.ingredients),
    instructions: JSON.stringify(data.instructions),
    tags: JSON.stringify(data.tags),
    nutrition: JSON.stringify(data.nutrition),
    source: "discover",
  });
  if (recipe) {
    await db
      .update(recipes)
      .set({ favorite: true })
      .where(eq(recipes.id, recipe.id));
  }
  if (suggestionId) await markSuggestionUsed(suggestionId);
  await saveFeedback({
    suggestionId,
    recipeName: data.name,
    action: "favorited",
    tags: JSON.stringify(data.tags),
    ingredients: JSON.stringify(data.ingredients.map((i) => i.name)),
  });
  revalidatePath("/receitas");
  revalidatePath("/descobrir");
  return recipe;
}

export async function dismissWithReasonAction(
  suggestionId: string,
  recipeName: string,
  reason: string,
  detail?: string,
  tags?: string,
  ingredients?: string
) {
  await markSuggestionUsed(suggestionId);
  await saveFeedback({
    suggestionId,
    recipeName,
    action: "dismissed",
    reason,
    detail,
    tags,
    ingredients,
  });
  revalidatePath("/descobrir");
}

export async function saveAlterFeedbackAction(
  suggestionId: string | undefined,
  recipeName: string,
  alterPrompt: string,
  tags?: string,
  ingredients?: string
) {
  await saveFeedback({
    suggestionId,
    recipeName,
    action: "altered",
    detail: alterPrompt,
    tags,
    ingredients,
  });
}
