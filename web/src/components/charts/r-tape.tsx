import { rMultiple } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Trade } from "@/lib/types";

/**
 * R şeridi — dönemdeki her kapalı işlem, ortak eksende tek çubuk.
 * Üstünde kümülatif R çizgisi.
 *
 * viewBox işlem sayısına göre kurulur ve `preserveAspectRatio="none"` ile
 * genişliğe yayılır; böylece ölçüm için JS'e gerek kalmaz. Çubuklar dikdörtgen
 * olduğu için yatay esneme onları bozmaz, çizgi `non-scaling-stroke` ile
 * kalınlığını korur.
 */
export function RTape({
  trades,
  className,
}: {
  trades: Trade[];
  className?: string;
}) {
  // Eskiden yeniye: defter kronolojik okunur.
  const rows = [...trades]
    .filter((t) => t.r_multiple !== null)
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at));

  if (rows.length === 0) {
    return (
      <p className={cn("py-6 text-sm text-muted-foreground", className)}>
        Bu aralıkta R değeri girilmiş kapalı işlem yok.
      </p>
    );
  }

  const values = rows.map((t) => t.r_multiple as number);
  const peak = Math.max(1, ...values.map(Math.abs));

  // Kümülatif eğri kendi ölçeğinde; şeridin üst yarısına oturur.
  const cumulative: number[] = [];
  values.reduce((sum, v) => {
    const next = sum + v;
    cumulative.push(next);
    return next;
  }, 0);
  const cumPeak = Math.max(1, ...cumulative.map(Math.abs));

  const W = rows.length;
  const H = 100;
  const mid = H / 2;

  const line = cumulative
    .map((c, i) => `${i + 0.5},${mid - (c / cumPeak) * (mid - 6)}`)
    .join(" ");

  const total = cumulative.at(-1) ?? 0;

  return (
    <figure className={cn("space-y-2", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label={`${rows.length} işlemin R dizisi, toplam ${rMultiple(total)}`}
      >
        <line
          x1="0"
          y1={mid}
          x2={W}
          y2={mid}
          stroke="var(--rule-strong)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {values.map((v, i) => {
          const h = (Math.abs(v) / peak) * (mid - 4);
          return (
            <rect
              key={rows[i].id}
              x={i + 0.15}
              width={0.7}
              y={v >= 0 ? mid - h : mid}
              height={Math.max(h, 0.5)}
              fill={v >= 0 ? "var(--long)" : "var(--short)"}
              opacity={0.85}
            />
          );
        })}

        <polyline
          points={line}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={1.25}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.55}
        />
      </svg>

      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span>{rows.length} kapalı işlem, eskiden yeniye</span>
        <span>ince çizgi kümülatif R</span>
      </figcaption>
    </figure>
  );
}
