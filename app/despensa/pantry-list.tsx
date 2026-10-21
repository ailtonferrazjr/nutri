"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PantryItem } from "./pantry-item";
import { ItemDialog } from "./item-dialog";
import type { PantryItemData } from "./pantry-item";

interface PantryListProps {
  grouped: Record<string, PantryItemData[]>;
  categories: string[];
}

export function PantryList({ grouped, categories }: PantryListProps) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItemData | null>(null);

  function handleRemoved(id: string) {
    setRemovedIds((prev) => new Set(prev).add(id));
  }

  function handleEdit(item: PantryItemData) {
    setEditingItem(item);
    setDialogOpen(true);
  }

  function handleAdd() {
    setEditingItem(null);
    setDialogOpen(true);
  }

  const categoryList = Object.entries(grouped)
    .map(([category, items]) => {
      const visible = items.filter((i) => !removedIds.has(i.id));
      return { category, items: visible };
    })
    .filter(({ items }) => items.length > 0)
    .sort((a, b) => a.category.localeCompare(b.category));

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button variant="outline" size="sm" onClick={handleAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      <div className="space-y-4">
        {categoryList.map(({ category, items }) => (
          <div key={category}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {category}
              </h3>
              <Badge variant="secondary" className="text-[10px]">
                {items.length}
              </Badge>
            </div>
            <Card>
              <CardContent className="px-2 py-1.5">
                {items.map((item) => (
                  <PantryItem
                    key={item.id}
                    item={item}
                    onRemoved={handleRemoved}
                    onEdit={handleEdit}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        item={editingItem}
      />
    </>
  );
}
