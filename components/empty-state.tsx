import Link from "next/link";
import { MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  chatPrompt?: string;
}

export function EmptyState({
  icon: Icon = MessageCircle,
  title,
  description,
  chatPrompt,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-sm font-medium">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      {chatPrompt && (
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href={`/chat`}>Pedir no chat</Link>
        </Button>
      )}
    </div>
  );
}
