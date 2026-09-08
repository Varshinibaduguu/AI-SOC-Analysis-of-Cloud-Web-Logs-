"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Upload,
  FileText,
  BarChart3,
  Cloud,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/brand-logo";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/cloud", label: "Cloud Connect", icon: Cloud },
  { href: "/upload", label: "Upload Center", icon: Upload },
  { href: "/reports", label: "Incident Reports", icon: FileText },
  { href: "/analytics", label: "Threat Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { fullName, role, logout } = useAuthStore();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-white/[0.06] bg-card/30 shadow-glass backdrop-blur-2xl">
      <div className="relative border-b border-white/[0.06] p-6">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <BrandMark
          iconClassName="h-10 w-10"
          titleClassName="text-lg"
          subtitle="Analysis System"
          priority
        />
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-300",
                active
                  ? "nav-glow-active"
                  : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  active ? "text-primary" : "group-hover:text-primary/80"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-4">
        <div className="mb-3 rounded-lg border border-white/[0.06] bg-gradient-to-br from-white/[0.06] to-transparent p-3 backdrop-blur">
          <p className="truncate text-sm font-semibold">{fullName || "Analyst"}</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-primary/70 capitalize">
            {role?.replace("_", " ") || "security analyst"}
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-red-400"
          onClick={() => {
            logout();
            window.location.href = "/login";
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
