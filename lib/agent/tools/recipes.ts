import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { pantryItems, recipes } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { searchRecipes, createRecipe, updateRecipe, rateRecipe } from "@/lib/db/queries/recipes";
import { getRecentMealHistory } from "@/lib/db/queries/meal-plan";

export const recipeTools = {
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
};
