"use client";

import { AlertTriangle, Shield, Activity } from "lucide-react";
import { cn, severityColor } from "@/lib/utils";

export interface ThreatAnalysis {
  severity_score?: number;
  avg_severity_score?: number;
  threat_percentage?: number;
  threats?: string[];
  high_risk_count?: number;
  event_count?: number;
  log_id?: number;
}

interface Props {
  analysis: ThreatAnalysis | null;
  verifiedAccount?: string;
  className?: string;
}

export function ThreatSummary({ analysis, verifiedAccount, className }: Props) {
  const pct =
    analysis?.threat_percentage ??
    Math.round((analysis?.severity_score ?? 0) * 100);
  const score = (analysis?.severity_score ?? 0);

  return (
    <div
      className={cn(
        "grid gap-4 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-transparent to-violet-500/10 p-5 shadow-glow-sm",
        className
      )}
    >
      {verifiedAccount && (
        <p className="text-xs text-emerald-400">
          Verified AWS account <span className="font-mono font-semibold">{verifiedAccount}</span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center justify-center">
          <div
            className={cn(
              "relative flex h-28 w-28 items-center justify-center rounded-full border-4",
              pct >= 70
                ? "border-red-500/60 shadow-[0_0_40px_rgba(239,68,68,0.35)]"
                : pct >= 40
                  ? "border-orange-500/50 shadow-[0_0_30px_rgba(251,146,60,0.25)]"
                  : "border-cyan-500/50 shadow-[0_0_30px_rgba(34,211,238,0.25)]"
            )}
          >
            <span className={cn("font-display text-3xl font-bold", severityColor(score))}>
              {pct}%
            </span>
          </div>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Threat level
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat icon={Activity} label="Events loaded" value={String(analysis?.event_count ?? 0)} />
          <Stat
            icon={AlertTriangle}
            label="High-risk events"
            value={String(analysis?.high_risk_count ?? 0)}
            warn={(analysis?.high_risk_count ?? 0) > 0}
          />
          <Stat
            icon={Shield}
            label="Avg severity"
            value={`${Math.round((analysis?.avg_severity_score ?? 0) * 100)}%`}
          />
          <Stat
            icon={Shield}
            label="Peak severity"
            value={`${Math.round(score * 100)}%`}
          />
        </div>
      </div>

      {analysis?.threats && analysis.threats.length > 0 ? (
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-orange-300">
            Detected threats
          </p>
          <ul className="space-y-1 text-sm text-orange-200/90">
            {analysis.threats.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-orange-400">•</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No critical threat patterns detected in the loaded window. Live stream continues below.
        </p>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof Shield;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", warn && "text-orange-400")} />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("mt-1 font-semibold", warn && "text-orange-400")}>{value}</p>
    </div>
  );
}
