"use server";

import { revalidatePath } from "next/cache";
import {
  completeMealPlanEntry,
  deductPantryItems,
  previewPantryDeductions,
} from "@/lib/db/queries/meal-plan";
import { rateRecipe } from "@/lib/db/queries/recipes";

export async function getIngredientPreviewAction(recipeId: string) {
  return previewPantryDeductions(recipeId);
}

export async function completeMealAction(
  id: string,
  opts: {
    recipeId?: string | null;
    itemsToDeduct?: { pantryItemId: string; quantity: number }[];
    rating?: number;
  }
) {
  const entry = await completeMealPlanEntry(id, {});
  if (!entry) return { error: "Refeição não encontrada" };

  const recipeId = opts.recipeId ?? entry.recipeId;

  if (opts.rating && recipeId) {
    await rateRecipe(recipeId, opts.rating);
  }

  let deductions: { item: string; qty: string }[] = [];

  if (opts.itemsToDeduct && opts.itemsToDeduct.length > 0) {
    const result = await deductPantryItems(opts.itemsToDeduct);
    deductions = result.map((d) => ({
      item: d.pantryItemName,
      qty: `${d.previousQty} → ${d.newQty ?? "removido"}`,
    }));
  }

  revalidatePath("/semana");
  revalidatePath("/despensa");

  return { success: true, deductions };
}
