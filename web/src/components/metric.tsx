import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type Tone = "long" | "short" | "neutral";
type Size = "hero" | "lg" | "sm";

const SIZE: Record<Size, string> = {
  hero: "text-5xl font-medium tracking-tight sm:text-6xl",
  lg: "text-2xl font-medium",
  sm: "text-lg font-medium",
};

/**
 * Tek ölçüm. Değer üstte, etiket altında sönük — kart yok, kenarlık yok.
 * Gruplama ve ayrım üst bileşenin işi (MetricRow).
 */
export function Metric({
  value,
  label,
  sub,
  tone = "neutral",
  size = "lg",
  loading,
  className,
}: {
  value: React.ReactNode;
  label: string;
  sub?: React.ReactNode;
  tone?: Tone;
  size?: Size;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("min-w-0", className)}>
        <Skeleton className={cn("w-28", size === "hero" ? "h-12" : "h-7")} />
        <Skeleton className="mt-2 h-3 w-16" />
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          "metric-value truncate",
          SIZE[size],
          tone === "long" && "text-long",
          tone === "short" && "text-short",
        )}
      >
        {value}
      </div>
      <span className="metric-label truncate">{label}</span>
      {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Ölçümleri dikey kılcal çizgilerle ayıran şerit. */
export function MetricRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden bg-border",
        "[&>*]:bg-background [&>*]:px-4 [&>*]:py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Sayının işaretine göre ton. */
export function toneOf(value: number | null | undefined): Tone {
  if (value === null || value === undefined || value === 0) return "neutral";
  return value > 0 ? "long" : "short";
}
