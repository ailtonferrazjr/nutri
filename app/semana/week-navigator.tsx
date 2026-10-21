"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WeekNavigatorProps {
  weekStart: string;
  weekLabel: string;
}

export function WeekNavigator({ weekStart, weekLabel }: WeekNavigatorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(offset: number) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + offset * 7);
    const newWeek = date.toISOString().split("T")[0];
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", newWeek);
    router.push(`/semana?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium min-w-28 text-center">{weekLabel}</span>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
