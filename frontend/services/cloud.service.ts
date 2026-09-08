import { API_URL, api } from "@/lib/api";
import { isAbortError } from "@/lib/abort";

export interface CloudConnection {
  id: number;
  connection_name: string;
  provider: string;
  region: string;
  log_source: string;
  log_group_name?: string;
  status: string;
  last_error?: string;
  last_event_time?: string;
  created_at: string;
}

export interface CloudThreatAnalysis {
  severity_score?: number;
  avg_severity_score?: number;
  threat_percentage?: number;
  threats?: string[];
  high_risk_count?: number;
  event_count?: number;
  log_id?: number;
}

export interface CloudConnectResult {
  connection: CloudConnection;
  verification: {
    account?: string;
    arn?: string;
    user_id?: string;
    source?: string;
    region?: string;
  };
  events: CloudLogEvent[];
  analysis: CloudThreatAnalysis;
}

export interface CloudConnectPayload {
  connection_name: string;
  provider: string;
  region: string;
  access_key_id: string;
  secret_access_key: string;
  session_token?: string;
  log_source: string;
  log_group_name?: string;
}

export interface CloudLogEvent {
  id?: string;
  time?: string;
  name?: string;
  source?: string;
  username?: string;
  region?: string;
  provider?: string;
  log_source?: string;
  detail?: unknown;
  raw?: string;
  severity_score?: number;
  threats?: string[];
}

export type CloudStreamEvent =
  | { type: "connected"; connection_id: number; connection_name: string; region: string; log_source: string }
  | { type: "logs"; events: CloudLogEvent[]; count: number; analysis?: unknown; timestamp: string }
  | { type: "heartbeat"; timestamp: string }
  | { type: "error"; message: string };

export const cloudService = {
  connect: (token: string, data: CloudConnectPayload) =>
    api.post<CloudConnectResult>("/cloud/connect", data, token),

  listConnections: (token: string) =>
    api.get<CloudConnection[]>("/cloud/connections", token),

  deleteConnection: (token: string, id: number) =>
    api.get<void>(`/cloud/connections/${id}`, token), // DELETE via fetch below

  removeConnection: async (token: string, id: number) => {
    const res = await fetch(`${API_URL}/cloud/connections/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to remove connection");
  },

  fetchLogs: (token: string, id: number, minutes = 15) =>
    api.get<{ events: CloudLogEvent[]; count: number; analysis?: CloudThreatAnalysis }>(
      `/cloud/connections/${id}/logs?minutes=${minutes}&analyze=true`,
      token
    ),

  streamLogs: (
    token: string,
    connectionId: number,
    onEvent: (event: CloudStreamEvent) => void,
    onError?: (err: Error) => void
  ) => {
    let cancelled = false;
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    void (async () => {
      try {
        const res = await fetch(
          `${API_URL}/cloud/connections/${connectionId}/stream`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }
        );
        if (cancelled || !res.ok || !res.body) throw new Error("Live stream failed");

        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              const parsed = JSON.parse(line.slice(6)) as CloudStreamEvent;
              onEvent(parsed);
            } catch {
              /* skip */
            }
          }
        }
      } catch (err) {
        if (!cancelled && !isAbortError(err)) {
          onError?.(err as Error);
        }
      } finally {
        try {
          await reader?.cancel();
        } catch {
          /* ignore */
        }
        reader = null;
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
      controller.abort("cloud-stream-unmount");
      void reader?.cancel().catch(() => {});
    };
  },
};
