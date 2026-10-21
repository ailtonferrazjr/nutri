import { db } from "@/lib/db";
import { pantryItems } from "@/lib/db/schema";
import { and, eq, isNotNull, lte, sql } from "drizzle-orm";

export async function getPantryByCategory() {
  const items = await db.select().from(pantryItems);

  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    const category = item.category || "Outros";
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  return { items, grouped };
}

export async function getExpiringItems(withinDays: number) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + withinDays);
  const futureDateStr = futureDate.toISOString().split("T")[0];

  return db
    .select({
      id: pantryItems.id,
      name: pantryItems.name,
      category: pantryItems.category,
      quantity: pantryItems.quantity,
      unit: pantryItems.unit,
      expiresAt: pantryItems.expiresAt,
    })
    .from(pantryItems)
    .where(
      and(
        isNotNull(pantryItems.expiresAt),
        lte(pantryItems.expiresAt, futureDateStr)
      )
    )
    .orderBy(sql`${pantryItems.expiresAt} asc`);
}

export async function updatePantryItemQuantity(id: string, quantity: number) {
  if (quantity <= 0) {
    await db.delete(pantryItems).where(eq(pantryItems.id, id));
    return null;
  }
  const [updated] = await db
    .update(pantryItems)
    .set({ quantity })
    .where(eq(pantryItems.id, id))
    .returning();
  return updated;
}

export async function removePantryItem(id: string) {
  const [removed] = await db
    .delete(pantryItems)
    .where(eq(pantryItems.id, id))
    .returning();
  return removed;
}

export async function updatePantryItem(
  id: string,
  data: { name: string; category: string; unit: string }
) {
  const [updated] = await db
    .update(pantryItems)
    .set(data)
    .where(eq(pantryItems.id, id))
    .returning();
  return updated;
}

export async function addPantryItem(data: {
  name: string;
  category: string;
  quantity: number;
  unit: string;
}) {
  const [inserted] = await db
    .insert(pantryItems)
    .values({
      name: data.name,
      category: data.category,
      quantity: data.quantity,
      unit: data.unit,
      source: "manual",
    })
    .returning();
  return inserted;
}

export async function getCategories() {
  const result = await db
    .selectDistinct({ category: pantryItems.category })
    .from(pantryItems);
  return result
    .map((r) => r.category)
    .filter((c): c is string => c != null)
    .sort();
}
