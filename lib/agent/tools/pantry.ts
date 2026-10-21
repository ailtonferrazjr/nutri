import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { pantryItems } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { matchMercadona } from "./mercadona";

export const pantryTools = {
  get_pantry: tool({
    description:
      "List current pantry items, optionally filtered by category. Shows what food is available at home.",
    inputSchema: z.object({
      category: z
        .string()
        .optional()
        .describe(
          "Filter by category: produce, dairy, meat, grains, frozen, etc."
        ),
    }),
    execute: async ({ category }) => {
      let query = db.select().from(pantryItems);
      if (category) {
        query = query.where(
          sql`lower(${pantryItems.category}) = lower(${category})`
        ) as typeof query;
      }
      const items = await query;
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        expiresAt: item.expiresAt,
        source: item.source,
      }));
    },
  }),

  add_pantry_item: tool({
    description:
      "Add one or more items to the pantry. Automatically matches against Mercadona catalog for correct product names and categories.",
    inputSchema: z.object({
      items: z.array(
        z.object({
          name: z.string().describe("Item name (will be matched to Mercadona catalog)"),
          category: z
            .string()
            .optional()
            .describe("Category: produce, dairy, meat, grains, frozen, etc."),
          quantity: z.number().optional().describe("Quantity"),
          unit: z
            .string()
            .optional()
            .describe("Unit: kg, g, L, ml, units, pack"),
          expiresAt: z
            .string()
            .optional()
            .describe("Expiration date (YYYY-MM-DD)"),
        })
      ),
    }),
    execute: async ({ items }) => {
      const enriched = await Promise.all(
        items.map(async (item) => {
          const match = await matchMercadona(item.name);
          return {
            name: match?.name ?? item.name,
            category: item.category ?? match?.category ?? undefined,
            quantity: item.quantity,
            unit: item.unit ?? (match ? [match.unitSize, match.unitName].filter(Boolean).join(" ") || undefined : undefined),
            expiresAt: item.expiresAt,
            source: "manual" as const,
            originalName: match ? item.name : undefined,
          };
        })
      );

      const inserted = await db
        .insert(pantryItems)
        .values(
          enriched.map(({ originalName: _, ...rest }) => rest)
        )
        .returning();

      return {
        added: inserted.length,
        items: enriched.map((e) => ({
          name: e.name,
          matched: e.originalName ? `"${e.originalName}" → "${e.name}"` : null,
          category: e.category,
        })),
      };
    },
  }),

  remove_pantry_item: tool({
    description: "Remove an item from the pantry or reduce its quantity",
    inputSchema: z.object({
      id: z.string().describe("Pantry item ID"),
      reduceBy: z
        .number()
        .optional()
        .describe(
          "Reduce quantity by this amount instead of removing entirely"
        ),
    }),
    execute: async ({ id, reduceBy }) => {
      if (reduceBy !== undefined) {
        const existing = await db
          .select()
          .from(pantryItems)
          .where(eq(pantryItems.id, id))
          .limit(1);

        if (existing.length === 0) return { error: "Item not found" };

        const newQty = (existing[0].quantity ?? 0) - reduceBy;
        if (newQty <= 0) {
          await db.delete(pantryItems).where(eq(pantryItems.id, id));
          return { removed: existing[0].name };
        }

        await db
          .update(pantryItems)
          .set({ quantity: newQty })
          .where(eq(pantryItems.id, id));
        return { updated: existing[0].name, newQuantity: newQty };
      }

      const deleted = await db
        .delete(pantryItems)
        .where(eq(pantryItems.id, id))
        .returning();
      return deleted.length > 0
        ? { removed: deleted[0].name }
        : { error: "Item not found" };
    },
  }),
};
