"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { bucketLabel, money, moneyCompact, rMultiple } from "@/lib/format";
import type { Bucket, SeriesPoint } from "@/lib/types";
import type { ChartUnit } from "@/components/charts/pnl-bar-chart";

const config: ChartConfig = {
  cumulative: { label: "Kümülatif K/Z" },
  cumulative_r: { label: "Kümülatif R" },
};

/** Sermaye eğrisi — kümülatif sonuç, para ya da R biriminde. */
export function EquityChart({
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
  const dataKey = isR ? "cumulative_r" : "cumulative";

  const rows = data.map((d) => ({ ...d, label: bucketLabel(d.bucket, bucket) }));
  const last = rows.at(-1);
  const lastValue = last ? (isR ? last.cumulative_r : last.cumulative) : 0;
  const stroke = lastValue >= 0 ? "var(--profit)" : "var(--loss)";

  return (
    <ChartContainer config={config} className={className}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>
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
              formatter={(value) => (
                <span className="num">
                  {isR
                    ? rMultiple(Number(value))
                    : money(Number(value), currency, { signed: true })}
                </span>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={stroke}
          strokeWidth={2}
          fill="url(#equityFill)"
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
