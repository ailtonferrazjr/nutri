"use client";

import { useOptimistic, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toggleItemAction } from "./actions";
import type { GroceryItem } from "@/lib/db/schema";

interface GroceryChecklistProps {
  grouped: Record<string, GroceryItem[]>;
}

export function GroceryChecklist({ grouped }: GroceryChecklistProps) {
  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, items]) => (
        <CategoryGroup key={category} category={category} items={items} />
      ))}
    </div>
  );
}

function CategoryGroup({
  category,
  items,
}: {
  category: string;
  items: GroceryItem[];
}) {
  const sorted = [...items].sort((a, b) => {
    if (a.checked === b.checked) return 0;
    return a.checked ? 1 : -1;
  });

  const checked = items.filter((i) => i.checked).length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {category}
        </h3>
        <Badge variant="secondary" className="text-[10px]">
          {checked}/{items.length}
        </Badge>
      </div>
      <div className="space-y-1">
        {sorted.map((item) => (
          <ChecklistItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function ChecklistItem({ item }: { item: GroceryItem }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticChecked, setOptimisticChecked] = useOptimistic(
    item.checked ?? false
  );

  function handleToggle() {
    startTransition(async () => {
      setOptimisticChecked(!optimisticChecked);
      await toggleItemAction(item.id);
    });
  }

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50",
        optimisticChecked && "opacity-50"
      )}
    >
      <Checkbox
        checked={optimisticChecked}
        onCheckedChange={handleToggle}
        disabled={isPending}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-sm",
              optimisticChecked && "line-through text-muted-foreground"
            )}
          >
            {item.name}
          </span>
          {(item.quantity || item.unit) && (
            <span className="text-xs text-muted-foreground">
              {item.quantity}
              {item.unit && ` ${item.unit}`}
            </span>
          )}
        </div>
        {item.displayName && (
          <span className="text-xs text-muted-foreground">
            {item.displayName}
          </span>
        )}
      </div>
    </label>
  );
}
