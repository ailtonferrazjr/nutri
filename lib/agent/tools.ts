import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  users,
  pantryItems,
  groceryLists,
  groceryItems,
  receipts,
  receiptItems,
  mercadonaProducts,
  mercadonaCategories,
  recipes,
  mealPlan,
} from "@/lib/db/schema";
import { eq, sql, and, isNotNull, gt, ilike, desc } from "drizzle-orm";
import { parseReceipt } from "@/lib/receipts/parser";
import { searchRecipes, createRecipe, updateRecipe, rateRecipe } from "@/lib/db/queries/recipes";
import {
  getWeekMealPlan,
  upsertMealPlanEntry,
  deleteMealPlanEntry,
  completeMealPlanEntry,
  getRecentMealHistory,
  deductPantryFromRecipe,
} from "@/lib/db/queries/meal-plan";
import { addMissingIngredientsToGroceryList } from "@/lib/db/queries/grocery";

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
async function matchMercadona(name: string) {
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

export const agentTools = {
  get_user_profiles: tool({
    description:
      "Get dietary profiles for both people in the household. Returns allergies, restrictions, preferences (likes, dislikes, cuisines, mealTiming, cookingSkill, budget), and health goals (goals, conditions).",
    inputSchema: z.object({}),
    execute: async () => {
      const rows = await db.select().from(users);
      return rows.map((u) => ({
        id: u.id,
        name: u.name,
        restrictions: JSON.parse(u.restrictions ?? "[]") as string[],
        preferences: JSON.parse(u.preferences ?? "{}") as Record<string, unknown>,
        healthGoals: JSON.parse(u.healthGoals ?? "{}") as Record<string, unknown>,
      }));
    },
  }),

  update_user_profile: tool({
    description:
      "Update dietary profile for a user. Restrictions are absolute (allergies, intolerances — never suggest). Preferences shape suggestions (likes, dislikes, cuisines, timing). Health goals guide nutritional advice.",
    inputSchema: z.object({
      name: z.string().describe("Profile name as returned by get_user_profiles"),
      restrictions: z
        .array(z.string())
        .optional()
        .describe("Absolute dietary restrictions and allergies (e.g., vegetariano, alergia-amendoim). Never suggest foods that violate these."),
      preferences: z
        .object({
          likes: z.array(z.string()).optional().describe("Foods and ingredients the user enjoys"),
          dislikes: z.array(z.string()).optional().describe("Foods to avoid unless explicitly requested"),
          cuisines: z.array(z.string()).optional().describe("Preferred cuisines (e.g., italiana, mexicana, japonesa)"),
          mealTiming: z.string().optional().describe("Eating schedule notes (e.g., jantar cedo e leve, jejum intermitente)"),
          cookingSkill: z.enum(["beginner", "intermediate", "advanced"]).optional(),
          budget: z.string().optional().describe("Budget preference (e.g., econômico, moderado, sem limite)"),
          notes: z.string().optional().describe("Any other preference notes"),
        })
        .optional()
        .describe("Preferences that shape meal suggestions — merged with existing data"),
      healthGoals: z
        .object({
          goals: z.array(z.string()).optional().describe("Nutritional goals (e.g., perder peso, ganhar massa, mais energia)"),
          conditions: z.array(z.string()).optional().describe("Health conditions relevant to diet (e.g., diabetes, hipertensão)"),
        })
        .optional()
        .describe("Health goals and conditions that guide nutritional recommendations"),
    }),
    execute: async ({ name, restrictions, preferences, healthGoals }) => {
      const existing = await db
        .select()
        .from(users)
        .where(sql`lower(${users.name}) = lower(${name})`)
        .limit(1);

      if (existing.length === 0) {
        return { error: `User "${name}" not found` };
      }

      const updates: Record<string, string | Date> = {
        updatedAt: new Date(),
      };
      if (restrictions !== undefined)
        updates.restrictions = JSON.stringify(restrictions);
      if (preferences !== undefined) {
        const current = JSON.parse(existing[0].preferences ?? "{}");
        updates.preferences = JSON.stringify({ ...current, ...preferences });
      }
      if (healthGoals !== undefined) {
        const current = JSON.parse(existing[0].healthGoals ?? "{}");
        updates.healthGoals = JSON.stringify({ ...current, ...healthGoals });
      }

      await db.update(users).set(updates).where(eq(users.id, existing[0].id));

      return { success: true, name, updated: Object.keys(updates) };
    },
  }),

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

  // --- Recipe Tools ---

  create_recipe: tool({
    description:
      "Save a recipe to the database. Use after proposing a recipe and getting user approval, or when the user asks to save one.",
    inputSchema: z.object({
      name: z.string().describe("Recipe name"),
      description: z.string().optional().describe("Short description"),
      servings: z.number().optional().describe("Number of servings (default: 2)"),
      prepMinutes: z.number().optional().describe("Prep time in minutes"),
      cookMinutes: z.number().optional().describe("Cook time in minutes"),
      ingredients: z
        .string()
        .describe(
          'JSON array of ingredients: [{"name":"...", "quantity":"...", "unit":"..."}]'
        ),
      instructions: z
        .string()
        .describe("Step-by-step instructions, one per line"),
      tags: z
        .string()
        .optional()
        .describe(
          "Comma-separated tags: rapida, vegetariana, airfryer, forno, etc."
        ),
      nutrition: z
        .string()
        .optional()
        .describe(
          'JSON string with estimated nutrition: {"calories":..., "protein":..., "carbs":..., "fat":...}'
        ),
    }),
    execute: async (input) => {
      const recipe = await createRecipe(input);
      return {
        id: recipe.id,
        name: recipe.name,
        tags: recipe.tags,
        saved: true,
      };
    },
  }),

  update_recipe: tool({
    description:
      "Update an existing recipe. Use when the user wants to modify ingredients, instructions, or other details of a saved recipe. Only send the fields that need to change.",
    inputSchema: z.object({
      id: z.string().describe("Recipe ID to update"),
      name: z.string().optional().describe("New recipe name"),
      description: z.string().optional().describe("New short description"),
      servings: z.number().optional().describe("New number of servings"),
      prepMinutes: z.number().optional().describe("New prep time in minutes"),
      cookMinutes: z.number().optional().describe("New cook time in minutes"),
      ingredients: z
        .string()
        .optional()
        .describe(
          'Full updated JSON array of ingredients: [{"name":"...", "quantity":"...", "unit":"..."}]'
        ),
      instructions: z
        .string()
        .optional()
        .describe("Full updated step-by-step instructions"),
      tags: z
        .string()
        .optional()
        .describe("Comma-separated tags"),
      nutrition: z
        .string()
        .optional()
        .describe(
          'JSON string with estimated nutrition: {"calories":..., "protein":..., "carbs":..., "fat":...}'
        ),
    }),
    execute: async ({ id, ...data }) => {
      const recipe = await updateRecipe(id, data);
      if (!recipe) return { error: "Recipe not found" };
      return {
        id: recipe.id,
        name: recipe.name,
        tags: recipe.tags,
        updated: true,
      };
    },
  }),

  search_recipes: tool({
    description:
      "Search saved recipes by name, description, or tags. Use to find existing recipes before suggesting new ones.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Search text for name/description"),
      tags: z
        .string()
        .optional()
        .describe("Filter by tag (e.g., 'vegetariana', 'rapida', 'airfryer')"),
    }),
    execute: async ({ query, tags }) => {
      const results = await searchRecipes(query, tags);
      return {
        count: results.length,
        recipes: results.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          tags: r.tags,
          prepMinutes: r.prepMinutes,
          cookMinutes: r.cookMinutes,
          servings: r.servings,
          rating: r.rating,
        })),
      };
    },
  }),

  rate_recipe: tool({
    description:
      "Rate a recipe from 1-5. Use after the user tries a recipe and gives feedback. Helps prioritize favorites in future suggestions.",
    inputSchema: z.object({
      id: z.string().describe("Recipe ID"),
      rating: z
        .number()
        .min(1)
        .max(5)
        .describe("Rating from 1 (bad) to 5 (loved it)"),
    }),
    execute: async ({ id, rating }) => {
      const recipe = await rateRecipe(id, rating);
      if (!recipe) return { error: "Recipe not found" };
      return { id: recipe.id, name: recipe.name, rating: recipe.rating };
    },
  }),

  complete_meal: tool({
    description:
      "Mark a meal plan entry as completed. Optionally add notes/feedback, rate the linked recipe, and deduct used ingredients from the pantry. Use when the user says they made/ate a planned meal.",
    inputSchema: z.object({
      id: z.string().describe("Meal plan entry ID"),
      notes: z
        .string()
        .optional()
        .describe("Feedback or notes (e.g., 'ficou ótimo', 'próxima vez mais sal')"),
      rating: z
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe("Rate the recipe 1-5 (only if meal has a linked recipe)"),
      deductFromPantry: z
        .boolean()
        .optional()
        .describe("Deduct recipe ingredients from pantry (default: true). Set false to skip deduction."),
    }),
    execute: async ({ id, notes, rating, deductFromPantry = true }) => {
      const entry = await completeMealPlanEntry(id, { notes });
      if (!entry) return { error: "Meal plan entry not found" };

      if (rating && entry.recipeId) {
        await rateRecipe(entry.recipeId, rating);
      }

      let pantryResult = null;
      if (deductFromPantry && entry.recipeId) {
        const { deductions, unmatched } = await deductPantryFromRecipe(entry.recipeId);
        pantryResult = {
          deducted: deductions.map((d) => ({
            item: d.pantryItemName,
            ingredient: d.ingredientName,
            qty: `${d.previousQty} → ${d.newQty ?? "removed"}`,
          })),
          unmatched,
        };
      }

      return {
        completed: true,
        date: entry.date,
        mealType: entry.mealType,
        notes: entry.notes,
        recipeRated: rating && entry.recipeId ? rating : null,
        pantry: pantryResult,
      };
    },
  }),

  suggest_recipes_from_pantry: tool({
    description:
      "Get current pantry items and saved recipes to suggest meals. Returns raw data for you to reason about what can be made with available ingredients.",
    inputSchema: z.object({
      mealType: z
        .string()
        .optional()
        .describe("Filter suggestions by meal type: cafe, almoco, lanche, jantar"),
    }),
    execute: async ({ mealType }) => {
      const [items, savedRecipes, recentMeals] = await Promise.all([
        db
          .select({
            name: pantryItems.name,
            category: pantryItems.category,
            quantity: pantryItems.quantity,
            unit: pantryItems.unit,
            expiresAt: pantryItems.expiresAt,
          })
          .from(pantryItems),
        db
          .select({
            id: recipes.id,
            name: recipes.name,
            tags: recipes.tags,
            ingredients: recipes.ingredients,
            prepMinutes: recipes.prepMinutes,
            cookMinutes: recipes.cookMinutes,
            rating: recipes.rating,
          })
          .from(recipes)
          .orderBy(desc(recipes.createdAt))
          .limit(30),
        getRecentMealHistory(2),
      ]);

      return {
        pantryItems: items.map((i) => ({
          name: i.name,
          category: i.category,
          quantity: i.quantity ? `${i.quantity} ${i.unit ?? ""}`.trim() : null,
          expiresAt: i.expiresAt,
        })),
        savedRecipes: savedRecipes.map((r) => ({
          id: r.id,
          name: r.name,
          tags: r.tags,
          prepMinutes: r.prepMinutes,
          cookMinutes: r.cookMinutes,
          rating: r.rating,
        })),
        recentMeals: recentMeals.map((m) => ({
          date: m.date,
          mealType: m.mealType,
          name: m.recipeName ?? m.description,
          forUser: m.forUser,
          notes: m.notes,
        })),
        hint: mealType
          ? `User is looking for ${mealType} suggestions. Check recentMeals to avoid repetition.`
          : "Suggest based on what's available and expiring soon. Check recentMeals to avoid repetition.",
      };
    },
  }),

  // --- Meal Plan Tools ---

  get_meal_plan: tool({
    description:
      "Get the meal plan for a given week. Returns all planned meals with recipes and assignments.",
    inputSchema: z.object({
      weekStart: z
        .string()
        .optional()
        .describe(
          "Monday of the week (YYYY-MM-DD). Defaults to current week."
        ),
    }),
    execute: async ({ weekStart }) => {
      const start =
        weekStart ?? getMonday(new Date()).toISOString().split("T")[0];
      const entries = await getWeekMealPlan(start);

      const byDate: Record<
        string,
        Array<{
          id: string;
          mealType: string;
          description: string | null;
          recipeName: string | null;
          forUser: string | null;
          completed: boolean | null;
        }>
      > = {};

      for (const entry of entries) {
        if (!byDate[entry.date]) byDate[entry.date] = [];
        byDate[entry.date].push({
          id: entry.id,
          mealType: entry.mealType,
          description: entry.description,
          recipeName: entry.recipeName,
          forUser: entry.forUser,
          completed: entry.completed,
        });
      }

      return { weekStart: start, days: byDate };
    },
  }),

  set_meal_plan_entry: tool({
    description:
      "Add or update a meal in the weekly plan. If an entry already exists for the same date, meal type, and user, it will be updated.",
    inputSchema: z.object({
      date: z.string().describe("Date (YYYY-MM-DD)"),
      mealType: z
        .string()
        .describe("Meal type: cafe, almoco, lanche, jantar"),
      description: z
        .string()
        .optional()
        .describe("Meal description (used when no recipe)"),
      recipeId: z
        .string()
        .optional()
        .describe("Recipe ID to link to this meal"),
      forUser: z
        .string()
        .optional()
        .describe("Who this meal is for: a profile name in lowercase, or both (default: both)"),
    }),
    execute: async (input) => {
      const entry = await upsertMealPlanEntry(input);

      let addedToGrocery: string[] = [];
      if (input.recipeId) {
        const { added } = await addMissingIngredientsToGroceryList(input.recipeId);
        addedToGrocery = added;
      }

      return {
        id: entry.id,
        date: entry.date,
        mealType: entry.mealType,
        description: entry.description,
        forUser: entry.forUser,
        saved: true,
        ...(addedToGrocery.length > 0 && {
          addedToGroceryList: addedToGrocery,
          note: `Ingredientes que faltam na despensa foram adicionados à lista de compras: ${addedToGrocery.join(", ")}`,
        }),
      };
    },
  }),

  remove_meal_plan_entry: tool({
    description: "Remove a meal from the weekly plan",
    inputSchema: z.object({
      id: z.string().describe("Meal plan entry ID"),
    }),
    execute: async ({ id }) => {
      const deleted = await deleteMealPlanEntry(id);
      return deleted
        ? { removed: true, date: deleted.date, mealType: deleted.mealType }
        : { error: "Entry not found" };
    },
  }),
};

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}
