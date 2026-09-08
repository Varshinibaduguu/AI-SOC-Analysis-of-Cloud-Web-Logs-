"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { API_URL } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { formatDate, severityColor } from "@/lib/utils";
import { reportsService, Report } from "@/services/reports.service";
import { REALTIME_POLL } from "@/lib/realtime";
import { invalidateMany } from "@/lib/query";
import { PageHeader } from "@/components/ui/page-header";

export default function ReportsPage() {
  const token = useAuthStore((s) => s.token)!;
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [severity, setSeverity] = useState("high");
  const [selectedLogIds, setSelectedLogIds] = useState<number[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const { data: context } = useQuery({
    queryKey: ["reports-context"],
    queryFn: () => reportsService.getContext(token),
    refetchInterval: REALTIME_POLL.reports,
  });

  const { data: reports } = useQuery({
    queryKey: ["reports"],
    queryFn: () => reportsService.list(token),
    refetchInterval: REALTIME_POLL.reports,
  });

  const toggleLog = (id: number) => {
    setSelectedLogIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const generate = useMutation({
    mutationFn: () =>
      reportsService.generate(token, {
        user_prompt: prompt || undefined,
        severity,
        log_ids: selectedLogIds.length > 0 ? selectedLogIds : undefined,
      }),
    onSuccess: (data) => {
      setSelected(data);
      setError("");
      void invalidateMany(queryClient, [
        ["reports"],
        ["dashboard-stats"],
        ["reports-context"],
      ]);
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to generate report");
    },
  });

  const canGenerate = context?.can_generate ?? false;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Incident Reports"
        description="Reports are built from your real analyzed logs — uploads create incidents automatically"
      />

      <Card>
        <CardHeader>
          <CardTitle>Generate from Analyzed Logs</CardTitle>
          <CardDescription>
            Select logs analyzed in Upload Center, or use all recent logs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canGenerate ? (
            <div className="flex items-center gap-2 rounded-lg bg-orange-500/10 p-4 text-sm text-orange-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Upload and analyze logs first — reports require real security data.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto rounded-lg border border-white/10 p-3">
              {context?.logs.map((log) => (
                <label
                  key={log.id}
                  className="flex cursor-pointer items-start gap-3 rounded p-2 hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selectedLogIds.includes(log.id)}
                    onChange={() => toggleLog(log.id)}
                    className="mt-1"
                  />
                  <div className="text-sm">
                    <span className="font-medium">{log.filename}</span>
                    <span className={`ml-2 text-xs ${severityColor(log.severity_score)}`}>
                      {((log.severity_score || 0) * 100).toFixed(0)}%
                    </span>
                    <p className="text-xs text-muted-foreground line-clamp-1">{log.summary}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          <div className="flex gap-4">
            <Input
              placeholder="Analyst notes (optional)..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1"
            />
            <select
              className="h-10 rounded-md border border-input bg-background/50 px-3 text-sm"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            variant="cyber"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !canGenerate}
          >
            <FileText className="mr-2 h-4 w-4" />
            {generate.isPending ? "Generating from real logs..." : "Generate Report"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-1">
          {(reports || []).map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className={`w-full rounded-lg border p-4 text-left transition-all ${
                selected?.id === r.id
                  ? "border-primary bg-primary/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <p className="font-medium text-sm">{r.title}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDate(r.created_at)} · {r.severity}
              </p>
            </button>
          ))}
        </div>

        {selected && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{selected.title}</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    fetch(`${API_URL}/reports/${selected.id}/export/markdown`, {
                      headers: { Authorization: `Bearer ${token}` },
                    })
                      .then((r) => r.text())
                      .then((t) => {
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(new Blob([t], { type: "text/markdown" }));
                        a.download = `report-${selected.id}.md`;
                        a.click();
                      });
                  }}
                >
                  <Download className="mr-1 h-3 w-3" /> MD
                </Button>
                <Button
                  variant="cyber"
                  size="sm"
                  onClick={() => {
                    fetch(`${API_URL}/reports/${selected.id}/export/pdf`, {
                      headers: { Authorization: `Bearer ${token}` },
                    })
                      .then((r) => r.blob())
                      .then((blob) => {
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `report-${selected.id}.pdf`;
                        a.click();
                      });
                  }}
                >
                  <Download className="mr-1 h-3 w-3" /> PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="prose-cyber prose-invert max-w-none text-sm max-h-[600px] overflow-y-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {selected.content_markdown}
              </ReactMarkdown>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
