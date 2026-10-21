"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageCircle,
  ChefHat,
  CalendarDays,
  ShoppingCart,
  Package,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/descobrir", label: "Descobrir", icon: Sparkles },
  { href: "/receitas", label: "Receitas", icon: ChefHat },
  { href: "/semana", label: "Semana", icon: CalendarDays },
  { href: "/compras", label: "Compras", icon: ShoppingCart },
  { href: "/despensa", label: "Despensa", icon: Package },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-3xl items-center justify-around">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
