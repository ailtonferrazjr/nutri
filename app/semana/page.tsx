export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { getWeekMealPlan } from "@/lib/db/queries/meal-plan";
import { WeekNavigator } from "./week-navigator";
import { MealCard } from "./meal-card";

const MEAL_ORDER: Record<string, number> = {
  "café": 0,
  "cafe": 0,
  "café da manhã": 0,
  "cafe da manha": 0,
  "almoço": 1,
  "almoco": 1,
  "lanche": 2,
  "jantar": 3,
};
const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const months = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];

  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}-${end.getDate()} ${months[start.getMonth()]}`;
  }
  return `${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]}`;
}

async function MealCalendar({ weekStart }: { weekStart: string }) {
  const entries = await getWeekMealPlan(weekStart);

  const days: string[] = [];
  const d = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    days.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }

  const today = new Date().toISOString().split("T")[0];

  const byDay = new Map<string, typeof entries>();
  for (const entry of entries) {
    const dayEntries = byDay.get(entry.date) ?? [];
    dayEntries.push(entry);
    byDay.set(entry.date, dayEntries);
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Semana sem plano"
        description="Peca no chat para montar o meal plan da semana."
        chatPrompt="Monta o meal plan da semana"
      />
    );
  }

  return (
    <div className="space-y-4">
      {days.map((day) => {
        const date = new Date(day);
        const dayName = DAY_NAMES[date.getDay()];
        const dayNum = date.getDate();
        const isToday = day === today;

        const dayEntries = (byDay.get(day) ?? []).sort(
          (a, b) => (MEAL_ORDER[a.mealType.toLowerCase()] ?? 99) - (MEAL_ORDER[b.mealType.toLowerCase()] ?? 99)
        );

        if (dayEntries.length === 0) return null;

        return (
          <div key={day}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  isToday ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {dayNum}
              </span>
              <span className="text-sm font-medium">{dayName}</span>
            </div>
            <div className="ml-10 space-y-1.5">
              {dayEntries.map((entry) => (
                <MealCard key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function SemanaPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const monday = getMonday(new Date());
  const weekStart = week || monday.toISOString().split("T")[0];
  const weekLabel = formatWeekLabel(weekStart);

  return (
    <>
      <PageHeader title="Semana">
        <Suspense>
          <WeekNavigator weekStart={weekStart} weekLabel={weekLabel} />
        </Suspense>
      </PageHeader>

      <MealCalendar weekStart={weekStart} />
    </>
  );
}
