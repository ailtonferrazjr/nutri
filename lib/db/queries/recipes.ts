import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { recipes } from "@/lib/db/schema";

export async function getRecipes() {
  return db.select().from(recipes).orderBy(desc(recipes.favorite), desc(recipes.createdAt));
}

export async function getFavoriteRecipes() {
  return db.select().from(recipes).where(eq(recipes.favorite, true));
}

export async function toggleFavorite(id: string) {
  const [recipe] = await db.select({ favorite: recipes.favorite }).from(recipes).where(eq(recipes.id, id));
  if (!recipe) return null;
  const [updated] = await db
    .update(recipes)
    .set({ favorite: !recipe.favorite })
    .where(eq(recipes.id, id))
    .returning();
  return updated;
}

export async function getRecipeById(id: string) {
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(eq(recipes.id, id));

  return recipe ?? null;
}

export async function searchRecipes(query?: string, tags?: string) {
  const conditions = [];

  if (query) {
    conditions.push(
      or(
        ilike(recipes.name, `%${query}%`),
        ilike(recipes.description, `%${query}%`)
      )
    );
  }

  if (tags) {
    conditions.push(ilike(recipes.tags, `%${tags}%`));
  }

  return db
    .select()
    .from(recipes)
    .where(conditions.length > 0 ? sql`${conditions.reduce((a, b) => sql`${a} AND ${b}`)}` : undefined)
    .orderBy(desc(recipes.createdAt))
    .limit(20);
}

export async function createRecipe(data: {
  name: string;
  description?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: string;
  instructions: string;
  tags?: string;
  nutrition?: string;
  source?: string;
}) {
  const tags = normalizeTags(data.tags);

  const [recipe] = await db
    .insert(recipes)
    .values({
      name: data.name,
      description: data.description,
      servings: data.servings ?? 2,
      prepMinutes: data.prepMinutes,
      cookMinutes: data.cookMinutes,
      ingredients: data.ingredients,
      instructions: data.instructions,
      tags,
      nutrition: data.nutrition,
      source: data.source ?? "generated",
    })
    .returning();
  return recipe;
}

function normalizeTags(tags?: string): string | undefined {
  if (!tags) return undefined;
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? JSON.stringify(parsed) : tags;
  } catch {
    return JSON.stringify(
      tags.split(",").map((t) => t.trim()).filter(Boolean)
    );
  }
}

export async function rateRecipe(id: string, rating: number) {
  const [recipe] = await db
    .update(recipes)
    .set({ rating })
    .where(eq(recipes.id, id))
    .returning();
  return recipe ?? null;
}

export async function updateRecipe(
  id: string,
  data: {
    name?: string;
    description?: string;
    servings?: number;
    prepMinutes?: number;
    cookMinutes?: number;
    ingredients?: string;
    instructions?: string;
    tags?: string;
    nutrition?: string;
  }
) {
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.servings !== undefined) updates.servings = data.servings;
  if (data.prepMinutes !== undefined) updates.prepMinutes = data.prepMinutes;
  if (data.cookMinutes !== undefined) updates.cookMinutes = data.cookMinutes;
  if (data.ingredients !== undefined) updates.ingredients = data.ingredients;
  if (data.instructions !== undefined) updates.instructions = data.instructions;
  if (data.tags !== undefined) updates.tags = normalizeTags(data.tags);
  if (data.nutrition !== undefined) updates.nutrition = data.nutrition;

  if (Object.keys(updates).length === 0) return null;

  const [recipe] = await db
    .update(recipes)
    .set(updates)
    .where(eq(recipes.id, id))
    .returning();

  return recipe ?? null;
}
