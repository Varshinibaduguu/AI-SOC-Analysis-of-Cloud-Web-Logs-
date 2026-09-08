"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Activity } from "lucide-react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { ThreatChart } from "@/components/dashboard/threat-chart";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardService } from "@/services/dashboard.service";
import { useAuthStore } from "@/store/auth-store";
import { severityColor, formatDate } from "@/lib/utils";
import { REALTIME_POLL } from "@/lib/realtime";
import { useDashboardStream } from "@/hooks/use-dashboard-stream";

export default function DashboardPage() {
  const token = useAuthStore((s) => s.token)!;
  const queryClient = useQueryClient();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => dashboardService.getStats(token),
    refetchInterval: REALTIME_POLL.dashboard,
  });

  useDashboardStream(token, (liveStats) => {
    queryClient.setQueryData(["dashboard-stats"], liveStats);
  });

  if (isLoading || !stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-primary/30 border-t-primary shadow-glow-sm" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="SOC Dashboard"
        description="Live security operations — updates every few seconds"
        badge={
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.15)]">
            <span className="live-pulse" />
            Live
            {stats.updated_at && (
              <span className="text-muted-foreground">
                · {formatDate(stats.updated_at)}
              </span>
            )}
          </div>
        }
      />

      <StatsCards stats={stats} />

      <div className="grid gap-6 lg:grid-cols-3">
        <ThreatChart data={stats.threat_activity} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-400" />
              Live AI Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[320px] overflow-y-auto">
            {stats.ai_alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No alerts yet — upload logs to trigger real detections
              </p>
            ) : (
              stats.ai_alerts.map((alert) => (
                <div
                  key={alert.id || alert.message}
                  className="rounded-lg border border-white/[0.04] bg-white/[0.04] p-3 text-sm transition-colors hover:border-primary/20 hover:bg-primary/5"
                >
                  <p className="text-xs text-muted-foreground capitalize mb-1">
                    {alert.source || alert.type}
                  </p>
                  <p>{alert.message}</p>
                  {alert.score != null && (
                    <p className={`mt-1 text-xs ${severityColor(alert.score)}`}>
                      Severity: {(alert.score * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-cyan-400" />
              Recent Log Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[360px] overflow-y-auto">
            {stats.recent_logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No logs analyzed yet — use Upload Center
              </p>
            ) : (
              <div className="space-y-2">
                {stats.recent_logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg border border-white/[0.04] bg-white/[0.04] p-3 text-sm transition-colors hover:border-cyan-500/20"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium">{log.filename}</span>
                      <span
                        className={`text-xs shrink-0 ${severityColor(log.severity_score)}`}
                      >
                        {((log.severity_score || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {log.summary}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(log.created_at)} · {log.log_type}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open Incidents</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recent_incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Incidents are created automatically from high-severity log analysis
              </p>
            ) : (
              <div className="space-y-2">
                {stats.recent_incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.04] p-3 transition-colors hover:border-violet-500/20"
                  >
                    <div>
                      <span className="text-sm font-medium">{inc.title}</span>
                      <p className="text-xs text-muted-foreground capitalize">
                        {inc.status}
                      </p>
                    </div>
                    <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs text-orange-400 capitalize">
                      {inc.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
