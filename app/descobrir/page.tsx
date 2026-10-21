export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/page-header";
import { getAvailableSuggestions } from "@/lib/db/queries/suggestions";
import { DiscoveryFeed } from "./discovery-feed";

export default async function DescobrirPage() {
  const suggestions = await getAvailableSuggestions();

  return (
    <>
      <PageHeader
        title="Descobrir"
        description={
          suggestions.length > 0
            ? `${suggestions.length} sugestões`
            : "Receitas sugeridas pra você"
        }
      />
      <DiscoveryFeed initialSuggestions={suggestions} />
    </>
  );
}
