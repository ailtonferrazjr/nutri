"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { toast } from "sonner";
import {
  Send,
  Bot,
  User,
  Wrench,
  UtensilsCrossed,
  ImagePlus,
  X,
  RotateCw,
} from "lucide-react";
import { ChatHeader } from "@/components/conversation-list";
import type { UIMessage } from "ai";

const SUGGESTIONS = [
  "O que temos na despensa?",
  "Faz uma lista de compras pro Mercadona",
  "Sugere receitas pro jantar de hoje",
  "Quais sao nossas preferencias?",
];

export default function ChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [chatKey, setChatKey] = useState(0);
  const conversationIdRef = useRef<string | null>(null);

  // Keep ref in sync so the transport always reads the latest value
  conversationIdRef.current = conversationId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (url, init) => {
          // Inject current conversationId into request body
          if (init?.body && conversationIdRef.current) {
            try {
              const body = JSON.parse(init.body as string);
              body.conversationId = conversationIdRef.current;
              init = { ...init, body: JSON.stringify(body) };
            } catch {
              // body isn't JSON, skip injection
            }
          }

          const response = await fetch(url, init);
          const newId = response.headers.get("x-conversation-id");
          if (newId && !conversationIdRef.current) {
            conversationIdRef.current = newId;
            setConversationId(newId);
            window.history.replaceState({}, "", `/chat?id=${newId}`);
          }
          return response;
        },
      }),
    // stable — no dependencies, reads conversationId from ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const { messages, sendMessage, regenerate, status, setMessages, error } = useChat({
    id: String(chatKey),
    transport,
    messages: initialMessages.length > 0 ? initialMessages : undefined,
  });

  // Ensure messages are set when switching conversations —
  // useChat may not re-read the messages prop on id change
  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [chatKey, initialMessages, setMessages]);

  useEffect(() => {
    if (error) {
      toast.error("Erro ao enviar mensagem. Tente novamente em alguns segundos.");
    }
  }, [error]);

  const [input, setInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoading = status === "streaming" || status === "submitted";

  const loadConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    conversationIdRef.current = id;
    setConversationId(id);
    setInitialMessages(data.messages);
    setChatKey((k) => k + 1);
  }, []);

  // Load conversation from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) loadConversation(id);
  }, [loadConversation]);

  function handleNewConversation() {
    conversationIdRef.current = null;
    setConversationId(null);
    setInitialMessages([]);
    setChatKey((k) => k + 1);
    window.history.replaceState({}, "", "/chat");
  }

  function handleSelectConversation(id: string) {
    loadConversation(id);
    window.history.replaceState({}, "", `/chat?id=${id}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!input.trim() && !imagePreview) || isLoading) return;

    const text =
      input.trim() ||
      (imagePreview ? "Escaneia esse recibo e atualiza a despensa" : "");

    const files: Array<{
      type: "file";
      mediaType: string;
      url: string;
    }> = [];

    if (imagePreview) {
      files.push({
        type: "file",
        mediaType: "image/jpeg",
        url: imagePreview,
      });
    }

    sendMessage({
      text,
      ...(files.length > 0 ? { files } : {}),
    });
    setInput("");
    setImagePreview(null);
  }

  function handleSuggestion(text: string) {
    sendMessage({ text });
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="relative flex flex-col h-[calc(100dvh-7.5rem)]">
      <ChatHeader
        currentId={conversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <UtensilsCrossed className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-lg font-semibold mb-1">Nutri</h1>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
              Seu assistente de alimentacao. Gerencie a despensa, crie listas de
              compras, escaneie recibos e descubra receitas.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleSuggestion(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              {msg.role === "user" ? (
                <div className="h-6 w-6 rounded-full bg-foreground flex items-center justify-center">
                  <User className="h-3 w-3 text-background" />
                </div>
              ) : (
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {msg.parts?.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <div key={i} className="text-sm leading-relaxed">
                      <Markdown>{part.text}</Markdown>
                    </div>
                  );
                }
                if (part.type.startsWith("tool-")) {
                  const toolPart = part as Record<string, unknown>;
                  const toolName = (toolPart.type as string)
                    .replace("tool-invocation-", "")
                    .replace("tool-", "")
                    .replaceAll("_", " ");
                  const isRunning =
                    toolPart.state === "call" ||
                    toolPart.state === "input-streaming";
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 mr-1 mb-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      <Wrench className="h-2.5 w-2.5" />
                      {toolName}
                      {isRunning && (
                        <span className="animate-pulse">...</span>
                      )}
                    </span>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {status === "submitted" && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-3 w-3 text-primary" />
              </div>
            </div>
            <div className="flex items-center gap-1 py-2">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="relative inline-block mb-2 w-fit">
          <img
            src={imagePreview}
            alt="Receipt preview"
            className="h-20 rounded-lg border"
          />
          <button
            onClick={() => setImagePreview(null)}
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Error retry */}
      {status === "error" && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">
          <span className="flex-1">Erro ao enviar. O modelo pode estar sobrecarregado.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => regenerate()}
            className="gap-1.5 text-xs"
          >
            <RotateCw className="h-3 w-3" />
            Tentar de novo
          </Button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleImageSelect}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          title="Enviar foto de recibo"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <div className="relative flex-1">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="O que voce quer cozinhar hoje?"
            disabled={isLoading}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={isLoading || (!input.trim() && !imagePreview)}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
