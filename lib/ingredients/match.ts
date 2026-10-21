// Pure helpers for matching recipe ingredients against pantry and grocery
// items. Kept free of DB access so they can be unit tested.

export type RecipeIngredient = {
  name: string;
  quantity?: number | string;
  unit?: string;
};

// Staples that every kitchen has. Never reported as missing.
export const ALWAYS_AVAILABLE: ReadonlySet<string> = new Set([
  "sal", "agua", "água", "water", "salt",
  "pimienta", "pimenta", "pepper",
  "aceite", "azeite", "oil",
  "vinagre", "vinegar",
]);

/** Lowercase, strip accents, collapse whitespace. */
export function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True for salt, water, oil, vinegar, pepper and anything containing them. */
export function isStaple(normalizedName: string): boolean {
  if (ALWAYS_AVAILABLE.has(normalizedName)) return true;
  for (const staple of ALWAYS_AVAILABLE) {
    if (normalizedName.includes(staple)) return true;
  }
  return false;
}

/**
 * Fuzzy check whether an ingredient is covered by any pantry item.
 * Matches in both directions ("cebola" vs "cebola roxa") and falls back to
 * word-level matching for words of 3+ characters.
 */
export function matchesPantry(
  normalizedIngredient: string,
  normalizedPantry: readonly string[],
): boolean {
  const found = normalizedPantry.some(
    (p) => p.includes(normalizedIngredient) || normalizedIngredient.includes(p),
  );
  if (found) return true;

  const words = normalizedIngredient.split(" ");
  return normalizedPantry.some((p) =>
    words.some((word) => word.length >= 3 && p.includes(word)),
  );
}

/** Ingredients that are neither staples nor present in the pantry. */
export function findMissingIngredients<T extends { name: string }>(
  ingredients: readonly T[],
  pantryNames: readonly string[],
): T[] {
  const pantryNormalized = pantryNames.map(normalizeIngredientName);
  return ingredients.filter((ing) => {
    const normalized = normalizeIngredientName(ing.name);
    if (isStaple(normalized)) return false;
    return !matchesPantry(normalized, pantryNormalized);
  });
}

/** Drop items already on the grocery list (case-insensitive, by name). */
export function excludeExistingGroceryItems<T extends { name: string }>(
  items: readonly T[],
  existingNames: readonly string[],
): T[] {
  const existing = new Set(existingNames.map((n) => n.toLowerCase()));
  return items.filter((item) => !existing.has(item.name.toLowerCase()));
}

/**
 * Recipe quantities come from LLM output and may be numbers or strings
 * ("2", "1.5", "a gosto"). Anything unparseable counts as 1.
 */
export function parseIngredientQuantity(q: number | string | undefined): number {
  if (typeof q === "number") return q;
  if (typeof q === "string") return parseFloat(q) || 1;
  return 1;
}
