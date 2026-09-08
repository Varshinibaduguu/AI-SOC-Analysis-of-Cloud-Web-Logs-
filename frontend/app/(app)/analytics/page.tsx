"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardService } from "@/services/dashboard.service";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { severityColor } from "@/lib/utils";
import { REALTIME_POLL } from "@/lib/realtime";
import { PageHeader } from "@/components/ui/page-header";

const COLORS = ["#22d3ee", "#3b82f6", "#a855f7", "#ef4444", "#10b981"];

export default function AnalyticsPage() {
  const token = useAuthStore((s) => s.token)!;

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => dashboardService.getStats(token),
    refetchInterval: REALTIME_POLL.dashboard,
  });

  const { data: logs } = useQuery({
    queryKey: ["logs"],
    queryFn: () => api.get<Array<Record<string, unknown>>>("/logs/", token),
    refetchInterval: REALTIME_POLL.logs,
  });

  const severityData = (logs || []).slice(0, 8).map((l) => ({
    name: String(l.filename).slice(0, 20),
    severity: Math.round((Number(l.severity_score) || 0) * 100),
  }));

  const pieData = [
    { name: "Incidents", value: stats?.incident_count || 0 },
    { name: "Documents", value: stats?.document_count || 0 },
    { name: "Logs", value: stats?.log_count || 0 },
    { name: "Chats", value: stats?.chat_session_count || 0 },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Threat Analytics"
        description="Visualize security trends, log severity, and platform activity"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Log Severity by File</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={severityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="severity" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform Activity Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Risk Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div className="text-6xl font-bold text-primary">
              {stats?.risk_score ?? 0}%
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Average log severity:{" "}
                <span className={severityColor(stats?.avg_severity_score || 0)}>
                  {((stats?.avg_severity_score || 0) * 100).toFixed(0)}%
                </span>
              </p>
              <p>Total incidents tracked: {stats?.incident_count ?? 0}</p>
              <p>AI alerts active: {stats?.ai_alerts?.length ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
