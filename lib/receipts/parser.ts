import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const receiptSchema = z.object({
  store: z
    .string()
    .nullable()
    .describe("Store name (Mercadona, Carrefour, Eroski, Lidl, etc.)"),
  date: z.string().nullable().describe("Purchase date in YYYY-MM-DD format"),
  total: z.number().nullable().describe("Total amount in EUR"),
  items: z.array(
    z.object({
      name: z
        .string()
        .describe("Item name as printed on receipt (may be abbreviated)"),
      normalizedName: z
        .string()
        .describe(
          "Full readable name in Spanish (e.g., 'Leche semidesnatada Hacendado 1L')"
        ),
      quantity: z.number().describe("Quantity purchased"),
      unit: z
        .string()
        .nullable()
        .describe("Unit if applicable: kg, g, L, ml, units, pack"),
      price: z.number().describe("Price in EUR"),
      category: z
        .string()
        .nullable()
        .describe(
          "Category: produce, dairy, meat, fish, grains, frozen, beverages, snacks, cleaning, hygiene, other"
        ),
    })
  ),
});

export type ParsedReceipt = z.infer<typeof receiptSchema>;

export async function parseReceipt(imageData: string): Promise<ParsedReceipt> {
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    schema: receiptSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: imageData,
          },
          {
            type: "text",
            text: `Parse this Spanish grocery receipt. Extract every line item with its name, quantity, and price.

Important:
- Spanish supermarket receipts use heavily abbreviated names. Expand them to full readable Spanish names.
- Common abbreviations: LECH = Leche, S/DES = Semidesnatada, HAC = Hacendado, PAN = Pan, POLL = Pollo, TOMA = Tomate, CEBO = Cebolla, ACEI = Aceite, OLIV = Oliva
- Hacendado is Mercadona's store brand
- Assign each item a food category for store section grouping
- If quantity is not explicit, default to 1
- Extract the store name from the header and total from the footer`,
          },
        ],
      },
    ],
  });

  return object;
}
