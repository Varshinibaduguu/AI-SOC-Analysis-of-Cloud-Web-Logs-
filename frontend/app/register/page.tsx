"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AmbientBackground } from "@/components/layout/ambient-background";
import { BrandMark } from "@/components/brand/brand-logo";
import { authService } from "@/services/auth.service";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await authService.register(form);
      router.push("/login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <AmbientBackground />

      <div className="relative w-full max-w-md animate-fade-in-up">
        <div className="shine-border shadow-glow-lg">
          <Card className="glass-card-static border-0 bg-transparent shadow-none">
            <CardHeader className="text-center">
              <BrandMark
                centered
                className="mx-auto mb-4"
                iconClassName="h-11 w-11"
                titleClassName="text-xl"
                priority
              />
              <CardTitle className="font-display text-2xl text-gradient">
                Analyst Registration
              </CardTitle>
              <CardDescription>
                Create your Security Analyst account for AI SOC ANALYSIS SYSTEM
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Full Name
                  </label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Password
                  </label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    minLength={8}
                    required
                  />
                </div>
                <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary/90">
                  All accounts are registered as <strong>Security Analyst</strong> with full
                  access to upload, cloud connect, reports, and AI chat.
                </p>
                <Button type="submit" variant="cyber" className="w-full h-12" disabled={loading}>
                  {loading ? "Creating..." : "Create analyst account"}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-primary hover:text-cyan-300">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
