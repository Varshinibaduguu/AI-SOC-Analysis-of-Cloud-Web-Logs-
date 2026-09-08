"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { AmbientBackground } from "./ambient-background";
import { useAuthStore } from "@/store/auth-store";

function AuthLoading() {
  return (
    <div className="relative flex min-h-screen items-center justify-center">
      <AmbientBackground />
      <div className="relative flex flex-col items-center gap-4">
        <div className="h-14 w-14 animate-spin rounded-full border-2 border-primary/30 border-t-primary shadow-glow-sm" />
        <p className="text-sm font-medium tracking-widest text-primary/80 uppercase">
          Securing session
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !token) {
      router.replace("/login");
    }
  }, [mounted, token, router]);

  if (!mounted) {
    return <AuthLoading />;
  }

  if (!token) {
    return <AuthLoading />;
  }

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <Sidebar />
      <main className="relative ml-64 min-h-screen p-8 lg:p-10">{children}</main>
    </div>
  );
}
