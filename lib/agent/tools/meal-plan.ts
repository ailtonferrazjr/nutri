import { tool } from "ai";
import { z } from "zod";
import { rateRecipe } from "@/lib/db/queries/recipes";
import { getWeekMealPlan, upsertMealPlanEntry, deleteMealPlanEntry, completeMealPlanEntry, deductPantryFromRecipe } from "@/lib/db/queries/meal-plan";
import { addMissingIngredientsToGroceryList } from "@/lib/db/queries/grocery";

export const mealPlanTools = {
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


export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}
