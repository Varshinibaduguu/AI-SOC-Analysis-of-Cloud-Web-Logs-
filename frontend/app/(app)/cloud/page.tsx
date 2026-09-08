"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cloud,
  Trash2,
  RefreshCw,
  Link2,
  KeyRound,
  Radio,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveLogViewer } from "@/components/cloud/live-log-viewer";
import {
  cloudService,
  CloudConnection,
  CloudLogEvent,
  CloudThreatAnalysis,
} from "@/services/cloud.service";
import { useAuthStore } from "@/store/auth-store";
import { REALTIME_POLL } from "@/lib/realtime";
import { invalidateMany } from "@/lib/query";
import { PageHeader } from "@/components/ui/page-header";

const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-central-1",
  "ap-south-1",
  "ap-southeast-1",
];

const STEPS = [
  "Fill in AWS credentials in the form on the left",
  'Click "Connect to AWS" — credentials are verified live with AWS',
  "Click the connection name to open the live log stream on the right",
];

function validateCloudForm(form: {
  connection_name: string;
  access_key_id: string;
  secret_access_key: string;
  log_source: string;
  log_group_name: string;
}): string | null {
  const name = form.connection_name.trim();
  const keyId = form.access_key_id.trim();
  const secret = form.secret_access_key.trim();

  if (!name) return "Connection name is required.";
  if (keyId.length !== 20) {
    return `Access Key ID must be exactly 20 characters (you entered ${keyId.length}). It usually starts with AKIA.`;
  }
  if (secret.length < 40) {
    return `Secret Access Key must be at least 40 characters (you entered ${secret.length}). Copy the full secret from AWS IAM.`;
  }
  if (form.log_source === "cloudwatch" && !form.log_group_name.trim()) {
    return "Log group name is required for CloudWatch.";
  }
  return null;
}

export default function CloudConnectPage() {
  const token = useAuthStore((s) => s.token)!;
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    connection_name: "",
    provider: "aws",
    region: "us-east-1",
    access_key_id: "",
    secret_access_key: "",
    session_token: "",
    log_source: "cloudtrail",
    log_group_name: "",
  });
  const [connectError, setConnectError] = useState("");
  const [connectSuccess, setConnectSuccess] = useState("");
  const [viewerData, setViewerData] = useState<
    Record<
      number,
      { events: CloudLogEvent[]; analysis: CloudThreatAnalysis; account?: string }
    >
  >({});

  const { data: connections = [] } = useQuery({
    queryKey: ["cloud-connections"],
    queryFn: () => cloudService.listConnections(token),
    refetchInterval: REALTIME_POLL.logs,
  });

  const connect = useMutation({
    mutationFn: () => {
      const validationError = validateCloudForm(form);
      if (validationError) throw new Error(validationError);

      return cloudService.connect(token, {
        connection_name: form.connection_name.trim(),
        provider: form.provider,
        region: form.region,
        access_key_id: form.access_key_id.trim(),
        secret_access_key: form.secret_access_key.trim(),
        session_token: form.session_token.trim() || undefined,
        log_source: form.log_source,
        log_group_name:
          form.log_source === "cloudwatch" ? form.log_group_name.trim() : undefined,
      });
    },
    onSuccess: (result) => {
      setConnectError("");
      const account = result.verification.account ?? "your AWS account";
      const region = result.connection.region;
      const source = result.connection.log_source;
      setConnectSuccess(
        `Connected — verified AWS account ${account} (${source}, ${region}).` +
          (result.events.length > 0
            ? ` Loaded ${result.events.length} log events.`
            : " No recent logs in the last 30 minutes; live stream is active.")
      );
      setSelectedId(result.connection.id);
      setViewerData((prev) => ({
        ...prev,
        [result.connection.id]: {
          events: result.events,
          analysis: result.analysis,
          account: result.verification.account,
        },
      }));
      setForm((f) => ({
        ...f,
        access_key_id: "",
        secret_access_key: "",
        session_token: "",
      }));
      void invalidateMany(queryClient, [["cloud-connections"], ["dashboard-stats"]]);
    },
    onError: (e: Error) => {
      setConnectSuccess("");
      const msg = e.message;
      setConnectError(
        msg.includes("invalid") || msg.includes("Unable to connect")
          ? msg
          : `Unable to connect: ${msg}`
      );
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => cloudService.removeConnection(token, id),
    onSuccess: () => {
      if (selectedId) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["cloud-connections"] });
    },
  });

  const fetchHistorical = useMutation({
    mutationFn: (id: number) => cloudService.fetchLogs(token, id, 30),
    onSuccess: (res, id) => {
      setViewerData((prev) => ({
        ...prev,
        [id]: {
          events: res.events,
          analysis: res.analysis || {},
          account: prev[id]?.account,
        },
      }));
      void invalidateMany(queryClient, [["dashboard-stats"], ["logs"]]);
    },
  });

  const selected = connections.find((c) => c.id === selectedId);
  const canSubmit =
    form.connection_name.trim().length >= 2 &&
    form.access_key_id.trim().length === 20 &&
    form.secret_access_key.trim().length >= 40 &&
    (form.log_source !== "cloudwatch" || form.log_group_name.trim().length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cloud Connect"
        description="Connect AWS and stream live CloudTrail or CloudWatch logs with AI threat detection"
        badge={
          <Cloud className="h-8 w-8 text-primary drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]" />
        }
      />

      {/* How-to steps — always visible */}
      <Card className="glass-card-static border-primary/20 bg-primary/5">
        <CardContent className="flex flex-wrap gap-6 p-5">
          {STEPS.map((step, i) => (
            <div key={step} className="flex min-w-[200px] flex-1 items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <p className="text-sm text-muted-foreground">{step}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* LEFT: Connect form — always shown */}
        <div className="space-y-4 lg:col-span-5">
          <Card id="connect-aws-form" className="border-primary/30 shadow-glow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Link2 className="h-5 w-5 text-primary" />
                Connect AWS
              </CardTitle>
              <CardDescription>
                Enter valid AWS IAM credentials. The app verifies them live with AWS before
                saving the connection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Connection name
                </label>
                <Input
                  placeholder="e.g. Production AWS"
                  value={form.connection_name}
                  onChange={(e) =>
                    setForm({ ...form, connection_name: e.target.value })
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Region
                  </label>
                  <select
                    className="input-glow flex h-11 w-full rounded-lg border border-white/10 bg-background/60 px-3 text-sm"
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                  >
                    {AWS_REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Log source
                  </label>
                  <select
                    className="input-glow flex h-11 w-full rounded-lg border border-white/10 bg-background/60 px-3 text-sm"
                    value={form.log_source}
                    onChange={(e) =>
                      setForm({ ...form, log_source: e.target.value })
                    }
                  >
                    <option value="cloudtrail">CloudTrail</option>
                    <option value="cloudwatch">CloudWatch Logs</option>
                  </select>
                </div>
              </div>

              {form.log_source === "cloudwatch" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Log group name
                  </label>
                  <Input
                    placeholder="/aws/lambda/my-function"
                    value={form.log_group_name}
                    onChange={(e) =>
                      setForm({ ...form, log_group_name: e.target.value })
                    }
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />
                  Access Key ID
                </label>
                <Input
                  placeholder="AKIAIOSFODNN7EXAMPLE (20 characters)"
                  value={form.access_key_id}
                  onChange={(e) =>
                    setForm({ ...form, access_key_id: e.target.value })
                  }
                  autoComplete="off"
                  maxLength={128}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {form.access_key_id.trim().length}/20 characters
                  {form.access_key_id.trim().length > 0 &&
                    form.access_key_id.trim().length !== 20 &&
                    " — must be exactly 20"}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Secret Access Key
                </label>
                <Input
                  type="password"
                  placeholder="40-character secret from AWS IAM"
                  value={form.secret_access_key}
                  onChange={(e) =>
                    setForm({ ...form, secret_access_key: e.target.value })
                  }
                  autoComplete="off"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {form.secret_access_key.trim().length}/40 characters minimum
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Session token (optional)
                </label>
                <Input
                  placeholder="For temporary credentials only"
                  value={form.session_token}
                  onChange={(e) =>
                    setForm({ ...form, session_token: e.target.value })
                  }
                  autoComplete="off"
                />
              </div>

              {connectSuccess && (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                  {connectSuccess}
                </p>
              )}
              {connectError && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {connectError}
                </p>
              )}

                <Button
                  variant="cyber"
                  className="w-full h-12"
                  disabled={connect.isPending || !canSubmit}
                  onClick={() => {
                    setConnectError("");
                    connect.mutate();
                  }}
                >
                {connect.isPending ? "Verifying with AWS..." : "Connect to AWS"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your connections</CardTitle>
              <CardDescription>Click one to stream live logs →</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {connections.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/15 p-4 text-center text-sm text-muted-foreground">
                  <p>No connections yet.</p>
                  <p className="mt-1">Use the form above to add AWS.</p>
                </div>
              ) : (
                connections.map((c: CloudConnection) => (
                  <button
                    type="button"
                    key={c.id}
                    className={`w-full rounded-lg border p-3 text-left transition-all ${
                      selectedId === c.id
                        ? "border-primary bg-primary/10 shadow-glow-sm"
                        : "border-white/10 hover:border-primary/30 hover:bg-white/5"
                    }`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 font-medium text-sm">
                          {c.connection_name}
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.provider.toUpperCase()} · {c.region} · {c.log_source}
                        </p>
                        <p
                          className={`mt-1 text-xs font-medium capitalize ${
                            c.status === "connected"
                              ? "text-green-400"
                              : c.status === "error"
                                ? "text-red-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {c.status === "connected"
                            ? "Connected"
                            : c.status === "error"
                              ? "Unable to connect"
                              : c.status}
                          {c.last_error && c.status === "error" && ` — ${c.last_error}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove.mutate(c.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Live logs */}
        <div className="lg:col-span-7">
          {selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400">
                  <span className="live-pulse" />
                  <Radio className="h-3 w-3" />
                  Live stream — {selected.connection_name}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={fetchHistorical.isPending}
                  onClick={() => fetchHistorical.mutate(selected.id)}
                >
                  <RefreshCw
                    className={`mr-1 h-3 w-3 ${fetchHistorical.isPending ? "animate-spin" : ""}`}
                  />
                  Fetch last 30 min & analyze
                </Button>
              </div>
              <LiveLogViewer
                key={`${selected.id}-${viewerData[selected.id]?.events.length ?? 0}`}
                connectionId={selected.id}
                connectionName={selected.connection_name}
                initialEvents={viewerData[selected.id]?.events}
                initialAnalysis={viewerData[selected.id]?.analysis ?? null}
                verifiedAccount={viewerData[selected.id]?.account}
              />
            </div>
          ) : (
            <Card className="flex min-h-[420px] items-center justify-center border-dashed border-white/15">
              <CardContent className="max-w-md text-center">
                <Cloud className="mx-auto mb-4 h-14 w-14 text-primary/40" />
                <h3 className="font-display text-lg font-semibold text-foreground">
                  Live logs appear here
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {connections.length === 0
                    ? "Scroll up on the left, enter your AWS keys, and click Connect & verify."
                    : "Select a connection from the list on the left to start the live stream."}
                </p>
                {connections.length === 0 && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() =>
                      document
                        .getElementById("connect-aws-form")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    Go to connect form
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
