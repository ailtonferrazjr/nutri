export const dynamic = "force-dynamic";

import { Package, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { getPantryByCategory, getCategories } from "@/lib/db/queries/pantry";
import { PantryList } from "./pantry-list";

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
}

export default async function DespensaPage() {
  const [{ items, grouped }, categories] = await Promise.all([
    getPantryByCategory(),
    getCategories(),
  ]);

  if (items.length === 0) {
    return (
      <>
        <PageHeader title="Despensa" />
        <EmptyState
          icon={Package}
          title="Despensa vazia"
          description="Escaneie um recibo ou adicione items pelo chat."
          chatPrompt="Adicionar items na despensa"
        />
      </>
    );
  }

  const expiringSoon = items.filter((i) => isExpiringSoon(i.expiresAt)).length;

  return (
    <>
      <PageHeader title="Despensa" description={`${items.length} items`}>
        {expiringSoon > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {expiringSoon} vencendo
          </Badge>
        )}
      </PageHeader>

      <PantryList grouped={grouped} categories={categories} />
    </>
  );
}
