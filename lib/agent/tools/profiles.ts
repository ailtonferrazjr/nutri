import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const profileTools = {
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
};
