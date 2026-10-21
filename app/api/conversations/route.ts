import { getConversations } from "@/lib/db/queries/chat";

export async function GET() {
  const conversations = await getConversations();
  return Response.json(conversations);
}
