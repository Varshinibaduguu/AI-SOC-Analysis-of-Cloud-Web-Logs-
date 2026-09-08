"use client";

import { useEffect, useRef, useState } from "react";
import { Radio, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThreatSummary, type ThreatAnalysis } from "@/components/cloud/threat-summary";
import {
  cloudService,
  CloudLogEvent,
  CloudStreamEvent,
} from "@/services/cloud.service";
import { useAuthStore } from "@/store/auth-store";
import { severityColor, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  connectionId: number;
  connectionName: string;
  initialEvents?: CloudLogEvent[];
  initialAnalysis?: ThreatAnalysis | null;
  verifiedAccount?: string;
}

export function LiveLogViewer({
  connectionId,
  connectionName,
  initialEvents = [],
  initialAnalysis = null,
  verifiedAccount,
}: Props) {
  const token = useAuthStore((s) => s.token)!;
  const [events, setEvents] = useState<CloudLogEvent[]>(initialEvents);
  const [analysis, setAnalysis] = useState<ThreatAnalysis | null>(initialAnalysis);
  const [streaming, setStreaming] = useState(true);
  const [status, setStatus] = useState<"connecting" | "live" | "error">(
    initialEvents.length > 0 ? "live" : "connecting"
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingInitial, setLoadingInitial] = useState(initialEvents.length === 0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setEvents(initialEvents);
    setAnalysis(initialAnalysis);
    if (initialEvents.length > 0) setStatus("live");
  }, [initialEvents, initialAnalysis, connectionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  useEffect(() => {
    if (initialEvents.length > 0) return;

    let cancelled = false;
    setLoadingInitial(true);
    cloudService
      .fetchLogs(token, connectionId, 30)
      .then((res) => {
        if (cancelled) return;
        setEvents(res.events);
        setAnalysis((res.analysis as ThreatAnalysis) || null);
        setStatus("live");
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setErrorMsg(err.message);
          setStatus("error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingInitial(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, connectionId, initialEvents.length]);

  useEffect(() => {
    if (!streaming) {
      stopRef.current?.();
      stopRef.current = null;
      return;
    }

    if (status !== "live" && !loadingInitial) setStatus("connecting");

    stopRef.current = cloudService.streamLogs(
      token,
      connectionId,
      (payload: CloudStreamEvent) => {
        if (payload.type === "connected") {
          setStatus("live");
          setErrorMsg("");
        } else if (payload.type === "logs") {
          setStatus("live");
          setEvents((prev) => [...payload.events, ...prev].slice(0, 200));
          if (payload.analysis) {
            setAnalysis(payload.analysis as ThreatAnalysis);
          }
        } else if (payload.type === "error") {
          setStatus("error");
          setErrorMsg(payload.message);
        }
      },
      (err) => {
        setStatus("error");
        setErrorMsg(err.message);
      }
    );

    return () => {
      stopRef.current?.();
    };
  }, [token, connectionId, streaming, loadingInitial]);

  return (
    <div className="space-y-4">
      <ThreatSummary
        analysis={analysis}
        verifiedAccount={verifiedAccount}
      />

      <Card className="flex h-[calc(100vh-22rem)] min-h-[320px] flex-col">
        <CardHeader className="flex shrink-0 flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio
                className={cn(
                  "h-4 w-4",
                  status === "live" ? "text-green-400 animate-pulse" : "text-muted-foreground"
                )}
              />
              Live: {connectionName}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {loadingInitial && "Fetching logs from AWS..."}
              {!loadingInitial && status === "live" && "Streaming new events with per-event threat %"}
              {status === "error" && errorMsg}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setStreaming((s) => !s)}>
            {streaming ? (
              <>
                <Pause className="mr-1 h-3 w-3" /> Pause
              </>
            ) : (
              <>
                <Play className="mr-1 h-3 w-3" /> Resume
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto font-mono text-xs">
            {events.length === 0 && !loadingInitial && status === "live" && (
              <p className="py-8 text-center text-muted-foreground">
                No events in the last 30 minutes. New activity will appear here automatically.
              </p>
            )}
            {events.map((ev, i) => (
              <div
                key={`${ev.id}-${i}`}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  (ev.severity_score || 0) >= 0.6
                    ? "border-red-500/40 bg-red-500/10"
                    : (ev.severity_score || 0) >= 0.4
                      ? "border-orange-500/30 bg-orange-500/5"
                      : "border-white/10 bg-white/[0.03]"
                )}
              >
                <div className="mb-1 flex justify-between gap-2">
                  <span className="font-semibold text-primary">
                    {ev.name || ev.source || "Event"}
                  </span>
                  {ev.severity_score != null && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        severityColor(ev.severity_score)
                      )}
                    >
                      Threat {((ev.severity_score || 0) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground">
                  {ev.time ? formatDate(ev.time) : "—"}
                  {ev.username && ` · ${ev.username}`}
                  {ev.region && ` · ${ev.region}`}
                </p>
                {ev.threats && ev.threats.length > 0 && (
                  <p className="mt-1 text-orange-400">{ev.threats.join(" · ")}</p>
                )}
                <pre className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-all text-[10px] opacity-80">
                  {typeof ev.detail === "object"
                    ? JSON.stringify(ev.detail, null, 2)
                    : ev.raw || String(ev.detail)}
                </pre>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
