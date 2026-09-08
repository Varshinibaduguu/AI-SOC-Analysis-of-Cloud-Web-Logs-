"use client";

import { Shield, FileText, Activity, AlertTriangle, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardStats } from "@/services/dashboard.service";
import { cn } from "@/lib/utils";

interface Props {
  stats: DashboardStats;
}

const iconGlow: Record<string, string> = {
  "text-red-400": "shadow-[0_0_20px_rgba(248,113,113,0.35)]",
  "text-cyan-400": "shadow-[0_0_20px_rgba(34,211,238,0.35)]",
  "text-blue-400": "shadow-[0_0_20px_rgba(96,165,250,0.35)]",
  "text-purple-400": "shadow-[0_0_20px_rgba(192,132,252,0.35)]",
  "text-orange-400": "shadow-[0_0_20px_rgba(251,146,60,0.35)]",
  "text-green-400": "shadow-[0_0_20px_rgba(52,211,153,0.35)]",
};

export function StatsCards({ stats }: Props) {
  const cards = [
    {
      title: "Incidents",
      value: stats.incident_count,
      icon: AlertTriangle,
      color: "text-red-400",
    },
    {
      title: "Documents Indexed",
      value: stats.document_count,
      icon: FileText,
      color: "text-cyan-400",
    },
    {
      title: "Logs Analyzed",
      value: stats.log_count,
      icon: Activity,
      color: "text-blue-400",
    },
    {
      title: "Reports",
      value: stats.report_count ?? 0,
      icon: ClipboardList,
      color: "text-purple-400",
    },
    {
      title: "Risk Score",
      value: `${stats.risk_score}%`,
      icon: Shield,
      color: stats.risk_score > 60 ? "text-orange-400" : "text-green-400",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.title}
            className="stat-glow animate-fade-in"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {card.title}
              </CardTitle>
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg bg-white/5",
                  iconGlow[card.color]
                )}
              >
                <Icon className={cn("h-4 w-4", card.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-display text-3xl font-bold tracking-tight text-gradient">
                {card.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
