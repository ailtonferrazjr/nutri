import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recipeFeedback } from "@/lib/db/schema";

export type FeedbackAction = "saved" | "favorited" | "dismissed" | "altered";

export async function saveFeedback(data: {
  suggestionId?: string;
  recipeName: string;
  action: FeedbackAction;
  reason?: string;
  detail?: string;
  tags?: string;
  ingredients?: string;
}) {
  const [inserted] = await db
    .insert(recipeFeedback)
    .values({
      suggestionId: data.suggestionId ?? undefined,
      recipeName: data.recipeName,
      action: data.action,
      reason: data.reason ?? undefined,
      detail: data.detail ?? undefined,
      tags: data.tags ?? undefined,
      ingredients: data.ingredients ?? undefined,
    })
    .returning();
  return inserted;
}

export async function getUnprocessedFeedback() {
  return db
    .select()
    .from(recipeFeedback)
    .where(eq(recipeFeedback.processed, false))
    .orderBy(recipeFeedback.createdAt);
}

export async function markFeedbackProcessed(ids: string[]) {
  for (const id of ids) {
    await db
      .update(recipeFeedback)
      .set({ processed: true })
      .where(eq(recipeFeedback.id, id));
  }
}
