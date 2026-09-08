import { api } from "@/lib/api";

export interface DashboardStats {
  incident_count: number;
  document_count: number;
  log_count: number;
  chat_session_count: number;
  report_count: number;
  avg_severity_score: number;
  recent_incidents: Array<{
    id: number;
    title: string;
    severity: string;
    status: string;
    created_at?: string;
  }>;
  recent_logs: Array<{
    id: number;
    filename: string;
    log_type: string;
    severity_score: number;
    summary: string;
    threats: string[];
    created_at: string;
  }>;
  threat_activity: Array<{
    date: string;
    date_iso?: string;
    threats: number;
    incidents: number;
    logs_analyzed?: number;
    avg_severity?: number;
  }>;
  risk_score: number;
  ai_alerts: Array<{
    id?: string;
    type: string;
    message: string;
    score?: number;
    created_at?: string;
    source?: string;
  }>;
  updated_at?: string;
}

export const dashboardService = {
  getStats: (token: string) =>
    api.get<DashboardStats>("/dashboard/stats", token),
};
