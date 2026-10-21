import { and, gte, lte, eq, desc, sql, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { mealPlan, recipes, pantryItems } from "@/lib/db/schema";
import {
  parseIngredientQuantity,
  type RecipeIngredient,
} from "@/lib/ingredients/match";

export async function getWeekMealPlan(weekStart: string) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const endStr = end.toISOString().split("T")[0];

  const entries = await db
    .select({
      id: mealPlan.id,
      date: mealPlan.date,
      mealType: mealPlan.mealType,
      description: mealPlan.description,
      forUser: mealPlan.forUser,
      completed: mealPlan.completed,
      recipeId: mealPlan.recipeId,
      recipeName: recipes.name,
    })
    .from(mealPlan)
    .leftJoin(recipes, eq(mealPlan.recipeId, recipes.id))
    .where(and(gte(mealPlan.date, weekStart), lte(mealPlan.date, endStr)));

  return entries;
}

export async function getTodayMealPlan() {
  const today = new Date().toISOString().split("T")[0];

  return db
    .select({
      id: mealPlan.id,
      mealType: mealPlan.mealType,
      description: mealPlan.description,
      forUser: mealPlan.forUser,
      completed: mealPlan.completed,
      recipeId: mealPlan.recipeId,
      recipeName: recipes.name,
    })
    .from(mealPlan)
    .leftJoin(recipes, eq(mealPlan.recipeId, recipes.id))
    .where(eq(mealPlan.date, today));
}

export async function upsertMealPlanEntry(data: {
  date: string;
  mealType: string;
  description?: string;
  recipeId?: string;
  forUser?: string;
}) {
  const existing = await db
    .select({ id: mealPlan.id })
    .from(mealPlan)
    .where(
      and(
        eq(mealPlan.date, data.date),
        eq(mealPlan.mealType, data.mealType),
        eq(mealPlan.forUser, data.forUser ?? "both")
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(mealPlan)
      .set({
        description: data.description,
        recipeId: data.recipeId,
      })
      .where(eq(mealPlan.id, existing[0].id))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(mealPlan)
    .values({
      date: data.date,
      mealType: data.mealType,
      description: data.description,
      recipeId: data.recipeId,
      forUser: data.forUser ?? "both",
    })
    .returning();
  return inserted;
}

export async function completeMealPlanEntry(
  id: string,
  data: { notes?: string; rating?: number; recipeId?: string }
) {
  const [entry] = await db
    .select()
    .from(mealPlan)
    .where(eq(mealPlan.id, id))
    .limit(1);

  if (!entry) return null;

  const [updated] = await db
    .update(mealPlan)
    .set({
      completed: true,
      completedAt: new Date(),
      notes: data.notes,
    })
    .where(eq(mealPlan.id, id))
    .returning();

  return { ...updated, recipeId: data.recipeId ?? entry.recipeId };
}

export async function getRecentMealHistory(weeks: number = 2) {
  const since = new Date();
  since.setDate(since.getDate() - weeks * 7);
  const sinceStr = since.toISOString().split("T")[0];

  return db
    .select({
      date: mealPlan.date,
      mealType: mealPlan.mealType,
      description: mealPlan.description,
      forUser: mealPlan.forUser,
      completed: mealPlan.completed,
      notes: mealPlan.notes,
      recipeName: recipes.name,
      recipeId: mealPlan.recipeId,
    })
    .from(mealPlan)
    .leftJoin(recipes, eq(mealPlan.recipeId, recipes.id))
    .where(gte(mealPlan.date, sinceStr))
    .orderBy(desc(mealPlan.date));
}

export async function deleteMealPlanEntry(id: string) {
  const deleted = await db
    .delete(mealPlan)
    .where(eq(mealPlan.id, id))
    .returning();
  return deleted.length > 0 ? deleted[0] : null;
}

// --- Pantry deduction ---

type PantryDeduction = {
  pantryItemId: string;
  pantryItemName: string;
  ingredientName: string;
  deducted: number;
  previousQty: number;
  newQty: number | null; // null = item removed
};

export type IngredientPreview = {
  ingredientName: string;
  quantity: number;
  unit: string;
  pantryItemId: string | null;
  pantryItemName: string | null;
  pantryQty: number | null;
};

export async function previewPantryDeductions(recipeId: string) {
  const [recipe] = await db
    .select({ ingredients: recipes.ingredients })
    .from(recipes)
    .where(eq(recipes.id, recipeId));

  if (!recipe) return [];

  let ingredients: RecipeIngredient[];
  try {
    ingredients = JSON.parse(recipe.ingredients);
  } catch {
    return [];
  }

  const previews: IngredientPreview[] = [];

  for (const ing of ingredients) {
    const matches = await db
      .select()
      .from(pantryItems)
      .where(ilike(pantryItems.name, `%${ing.name}%`))
      .limit(1);

    const deductQty = parseIngredientQuantity(ing.quantity);

    if (matches.length > 0) {
      const item = matches[0];
      previews.push({
        ingredientName: ing.name,
        quantity: deductQty,
        unit: ing.unit ?? "",
        pantryItemId: item.id,
        pantryItemName: item.name,
        pantryQty: item.quantity,
      });
    } else {
      previews.push({
        ingredientName: ing.name,
        quantity: deductQty,
        unit: ing.unit ?? "",
        pantryItemId: null,
        pantryItemName: null,
        pantryQty: null,
      });
    }
  }

  return previews;
}

export async function deductPantryItems(
  items: { pantryItemId: string; quantity: number }[]
) {
  const deductions: PantryDeduction[] = [];

  for (const item of items) {
    const [pantryItem] = await db
      .select()
      .from(pantryItems)
      .where(eq(pantryItems.id, item.pantryItemId))
      .limit(1);

    if (!pantryItem) continue;

    const previousQty = pantryItem.quantity ?? 0;
    const newQty = previousQty - item.quantity;

    if (newQty <= 0) {
      await db.delete(pantryItems).where(eq(pantryItems.id, item.pantryItemId));
      deductions.push({
        pantryItemId: item.pantryItemId,
        pantryItemName: pantryItem.name,
        ingredientName: pantryItem.name,
        deducted: item.quantity,
        previousQty,
        newQty: null,
      });
    } else {
      await db
        .update(pantryItems)
        .set({ quantity: newQty })
        .where(eq(pantryItems.id, item.pantryItemId));
      deductions.push({
        pantryItemId: item.pantryItemId,
        pantryItemName: pantryItem.name,
        ingredientName: pantryItem.name,
        deducted: item.quantity,
        previousQty,
        newQty,
      });
    }
  }

  return deductions;
}

export async function deductPantryFromRecipe(recipeId: string) {
  const [recipe] = await db
    .select({ ingredients: recipes.ingredients })
    .from(recipes)
    .where(eq(recipes.id, recipeId));

  if (!recipe) return { deductions: [], unmatched: [], error: "Recipe not found" };

  let ingredients: RecipeIngredient[];
  try {
    ingredients = JSON.parse(recipe.ingredients);
  } catch {
    return { deductions: [], unmatched: [], error: "Could not parse recipe ingredients" };
  }

  const deductions: PantryDeduction[] = [];
  const unmatched: string[] = [];

  for (const ing of ingredients) {
    // Find matching pantry item (fuzzy by name)
    const matches = await db
      .select()
      .from(pantryItems)
      .where(ilike(pantryItems.name, `%${ing.name}%`))
      .limit(1);

    if (matches.length === 0) {
      unmatched.push(ing.name);
      continue;
    }

    const item = matches[0];
    const deductQty = parseIngredientQuantity(ing.quantity);

    const previousQty = item.quantity ?? 0;
    const newQty = previousQty - deductQty;

    if (newQty <= 0) {
      await db.delete(pantryItems).where(eq(pantryItems.id, item.id));
      deductions.push({
        pantryItemId: item.id,
        pantryItemName: item.name,
        ingredientName: ing.name,
        deducted: deductQty,
        previousQty,
        newQty: null,
      });
    } else {
      await db
        .update(pantryItems)
        .set({ quantity: newQty })
        .where(eq(pantryItems.id, item.id));
      deductions.push({
        pantryItemId: item.id,
        pantryItemName: item.name,
        ingredientName: ing.name,
        deducted: deductQty,
        previousQty,
        newQty,
      });
    }
  }

  return { deductions, unmatched };
}
