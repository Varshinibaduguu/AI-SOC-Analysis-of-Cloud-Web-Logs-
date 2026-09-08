import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, badge, className }: PageHeaderProps) {
  return (
    <div className={cn("relative mb-8 animate-fade-in", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-primary/80">
            AI SOC ANALYSIS SYSTEM
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-gradient md:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
          )}
        </div>
        {badge}
      </div>
      <div className="mt-4 h-px w-full max-w-md bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
    </div>
  );
}
