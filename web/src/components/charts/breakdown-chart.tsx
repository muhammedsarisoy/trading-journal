"use client";

import { Bar, BarChart, Cell, LabelList, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { money, moneyCompact } from "@/lib/format";
import type { BreakdownRow } from "@/lib/types";

const config: ChartConfig = {
  net_pnl: { label: "Net K/Z" },
};

/** Yatay kırılım grafiği: strateji, duygu, sembol vb. başına net K/Z. */
export function BreakdownChart({
  rows,
  currency,
  labelFor,
  className,
}: {
  rows: BreakdownRow[];
  currency: string;
  labelFor?: (key: string) => string;
  className?: string;
}) {
  const data = rows.map((r) => ({ ...r, label: labelFor ? labelFor(r.key) : r.key }));

  return (
    <ChartContainer config={config} className={className}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
      >
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => moneyCompact(v, currency)}
        />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={150}
          tickMargin={4}
        />
        <ReferenceLine x={0} stroke="var(--border)" />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelKey="label"
              formatter={(value, _name, item) => (
                <div className="flex flex-col gap-0.5">
                  <span className="num">{money(Number(value), currency, { signed: true })}</span>
                  <span className="text-xs text-muted-foreground">
                    {item?.payload?.trade_count} işlem · {item?.payload?.win_count} kazanç
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="net_pnl" radius={3} barSize={18}>
          {data.map((row) => (
            <Cell key={row.key} fill={row.net_pnl >= 0 ? "var(--profit)" : "var(--loss)"} />
          ))}
          <LabelList
            dataKey="net_pnl"
            position="right"
            className="fill-muted-foreground"
            fontSize={11}
            formatter={(v) => moneyCompact(Number(v ?? 0), currency)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
