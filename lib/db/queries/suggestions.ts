import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { recipeSuggestions, pantryItems } from "@/lib/db/schema";

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

// Staples that every kitchen has — never mark as "missing"
const ALWAYS_AVAILABLE = new Set([
  "sal", "agua", "água", "water", "salt",
  "pimienta", "pimenta", "pepper",
  "aceite", "azeite", "oil",
  "vinagre", "vinegar",
]);

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/\s+/g, " ")
    .trim();
}

export async function computeMissingIngredients(
  ingredients: { name: string; quantity?: number | string; unit?: string }[]
): Promise<string[]> {
  // Load all pantry items once
  const allPantry = await db
    .select({ name: pantryItems.name })
    .from(pantryItems);
  const pantryNormalized = allPantry.map((p) => normalizeForMatch(p.name));

  const missing: string[] = [];

  for (const ing of ingredients) {
    const normalized = normalizeForMatch(ing.name);

    // Skip staples
    if (ALWAYS_AVAILABLE.has(normalized)) continue;
    if ([...ALWAYS_AVAILABLE].some((s) => normalized.includes(s))) continue;

    // Check if any pantry item matches (bidirectional fuzzy)
    const found = pantryNormalized.some(
      (p) => p.includes(normalized) || normalized.includes(p)
    );

    // Also try matching individual words (e.g., "cebola" matches "cebola roxa")
    const ingWords = normalized.split(" ");
    const wordMatch = !found && pantryNormalized.some((p) =>
      ingWords.some((word) => word.length >= 3 && p.includes(word))
    );

    if (!found && !wordMatch) {
      missing.push(ing.name);
    }
  }

  return missing;
}
