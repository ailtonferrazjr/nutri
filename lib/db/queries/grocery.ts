import { eq, inArray, sql, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { groceryLists, groceryItems, recipes, pantryItems } from "@/lib/db/schema";
import {
  excludeExistingGroceryItems,
  findMissingIngredients,
  parseIngredientQuantity,
  type RecipeIngredient,
} from "@/lib/ingredients/match";

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

  const allPantry = await db.select({ name: pantryItems.name }).from(pantryItems);
  const missing = findMissingIngredients(
    ingredients,
    allPantry.map((p) => p.name)
  );

  if (missing.length === 0) return { added: [] };

  const list = await getOrCreateActiveGroceryList();

  // Check which items are already on the grocery list
  const existingItems = await db
    .select({ name: groceryItems.name })
    .from(groceryItems)
    .where(eq(groceryItems.listId, list.id));
  const toAdd = excludeExistingGroceryItems(
    missing,
    existingItems.map((i) => i.name)
  );

  if (toAdd.length === 0) return { added: [] };

  await db.insert(groceryItems).values(
    toAdd.map((ing) => ({
      listId: list.id,
      name: ing.name,
      quantity: parseIngredientQuantity(ing.quantity),
      unit: ing.unit ?? undefined,
      category: "A comprar (receita)",
    }))
  );

  return { added: toAdd.map((i) => i.name), listId: list.id };
}
