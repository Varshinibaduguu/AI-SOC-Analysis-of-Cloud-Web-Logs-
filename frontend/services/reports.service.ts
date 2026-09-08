import { api } from "@/lib/api";

export interface ReportLogContext {
  id: number;
  filename: string;
  log_type: string;
  severity_score: number;
  summary: string;
  created_at: string;
}

export interface ReportContext {
  logs: ReportLogContext[];
  can_generate: boolean;
}

export interface Report {
  id: number;
  title: string;
  severity: string;
  content_markdown: string;
  created_at: string;
}

export const reportsService = {
  getContext: (token: string) =>
    api.get<ReportContext>("/reports/context", token),

  generate: (
    token: string,
    data: {
      user_prompt?: string;
      severity?: string;
      log_ids?: number[];
      title?: string;
    }
  ) => api.post<Report>("/reports/generate", data, token),

  list: (token: string) => api.get<Report[]>("/reports/", token),
};
