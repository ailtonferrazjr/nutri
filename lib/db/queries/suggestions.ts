import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { recipeSuggestions, pantryItems } from "@/lib/db/schema";
import {
  findMissingIngredients,
  type RecipeIngredient,
} from "@/lib/ingredients/match";

export async function getAvailableSuggestions() {
  return db
    .select()
    .from(recipeSuggestions)
    .where(eq(recipeSuggestions.used, false))
    .orderBy(recipeSuggestions.createdAt);
}

export async function getSuggestionsByMealType(mealType: string) {
  return db
    .select()
    .from(recipeSuggestions)
    .where(
      and(
        eq(recipeSuggestions.mealType, mealType),
        eq(recipeSuggestions.used, false)
      )
    );
}

export async function countSuggestionsByMealType() {
  const result = await db
    .select({
      mealType: recipeSuggestions.mealType,
      count: sql<number>`count(*)::int`,
    })
    .from(recipeSuggestions)
    .where(eq(recipeSuggestions.used, false))
    .groupBy(recipeSuggestions.mealType);

  const counts: Record<string, number> = {};
  for (const row of result) {
    counts[row.mealType] = row.count;
  }
  return counts;
}

export async function markSuggestionUsed(id: string) {
  await db
    .update(recipeSuggestions)
    .set({ used: true })
    .where(eq(recipeSuggestions.id, id));
}

export type SuggestionInsert = {
  mealType: string;
  name: string;
  description?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: string;
  instructions: string;
  tags?: string;
  nutrition?: string;
  missingIngredients?: string;
};

export async function insertSuggestions(suggestions: SuggestionInsert[]) {
  if (suggestions.length === 0) return [];
  return db.insert(recipeSuggestions).values(suggestions).returning();
}

export async function computeMissingIngredients(
  ingredients: RecipeIngredient[]
): Promise<string[]> {
  const allPantry = await db
    .select({ name: pantryItems.name })
    .from(pantryItems);

  return findMissingIngredients(
    ingredients,
    allPantry.map((p) => p.name)
  ).map((ing) => ing.name);
}
