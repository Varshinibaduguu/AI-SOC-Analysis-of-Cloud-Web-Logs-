"use client";

import { useQuery } from "@tanstack/react-query";
import { Shield, User, Mail, Hash, BadgeCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth-store";
import { formatDate } from "@/lib/utils";

function ProfileRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const token = useAuthStore((s) => s.token)!;
  const { fullName, role, userId } = useAuthStore();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => authService.me(token),
  });

  const displayName = profile?.full_name || fullName || "Analyst";
  const displayRole = (profile?.role || role || "security_analyst").replace("_", " ");
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Settings"
        description="Manage your analyst profile and workspace preferences"
      />

      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="border-b border-white/[0.06] bg-gradient-to-r from-primary/10 via-transparent to-violet-500/5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 text-xl font-bold text-white shadow-glow-sm">
              {initials}
            </div>
            <div>
              <CardTitle className="font-display text-xl">{displayName}</CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium capitalize text-primary">
                  <BadgeCheck className="h-3 w-3" />
                  {displayRole}
                </span>
                <span className="text-muted-foreground">AI SOC ANALYSIS SYSTEM</span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-6">
          <ProfileRow icon={User} label="Full name" value={displayName} />
          <ProfileRow icon={Mail} label="Email" value={profile?.email ?? "—"} />
          <ProfileRow icon={Hash} label="Analyst ID" value={String(profile?.id ?? userId ?? "—")} />
          {profile?.created_at && (
            <ProfileRow
              icon={Shield}
              label="Member since"
              value={formatDate(String(profile.created_at))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace</CardTitle>
          <CardDescription>
            Your account has full access to cloud connectivity, log analysis, incident
            reporting, and AI-assisted investigations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li className="rounded-lg border border-white/[0.06] px-3 py-2">
              Cloud Connect & live log streaming
            </li>
            <li className="rounded-lg border border-white/[0.06] px-3 py-2">
              Upload Center & threat detection
            </li>
            <li className="rounded-lg border border-white/[0.06] px-3 py-2">
              Incident reports & exports
            </li>
            <li className="rounded-lg border border-white/[0.06] px-3 py-2">
              AI chat with security context
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
