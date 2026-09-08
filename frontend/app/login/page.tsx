"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { AmbientBackground } from "@/components/layout/ambient-background";
import { BrandMark } from "@/components/brand/brand-logo";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await authService.login(email, password);
      setAuth({
        token: res.access_token,
        userId: res.user_id,
        fullName: res.full_name,
        role: res.role,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
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
            <CardHeader className="text-center pb-2">
              <BrandMark
                centered
                className="mx-auto mb-5 animate-float"
                iconClassName="h-12 w-12"
                titleClassName="text-2xl"
                priority
              />
              <CardDescription className="text-base">
                Enterprise Security Operations Platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive backdrop-blur">
                    {error}
                  </p>
                )}
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="analyst@company.com"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Password
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" variant="cyber" className="w-full h-12" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
                <p className="flex items-center justify-center gap-1.5 text-xs text-primary/90">
                  <Sparkles className="h-3.5 w-3.5" />
                  Demo: analyst@soc-copilot.com / Analyst123!
                </p>
              </div>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                No account?{" "}
                <Link
                  href="/register"
                  className="font-medium text-primary hover:text-cyan-300 transition-colors"
                >
                  Register
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
