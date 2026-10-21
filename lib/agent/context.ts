import { getExpiringItems } from "@/lib/db/queries/pantry";
import { getTodayMealPlan } from "@/lib/db/queries/meal-plan";
import { getActiveGroceryListSummary } from "@/lib/db/queries/grocery";

export async function buildDynamicContext(): Promise<string> {
  const [expiringItems, todayPlan, activeList] = await Promise.all([
    getExpiringItems(3),
    getTodayMealPlan(),
    getActiveGroceryListSummary(),
  ]);

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const sections: string[] = [];

  sections.push(`\n## Estado Atual — ${today}`);

  if (expiringItems.length > 0) {
    const todayStr = new Date().toISOString().split("T")[0];
    sections.push("\n### Itens Vencendo");
    for (const item of expiringItems) {
      const expired = item.expiresAt! <= todayStr;
      const label = expired ? "VENCIDO" : `vence ${item.expiresAt}`;
      sections.push(
        `- ${item.name}${item.quantity ? ` (${item.quantity} ${item.unit ?? ""})` : ""}: ${label}`
      );
    }
  }

  if (todayPlan.length > 0) {
    sections.push("\n### Plano de Hoje");
    for (const entry of todayPlan) {
      const meal = entry.recipeName ?? entry.description ?? "não definido";
      const who = entry.forUser === "both" ? "" : ` (${entry.forUser})`;
      const done = entry.completed ? " ✓" : "";
      sections.push(`- ${entry.mealType}: ${meal}${who}${done}`);
    }
  }

  if (activeList) {
    sections.push("\n### Lista de Compras Ativa");
    sections.push(
      `"${activeList.name}" (${activeList.store}) — ${activeList.uncheckedItems} de ${activeList.totalItems} itens pendentes`
    );
  }

  if (sections.length === 1) {
    sections.push("\nNenhum alerta no momento.");
  }

  return sections.join("\n");
}
