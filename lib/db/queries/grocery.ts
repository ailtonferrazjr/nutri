import { eq, inArray, sql, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { groceryLists, groceryItems, recipes, pantryItems } from "@/lib/db/schema";

export async function getActiveGroceryList() {
  const [list] = await db
    .select()
    .from(groceryLists)
    .where(inArray(groceryLists.status, ["active", "draft"]))
    .orderBy(groceryLists.createdAt)
    .limit(1);

  if (!list) return null;

  const items = await db
    .select()
    .from(groceryItems)
    .where(eq(groceryItems.listId, list.id));

  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    const category = item.category || "Outros";
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  return { ...list, items, grouped };
}

export async function toggleGroceryItem(itemId: string) {
  const [item] = await db
    .select({ checked: groceryItems.checked })
    .from(groceryItems)
    .where(eq(groceryItems.id, itemId));

  if (!item) return;

  await db
    .update(groceryItems)
    .set({ checked: !item.checked })
    .where(eq(groceryItems.id, itemId));
}

export async function getActiveGroceryListSummary() {
  const [list] = await db
    .select()
    .from(groceryLists)
    .where(inArray(groceryLists.status, ["active", "draft"]))
    .orderBy(groceryLists.createdAt)
    .limit(1);

  if (!list) return null;

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      unchecked: sql<number>`count(*) filter (where not ${groceryItems.checked})::int`,
    })
    .from(groceryItems)
    .where(eq(groceryItems.listId, list.id));

  return {
    id: list.id,
    name: list.name,
    store: list.store,
    totalItems: counts?.total ?? 0,
    uncheckedItems: counts?.unchecked ?? 0,
  };
}

async function getOrCreateActiveGroceryList() {
  const [existing] = await db
    .select()
    .from(groceryLists)
    .where(inArray(groceryLists.status, ["active", "draft"]))
    .orderBy(groceryLists.createdAt)
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(groceryLists)
    .values({
      name: "Lista de compras",
      store: "Mercadona",
      status: "active",
    })
    .returning();

  return created;
}

type RecipeIngredient = {
  name: string;
  quantity?: number | string;
  unit?: string;
};

export async function addMissingIngredientsToGroceryList(recipeId: string) {
  const [recipe] = await db
    .select({ ingredients: recipes.ingredients })
    .from(recipes)
    .where(eq(recipes.id, recipeId));

  if (!recipe) return { added: [] };

  let ingredients: RecipeIngredient[];
  try {
    ingredients = JSON.parse(recipe.ingredients);
  } catch {
    return { added: [] };
  }

  // Staples that every kitchen has — never mark as missing
  const ALWAYS_AVAILABLE = new Set([
    "sal", "agua", "água", "aceite", "azeite", "vinagre",
    "pimienta", "pimenta", "water", "salt", "oil", "pepper",
  ]);

  function normalize(name: string) {
    return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  // Load all pantry items once for efficient matching
  const allPantry = await db.select({ name: pantryItems.name }).from(pantryItems);
  const pantryNormalized = allPantry.map((p) => normalize(p.name));

  // Find ingredients not in pantry
  const missing: RecipeIngredient[] = [];
  for (const ing of ingredients) {
    const norm = normalize(ing.name);

    // Skip staples
    if (ALWAYS_AVAILABLE.has(norm)) continue;
    if ([...ALWAYS_AVAILABLE].some((s) => norm.includes(s))) continue;

    // Bidirectional fuzzy match + word match
    const found = pantryNormalized.some(
      (p) => p.includes(norm) || norm.includes(p)
    );
    const words = norm.split(" ");
    const wordMatch = !found && pantryNormalized.some((p) =>
      words.some((w) => w.length >= 3 && p.includes(w))
    );

    if (!found && !wordMatch) {
      missing.push(ing);
    }
  }

  if (missing.length === 0) return { added: [] };

  const list = await getOrCreateActiveGroceryList();

  // Check which items are already on the grocery list
  const existingItems = await db
    .select({ name: groceryItems.name })
    .from(groceryItems)
    .where(eq(groceryItems.listId, list.id));
  const existingNames = new Set(existingItems.map((i) => i.name.toLowerCase()));

  const toAdd = missing.filter(
    (ing) => !existingNames.has(ing.name.toLowerCase())
  );

  if (toAdd.length === 0) return { added: [] };

  const qty = (q: number | string | undefined) =>
    typeof q === "number" ? q : typeof q === "string" ? parseFloat(q) || 1 : 1;

  await db.insert(groceryItems).values(
    toAdd.map((ing) => ({
      listId: list.id,
      name: ing.name,
      quantity: qty(ing.quantity),
      unit: ing.unit ?? undefined,
      category: "A comprar (receita)",
    }))
  );

  return { added: toAdd.map((i) => i.name), listId: list.id };
}
