import { anthropic } from "@ai-sdk/anthropic";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  generateId,
  type UIMessage,
} from "ai";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { buildDynamicContext } from "@/lib/agent/context";
import { agentTools } from "@/lib/agent/tools";
import {
  createConversation,
  saveMessages,
  updateConversationTitle,
} from "@/lib/db/queries/chat";

export const maxDuration = 60;

const MODEL = anthropic("claude-sonnet-4-20250514");

const CACHE_CONTROL = {
  anthropic: { cacheControl: { type: "ephemeral" as const } },
};

/** Add cacheControl to the last tool so all tool definitions get cached. */
function withToolCaching(tools: typeof agentTools): typeof agentTools {
  const entries = Object.entries(tools);
  const lastKey = entries[entries.length - 1]?.[0];
  if (!lastKey) return tools;

  const lastTool = tools[lastKey as keyof typeof tools];
  return {
    ...tools,
    [lastKey]: {
      ...lastTool,
      providerOptions: CACHE_CONTROL,
    },
  } as typeof agentTools;
}

function buildSystem(dynamicContext: string) {
  return [
    {
      role: "system" as const,
      content: SYSTEM_PROMPT,
      providerOptions: CACHE_CONTROL,
    },
    ...(dynamicContext
      ? [{ role: "system" as const, content: dynamicContext }]
      : []),
  ];
}

export async function POST(req: Request) {
  let conversationId: string;
  let messages: UIMessage[];
  let isNewConversation: boolean;

  try {
    const body = (await req.json()) as {
      messages: UIMessage[];
      conversationId?: string;
    };
    messages = body.messages;
    const existingConversationId = body.conversationId;

    if (existingConversationId) {
      conversationId = existingConversationId;
      isNewConversation = false;
    } else {
      const conv = await createConversation();
      conversationId = conv.id;
      isNewConversation = true;
    }
  } catch (e) {
    console.error("[chat] failed to initialize conversation:", e);
    return new Response(
      JSON.stringify({ error: "Erro ao inicializar conversa" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let dynamicContext: string;
  try {
    dynamicContext = await buildDynamicContext();
  } catch (e) {
    console.error("[chat] failed to build dynamic context:", e);
    dynamicContext = "";
  }

  const modelMessages = await convertToModelMessages(messages);
  const system = buildSystem(dynamicContext);
  const tools = withToolCaching(agentTools);

  const result = streamText({
    model: MODEL,
    system,
    messages: modelMessages,
    tools,
    maxRetries: 3,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    generateMessageId: generateId,
    originalMessages: messages,
    onFinish: async ({ responseMessage }) => {
      try {
        await saveMessages(conversationId, [...messages, responseMessage]);

        if (isNewConversation) {
          const firstText = messages[messages.length - 1]?.parts
            ?.find(
              (p): p is { type: "text"; text: string } => p.type === "text"
            )
            ?.text;
          if (firstText) {
            await updateConversationTitle(
              conversationId,
              firstText.slice(0, 60)
            );
          }
        }
      } catch (e) {
        console.error("[chat] failed to save messages:", e);
      }
    },
    headers: { "x-conversation-id": conversationId },
  });
}
