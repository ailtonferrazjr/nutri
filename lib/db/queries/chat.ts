import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import type { UIMessage } from "ai";

export async function getConversations(limit = 20) {
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
}

export async function getConversation(id: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  if (!conversation) return null;

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  return {
    ...conversation,
    messages: msgs.map(
      (m) =>
        ({
          id: m.id,
          role: m.role as UIMessage["role"],
          parts: m.parts as UIMessage["parts"],
        }) satisfies UIMessage
    ),
  };
}

export async function createConversation(title?: string) {
  const [conversation] = await db
    .insert(conversations)
    .values({ title })
    .returning();
  return conversation;
}

export async function saveMessages(
  conversationId: string,
  msgs: UIMessage[]
) {
  if (msgs.length === 0) return;

  await db
    .insert(messages)
    .values(
      msgs.map((m) => ({
        id: m.id,
        conversationId,
        role: m.role,
        parts: m.parts,
      }))
    )
    .onConflictDoNothing();

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function updateConversationTitle(id: string, title: string) {
  await db
    .update(conversations)
    .set({ title })
    .where(eq(conversations.id, id));
}

export async function deleteConversation(id: string) {
  await db.delete(conversations).where(eq(conversations.id, id));
}
