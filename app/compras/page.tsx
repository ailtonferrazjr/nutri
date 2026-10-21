export const dynamic = "force-dynamic";

import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { getActiveGroceryList } from "@/lib/db/queries/grocery";
import { GroceryChecklist } from "./grocery-checklist";

export default async function ComprasPage() {
  const list = await getActiveGroceryList();

  if (!list) {
    return (
      <>
        <PageHeader title="Compras" />
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma lista ativa"
          description="Peca no chat para criar uma lista de compras."
          chatPrompt="Faz uma lista de compras"
        />
      </>
    );
  }

  const total = list.items.length;
  const checked = list.items.filter((i) => i.checked).length;

  return (
    <>
      <PageHeader
        title={list.name || "Lista de compras"}
        description={list.store ?? undefined}
      >
        <Badge variant="outline">
          {checked}/{total}
        </Badge>
      </PageHeader>

      <GroceryChecklist grouped={list.grouped} />
    </>
  );
}
