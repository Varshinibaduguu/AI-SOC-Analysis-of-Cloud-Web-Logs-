"use client";

import { useEffect, useRef } from "react";
import { API_URL } from "@/lib/api";
import { isAbortError } from "@/lib/abort";
import type { DashboardStats } from "@/services/dashboard.service";

/**
 * SSE connection for instant dashboard updates (no mock data).
 * Falls back gracefully if stream disconnects.
 */
export function useDashboardStream(
  token: string | null,
  onUpdate: (stats: DashboardStats) => void
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let buffer = "";

    async function connect() {
      if (cancelled) return;

      try {
        const res = await fetch(`${API_URL}/dashboard/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (cancelled || !res.ok || !res.body) return;

        reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            if (!part.startsWith("event: stats")) continue;
            const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const stats = JSON.parse(dataLine.slice(6)) as DashboardStats;
              onUpdateRef.current(stats);
            } catch {
              /* ignore parse errors */
            }
          }
        }
      } catch (err) {
        if (cancelled || isAbortError(err)) return;
        reconnectTimer = setTimeout(() => {
          if (!cancelled) void connect();
        }, 5000);
      } finally {
        try {
          await reader?.cancel();
        } catch {
          /* ignore stream cancel errors */
        }
        reader = null;
      }
    }

    void connect().catch(() => {
      /* swallow unexpected rejections */
    });

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      controller.abort("dashboard-stream-unmount");
      void reader?.cancel().catch(() => {});
    };
  }, [token]);
}
