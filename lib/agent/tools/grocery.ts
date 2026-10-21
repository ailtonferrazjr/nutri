import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { pantryItems, groceryLists, groceryItems } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { matchMercadona } from "./mercadona";

export const groceryTools = {
  create_grocery_list: tool({
    description:
      "Create a new grocery list. Automatically matches items to the Mercadona catalog for correct names and estimated prices.",
    inputSchema: z.object({
      name: z
        .string()
        .optional()
        .describe("List name (e.g., 'Compras da semana')"),
      store: z
        .string()
        .optional()
        .describe("Target store: Mercadona, Carrefour, Eroski, etc."),
      items: z.array(
        z.object({
          name: z.string().describe("Item name (will be matched to Mercadona catalog)"),
          quantity: z.number().optional(),
          unit: z.string().optional(),
          category: z
            .string()
            .optional()
            .describe("Store section for grouping"),
          notes: z.string().optional(),
        })
      ),
    }),
    execute: async ({ name, store, items }) => {
      const [list] = await db
        .insert(groceryLists)
        .values({
          name: name ?? "Lista de compras",
          store: store ?? "Mercadona",
          status: "active",
        })
        .returning();

      const enriched = await Promise.all(
        items.map(async (item) => {
          const match = await matchMercadona(item.name);
          return {
            listId: list.id,
            name: match?.name ?? item.name,
            quantity: item.quantity,
            unit: item.unit,
            category: item.category ?? match?.category ?? undefined,
            notes: item.notes,
            estimatedPrice: match?.price ?? undefined,
          };
        })
      );

      await db.insert(groceryItems).values(enriched);

      const totalEstimate = enriched.reduce(
        (sum, i) => sum + (i.estimatedPrice ?? 0) * (i.quantity ?? 1),
        0
      );

      return {
        listId: list.id,
        name: list.name,
        store: list.store,
        itemCount: items.length,
        estimatedTotal: `€${totalEstimate.toFixed(2)}`,
        items: enriched.map((e) => ({
          name: e.name,
          quantity: e.quantity,
          price: e.estimatedPrice ? `€${e.estimatedPrice.toFixed(2)}` : null,
          category: e.category,
        })),
      };
    },
  }),

  get_grocery_list: tool({
    description: "Get the current active grocery list with all items",
    inputSchema: z.object({
      listId: z
        .string()
        .optional()
        .describe("Specific list ID, or gets the most recent active list"),
    }),
    execute: async ({ listId }) => {
      let list;
      if (listId) {
        [list] = await db
          .select()
          .from(groceryLists)
          .where(eq(groceryLists.id, listId))
          .limit(1);
      } else {
        [list] = await db
          .select()
          .from(groceryLists)
          .where(eq(groceryLists.status, "active"))
          .orderBy(sql`${groceryLists.createdAt} desc`)
          .limit(1);
      }

      if (!list) return { error: "No active grocery list found" };

      const items = await db
        .select()
        .from(groceryItems)
        .where(eq(groceryItems.listId, list.id));

      const totalEstimate = items.reduce(
        (sum, i) => sum + (i.estimatedPrice ?? 0) * (i.quantity ?? 1),
        0
      );

      return {
        id: list.id,
        name: list.name,
        store: list.store,
        status: list.status,
        estimatedTotal: totalEstimate > 0 ? `€${totalEstimate.toFixed(2)}` : null,
        items: items.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category,
          checked: i.checked,
          estimatedPrice: i.estimatedPrice ? `€${i.estimatedPrice.toFixed(2)}` : null,
          notes: i.notes,
        })),
      };
    },
  }),

  check_grocery_item: tool({
    description:
      "Mark a grocery item as purchased (checked) and optionally add it to the pantry",
    inputSchema: z.object({
      itemId: z.string().describe("Grocery item ID"),
      addToPantry: z
        .boolean()
        .optional()
        .describe("Also add this item to the pantry (default: true)"),
    }),
    execute: async ({ itemId, addToPantry = true }) => {
      const [item] = await db
        .select()
        .from(groceryItems)
        .where(eq(groceryItems.id, itemId))
        .limit(1);

      if (!item) return { error: "Item not found" };

      await db
        .update(groceryItems)
        .set({ checked: true })
        .where(eq(groceryItems.id, itemId));

      if (addToPantry) {
        await db.insert(pantryItems).values({
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          source: "grocery_list",
        });
      }

      return { checked: item.name, addedToPantry: addToPantry };
    },
  }),
};
