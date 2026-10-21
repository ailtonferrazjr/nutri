"use client";

import { useState, useRef, useTransition } from "react";
import { Minus, Plus, Trash2, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateQuantityAction, removeItemAction } from "./actions";

export interface PantryItemData {
  id: string;
  name: string;
  displayName: string | null;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  expiresAt: string | null;
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function getStep(quantity: number | null): number {
  if (quantity == null) return 1;
  return Number.isInteger(quantity) && quantity >= 1 ? 1 : 0.5;
}

export function PantryItem({
  item,
  onRemoved,
  onEdit,
}: {
  item: PantryItemData;
  onRemoved?: (id: string) => void;
  onEdit?: (item: PantryItemData) => void;
}) {
  const [qty, setQty] = useState(item.quantity ?? 1);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const step = getStep(qty);

  function handleDecrement() {
    const newQty = Math.max(0, qty - step);
    if (newQty <= 0) {
      handleRemove();
      return;
    }
    setQty(newQty);
    startTransition(() => updateQuantityAction(item.id, newQty));
  }

  function handleIncrement() {
    const newQty = qty + step;
    setQty(newQty);
    startTransition(() => updateQuantityAction(item.id, newQty));
  }

  function handleQtyClick() {
    setEditValue(String(qty));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function handleEditSubmit() {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed) && parsed > 0) {
      setQty(parsed);
      startTransition(() => updateQuantityAction(item.id, parsed));
    }
    setEditing(false);
  }

  function handleRemove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      deleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 2000);
      return;
    }
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    onRemoved?.(item.id);
    startTransition(() => removeItemAction(item.id));
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-2 transition-opacity",
        isPending && "opacity-50"
      )}
    >
      <button
        type="button"
        className="flex-1 min-w-0 text-left"
        onClick={() => onEdit?.(item)}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{item.name}</span>
          {item.unit && (
            <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
              {item.unit}
            </span>
          )}
          {isExpired(item.expiresAt) && (
            <Badge variant="destructive" className="text-[10px]">
              Vencido
            </Badge>
          )}
          {isExpiringSoon(item.expiresAt) && (
            <Badge
              variant="outline"
              className="text-[10px] border-orange-300 text-orange-600"
            >
              Vence logo
            </Badge>
          )}
        </div>
        {item.displayName && (
          <span className="text-xs text-muted-foreground italic">
            {item.displayName}
          </span>
        )}
      </button>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleDecrement}
          disabled={isPending}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>

        {editing ? (
          <input
            ref={inputRef}
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleEditSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEditSubmit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-12 text-center text-sm bg-muted rounded px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            step={step}
            min={0}
          />
        ) : (
          <button
            type="button"
            onClick={handleQtyClick}
            className="min-w-8 text-center text-sm text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5"
          >
            {qty}
          </button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleIncrement}
          disabled={isPending}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7 ml-1",
            confirmDelete
              ? "text-destructive hover:text-destructive"
              : "text-muted-foreground"
          )}
          onClick={handleRemove}
          disabled={isPending}
        >
          {confirmDelete ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
