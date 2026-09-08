import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  iconClassName?: string;
  titleClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
  centered?: boolean;
  priority?: boolean;
}

export function BrandMark({
  className,
  iconClassName,
  titleClassName,
  subtitle,
  subtitleClassName,
  centered = false,
  priority = false,
}: BrandMarkProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        centered && "justify-center",
        className
      )}
    >
      <Image
        src="/brand/soc-icon.png"
        alt="SOC"
        width={48}
        height={48}
        priority={priority}
        className={cn("h-10 w-10 shrink-0 object-contain", iconClassName)}
      />
      <div className={cn("min-w-0", centered && "text-left")}>
        <p
          className={cn(
            "font-display font-bold tracking-tight text-gradient",
            titleClassName ?? "text-lg"
          )}
        >
          AI SOC
        </p>
        {subtitle && (
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground",
              subtitleClassName
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
