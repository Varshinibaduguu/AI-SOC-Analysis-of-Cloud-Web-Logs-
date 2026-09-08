"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { severityColor, formatDate } from "@/lib/utils";
import { REALTIME_POLL } from "@/lib/realtime";
import { invalidateMany } from "@/lib/query";
import { PageHeader } from "@/components/ui/page-header";

export default function UploadPage() {
  const token = useAuthStore((s) => s.token)!;
  const queryClient = useQueryClient();
  const [logType, setLogType] = useState("cloudtrail");
  const [docResult, setDocResult] = useState<string | null>(null);
  const [docError, setDocError] = useState("");
  const [logResult, setLogResult] = useState<Record<string, unknown> | null>(null);
  const [logError, setLogError] = useState("");

  const { data: logs } = useQuery({
    queryKey: ["logs"],
    queryFn: () => api.get<Array<Record<string, unknown>>>("/logs/", token),
    refetchInterval: REALTIME_POLL.logs,
  });

  const uploadDoc = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.upload("/documents/upload", fd, token);
    },
    onSuccess: () => {
      setDocError("");
      setDocResult("Document indexed into your knowledge base — available for RAG immediately.");
      void invalidateMany(queryClient, [["dashboard-stats"], ["documents"]]);
    },
    onError: (err: Error) => {
      setDocResult(null);
      setDocError(err.message || "Document upload failed");
    },
  });

  const { data: documents } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.get<Array<Record<string, unknown>>>("/documents/", token),
    refetchInterval: REALTIME_POLL.logs,
  });

  const analyzeLog = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("log_type", logType);
      return api.upload<Record<string, unknown>>("/logs/analyze", fd, token);
    },
    onSuccess: (data) => {
      setLogError("");
      setLogResult(data);
      void invalidateMany(queryClient, [
        ["logs"],
        ["dashboard-stats"],
        ["reports-context"],
      ]);
    },
    onError: (err: Error) => {
      setLogResult(null);
      setLogError(err.message || "Log analysis failed");
    },
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Upload Center"
        description="Upload security documents for RAG or analyze log files with AI + ML"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-400" />
              Knowledge Base Upload
            </CardTitle>
            <CardDescription>PDF, DOCX, TXT, JSON — indexed into ChromaDB</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.json"
              className="mb-4 block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadDoc.mutate(f);
              }}
            />
            {docError && <p className="text-sm text-destructive">{docError}</p>}
            {docResult && <p className="text-sm text-green-400">{docResult}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-400" />
              Log Analyzer
            </CardTitle>
            <CardDescription>CloudTrail, K8s, firewall, or generic logs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 text-sm"
              value={logType}
              onChange={(e) => setLogType(e.target.value)}
            >
              <option value="cloudtrail">CloudTrail</option>
              <option value="kubernetes">Kubernetes</option>
              <option value="firewall">Firewall</option>
              <option value="generic">Generic</option>
            </select>
            <input
              type="file"
              accept=".json,.txt,.log,.csv"
              className="block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) analyzeLog.mutate(f);
              }}
            />
            {logError && <p className="text-sm text-destructive">{logError}</p>}
            {analyzeLog.isPending && (
              <p className="text-sm text-muted-foreground">Analyzing with ML + AI...</p>
            )}
            {logResult && (
              <div className="rounded-lg bg-white/5 p-4 text-sm space-y-2">
                <p className="font-medium">{String(logResult.filename)}</p>
                <p className={severityColor(Number(logResult.severity_score))}>
                  Severity: {((Number(logResult.severity_score) || 0) * 100).toFixed(0)}%
                </p>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {String(logResult.summary)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(documents || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Indexed Documents (RAG)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {(documents || []).map((doc) => (
                <li key={String(doc.id)} className="flex justify-between rounded-lg bg-white/5 p-3">
                  <span>{String(doc.filename)}</span>
                  <span className="text-muted-foreground">
                    {String(doc.chunk_count)} chunks · {formatDate(String(doc.created_at))}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Log Analyses (live)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-muted-foreground">
                  <th className="pb-3 pr-4">File</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Severity</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {(logs || []).map((log) => (
                  <tr key={String(log.id)} className="border-b border-white/5">
                    <td className="py-3 pr-4">{String(log.filename)}</td>
                    <td className="py-3 pr-4 capitalize">{String(log.log_type)}</td>
                    <td className={`py-3 pr-4 ${severityColor(Number(log.severity_score))}`}>
                      {((Number(log.severity_score) || 0) * 100).toFixed(0)}%
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {formatDate(String(log.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
