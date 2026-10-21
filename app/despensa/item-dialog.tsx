"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { editItemAction, addItemAction } from "./actions";

const UNIT_OPTIONS = [
  { value: "un", label: "un (unidade)" },
  { value: "pacote", label: "pacote" },
  { value: "bandeja", label: "bandeja" },
  { value: "lata", label: "lata" },
  { value: "ziploc", label: "ziploc" },
  { value: "porção", label: "porção" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "L", label: "L (litro)" },
  { value: "ml", label: "ml" },
  { value: "dúzia", label: "dúzia" },
  { value: "pote", label: "pote" },
  { value: "garrafa", label: "garrafa" },
  { value: "peça", label: "peça" },
];

interface ItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  item?: {
    id: string;
    name: string;
    category: string | null;
    unit: string | null;
  } | null;
}

export function ItemDialog({
  open,
  onOpenChange,
  categories,
  item,
}: ItemDialogProps) {
  const isEdit = !!item;
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("un");
  const [quantity, setQuantity] = useState("1");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      if (item) {
        setName(item.name);
        setCategory(item.category ?? "");
        setUnit(item.unit ?? "un");
      } else {
        setName("");
        setCategory("");
        setUnit("un");
        setQuantity("1");
      }
    }
  }, [open, item]);

  function handleSubmit() {
    if (!name.trim()) return;
    const cat = category.trim() || "Outros";

    startTransition(async () => {
      if (isEdit) {
        await editItemAction(item.id, {
          name: name.trim(),
          category: cat,
          unit: unit.trim(),
        });
      } else {
        await addItemAction({
          name: name.trim(),
          category: cat,
          quantity: parseFloat(quantity) || 1,
          unit: unit.trim(),
        });
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar item" : "Adicionar item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Nome</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Tomate"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Categoria
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3">
            {!isEdit && (
              <div className="flex-1">
                <label className="text-sm font-medium mb-1.5 block">
                  Quantidade
                </label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min={0}
                  step="any"
                />
              </div>
            )}
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">
                Unidade
              </label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar unidade" />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !name.trim()}
            className="w-full"
          >
            {isEdit ? "Salvar" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
