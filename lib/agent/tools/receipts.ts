import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { pantryItems, receipts, receiptItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseReceipt } from "@/lib/receipts/parser";

export const receiptTools = {
  scan_receipt: tool({
    description:
      "Parse a grocery receipt image. The image should be provided in the chat message. This tool extracts items, prices, and store info, then updates the pantry.",
    inputSchema: z.object({
      imageData: z
        .string()
        .describe("Base64 encoded image data or data URL of the receipt"),
    }),
    execute: async ({ imageData }) => {
      const parsed = await parseReceipt(imageData);

      const receipt = await db
        .insert(receipts)
        .values({
          store: parsed.store,
          total: parsed.total,
          date: parsed.date,
          rawParsed: JSON.stringify(parsed),
        })
        .returning();

      const receiptId = receipt[0].id;

      for (const item of parsed.items) {
        const [receiptItem] = await db
          .insert(receiptItems)
          .values({
            receiptId,
            name: item.name,
            normalizedName: item.normalizedName,
            quantity: item.quantity,
            price: item.price,
          })
          .returning();

        const [pantryItem] = await db
          .insert(pantryItems)
          .values({
            name: item.normalizedName || item.name,
            category: item.category,
            quantity: item.quantity,
            unit: item.unit,
            source: "receipt",
            receiptId,
          })
          .returning();

        await db
          .update(receiptItems)
          .set({ pantryItemId: pantryItem.id })
          .where(eq(receiptItems.id, receiptItem.id));
      }

      return {
        store: parsed.store,
        date: parsed.date,
        total: parsed.total,
        itemCount: parsed.items.length,
        items: parsed.items.map((i) => i.normalizedName || i.name),
      };
    },
  }),
};
