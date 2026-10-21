import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { mercadonaProducts } from "@/lib/db/schema";
import { sql, and, isNotNull, gt, ilike, desc } from "drizzle-orm";

const mercadonaSelectFields = {
  id: mercadonaProducts.id,
  name: mercadonaProducts.displayName,
  category: mercadonaProducts.categoryName,
  price: mercadonaProducts.unitPrice,
  unitName: mercadonaProducts.unitName,
  unitSize: mercadonaProducts.unitSize,
  sizeFormat: mercadonaProducts.sizeFormat,
};

/**
 * Match an item name to a Mercadona product.
 * Combines full-text search relevance with name-length proximity
 * so "pollo" → "Pechuga de pollo" instead of "Sazonador para pollo y costillas".
 */
export async function matchMercadona(name: string) {
  // 1. Full-text search ranked by relevance ÷ name length (shorter = more direct match)
  const [fts] = await db
    .select(mercadonaSelectFields)
    .from(mercadonaProducts)
    .where(
      sql`to_tsvector('spanish', ${mercadonaProducts.displayName}) @@ plainto_tsquery('spanish', ${name})`
    )
    .orderBy(
      sql`ts_rank(to_tsvector('spanish', ${mercadonaProducts.displayName}), plainto_tsquery('spanish', ${name})) / length(${mercadonaProducts.displayName}) desc`
    )
    .limit(1);

  if (fts) return fts;

  // 2. Fallback: ILIKE, prefer shortest name (most direct product)
  const [fuzzy] = await db
    .select(mercadonaSelectFields)
    .from(mercadonaProducts)
    .where(ilike(mercadonaProducts.displayName, `%${name}%`))
    .orderBy(sql`length(${mercadonaProducts.displayName}) asc`)
    .limit(1);

  return fuzzy ?? null;
}

export const mercadonaTools = {
  search_mercadona: tool({
    description:
      "Search the Mercadona product catalog by name or category. Returns real products with prices available at the configured local store. Use this to find specific products, compare prices, check what's available, or estimate grocery costs.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe(
          "Search term for product name (e.g., 'leche', 'pollo', 'pasta')"
        ),
      category: z
        .string()
        .optional()
        .describe(
          "Filter by category name (e.g., 'Carne', 'Fruta y verdura', 'Congelados')"
        ),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Max results to return (default: 20)"),
    }),
    execute: async ({ query, category, limit }) => {
      const conditions = [];

      if (query) {
        conditions.push(
          sql`to_tsvector('spanish', ${mercadonaProducts.displayName}) @@ plainto_tsquery('spanish', ${query})`
        );
      }

      if (category) {
        conditions.push(
          ilike(mercadonaProducts.categoryName, `%${category}%`)
        );
      }

      const results = await db
        .select({
          id: mercadonaProducts.id,
          name: mercadonaProducts.displayName,
          category: mercadonaProducts.categoryName,
          price: mercadonaProducts.unitPrice,
          pricePerUnit: mercadonaProducts.bulkPrice,
          sizeFormat: mercadonaProducts.sizeFormat,
          unitName: mercadonaProducts.unitName,
          unitSize: mercadonaProducts.unitSize,
          packaging: mercadonaProducts.packaging,
          isPack: mercadonaProducts.isPack,
          previousPrice: mercadonaProducts.previousUnitPrice,
          thumbnail: mercadonaProducts.thumbnail,
        })
        .from(mercadonaProducts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(
          query
            ? sql`ts_rank(to_tsvector('spanish', ${mercadonaProducts.displayName}), plainto_tsquery('spanish', ${query})) desc`
            : mercadonaProducts.displayName
        )
        .limit(limit ?? 20);

      return {
        count: results.length,
        products: results.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          price: `€${p.price?.toFixed(2)}`,
          pricePerUnit: p.pricePerUnit
            ? `€${p.pricePerUnit.toFixed(2)}/${p.sizeFormat ?? "ud"}`
            : null,
          packaging: [p.unitSize, p.unitName].filter(Boolean).join(" ") || p.packaging,
          onSale:
            p.previousPrice && p.price && p.previousPrice > p.price
              ? `was €${p.previousPrice.toFixed(2)}`
              : null,
        })),
      };
    },
  }),

  get_mercadona_deals: tool({
    description:
      "Get current Mercadona products on sale (price drops). Useful for suggesting budget-friendly meals or finding good deals for the grocery list.",
    inputSchema: z.object({
      category: z
        .string()
        .optional()
        .describe(
          "Filter deals by category (e.g., 'Carne', 'Lácteos', 'Congelados')"
        ),
      limit: z
        .number()
        .optional()
        .default(15)
        .describe("Max results (default: 15)"),
    }),
    execute: async ({ category, limit }) => {
      const conditions = [
        isNotNull(mercadonaProducts.previousUnitPrice),
        gt(mercadonaProducts.previousUnitPrice, mercadonaProducts.unitPrice),
      ];

      if (category) {
        conditions.push(
          ilike(mercadonaProducts.categoryName, `%${category}%`)
        );
      }

      const results = await db
        .select({
          id: mercadonaProducts.id,
          name: mercadonaProducts.displayName,
          category: mercadonaProducts.categoryName,
          price: mercadonaProducts.unitPrice,
          previousPrice: mercadonaProducts.previousUnitPrice,
          pricePerUnit: mercadonaProducts.bulkPrice,
          sizeFormat: mercadonaProducts.sizeFormat,
          unitName: mercadonaProducts.unitName,
          unitSize: mercadonaProducts.unitSize,
        })
        .from(mercadonaProducts)
        .where(and(...conditions))
        .orderBy(
          sql`(${mercadonaProducts.previousUnitPrice} - ${mercadonaProducts.unitPrice}) desc`
        )
        .limit(limit ?? 15);

      return {
        count: results.length,
        deals: results.map((p) => ({
          name: p.name,
          category: p.category,
          price: `€${p.price?.toFixed(2)}`,
          was: `€${p.previousPrice?.toFixed(2)}`,
          saving: `€${((p.previousPrice ?? 0) - (p.price ?? 0)).toFixed(2)}`,
          packaging: [p.unitSize, p.unitName].filter(Boolean).join(" "),
        })),
      };
    },
  }),
};
