"use client";

import { useState, useEffect } from "react";
import { History, Plus, Trash2, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export function ChatHeader({
  currentId,
  onSelect,
  onNew,
}: {
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      fetch("/api/conversations")
        .then((r) => r.json())
        .then(setConversations);
    }
  }, [open, currentId]);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentId === id) onNew();
  }

  return (
    <>
      <div className="flex items-center justify-between pb-2 mb-2 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(!open)}
          className="gap-1.5 text-muted-foreground text-xs"
        >
          <History className="h-3.5 w-3.5" />
          Conversas
        </Button>
        {currentId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onNew}
            className="gap-1.5 text-muted-foreground text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova
          </Button>
        )}
      </div>

      {open && (
        <div className="absolute inset-0 z-20 bg-background flex flex-col rounded-lg border shadow-lg">
          <div className="flex items-center justify-between p-3 border-b">
            <h2 className="text-sm font-semibold">Conversas</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="text-sm text-muted-foreground p-4 text-center">
                Nenhuma conversa ainda
              </p>
            )}
            {conversations.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelect(c.id);
                  setOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onSelect(c.id);
                    setOpen(false);
                  }
                }}
                className={`w-full text-left px-4 py-3 border-b text-sm hover:bg-muted/50 flex items-center gap-2 cursor-pointer ${
                  c.id === currentId ? "bg-muted" : ""
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{c.title ?? "Nova conversa"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.updatedAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(c.id, e)}
                  className="flex-shrink-0 p-1 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
