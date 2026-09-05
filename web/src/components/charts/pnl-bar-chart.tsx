"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { bucketLabel, money, moneyCompact, rMultiple } from "@/lib/format";
import type { Bucket, SeriesPoint } from "@/lib/types";

export type ChartUnit = "money" | "r";

const config: ChartConfig = {
  net_pnl: { label: "Net K/Z" },
  net_r: { label: "Net R" },
};

/** Dönem başına net sonuç. Pozitif yeşil, negatif kırmızı. */
export function PnlBarChart({
  data,
  bucket,
  currency,
  unit = "money",
  className,
}: {
  data: SeriesPoint[];
  bucket: Bucket;
  currency: string;
  unit?: ChartUnit;
  className?: string;
}) {
  const isR = unit === "r";
  const dataKey = isR ? "net_r" : "net_pnl";

  const rows = data.map((d) => ({
    ...d,
    label: bucketLabel(d.bucket, bucket),
    value: isR ? d.net_r : d.net_pnl,
  }));

  return (
    <ChartContainer config={config} className={className}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(v: number) => (isR ? `${v.toFixed(1)}R` : moneyCompact(v, currency))}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelKey="label"
              formatter={(value, _name, item) => (
                <div className="flex flex-col gap-0.5">
                  <span className="num">
                    {isR
                      ? rMultiple(Number(value))
                      : money(Number(value), currency, { signed: true })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item?.payload?.trade_count} işlem · {item?.payload?.win_count} kazanç
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey={dataKey} radius={[3, 3, 0, 0]}>
          {rows.map((row) => (
            <Cell key={row.bucket} fill={row.value >= 0 ? "var(--profit)" : "var(--loss)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
