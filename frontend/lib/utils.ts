import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function severityColor(score: number) {
  if (score >= 0.8) return "text-red-400";
  if (score >= 0.6) return "text-orange-400";
  if (score >= 0.4) return "text-yellow-400";
  return "text-green-400";
}
