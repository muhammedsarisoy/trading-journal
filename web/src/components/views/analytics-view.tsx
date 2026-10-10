"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { BreakdownChart } from "@/components/charts/breakdown-chart";
import { PnlBarChart, type ChartUnit } from "@/components/charts/pnl-bar-chart";
import { statsApi } from "@/lib/api";
import { BREAKDOWN_DIMS, BUCKETS, EMOTION_LABELS, WEEKDAY_LABELS } from "@/lib/constants";
import { money, percent, pnlTone, rMultiple, ratio } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { BreakdownDim, BreakdownRow, Bucket, SeriesPoint, TradeQuery } from "@/lib/types";

/** Boyuta göre anahtarı okunur etikete çevirir. */
function labelFor(dim: BreakdownDim) {
  return (key: string) => {
    if (dim === "emotion_before" || dim === "emotion_after") return EMOTION_LABELS[key] ?? key;
    if (dim === "weekday") return WEEKDAY_LABELS[key] ?? key;
    if (dim === "hour") return `${key}:00`;
    if (dim === "confidence" || dim === "stress") return `${key}/5`;
    if (dim === "direction") return key === "long" ? "Long" : key === "short" ? "Short" : key;
    return key;
  };
}

function Loading({ height }: { height: string }) {
  return (
    <div className={cn("flex items-center justify-center text-muted-foreground", height)}>
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Gün, hafta, ay… kovalarında K/Z ya da R çubukları. Süzgeç paneldendir. */
export function PeriodsView({ query, currency }: { query: TradeQuery; currency: string }) {
  const [bucket, setBucket] = useState<Bucket>("month");
  const [unit, setUnit] = useState<ChartUnit>("money");
  const [series, setSeries] = useState<SeriesPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    statsApi
      .series(bucket, query)
      .then((s) => !cancelled && setSeries(s))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Dönemler yüklenemedi"));
    return () => {
      cancelled = true;
    };
  }, [bucket, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={unit} onValueChange={(v) => setUnit(v as ChartUnit)}>
          <TabsList>
            <TabsTrigger value="money">Para</TabsTrigger>
            <TabsTrigger value="r">R</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
          <SelectTrigger size="sm" className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUCKETS.map((b) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {series === null ? (
        <Loading height="h-[280px]" />
      ) : series.length === 0 ? (
        <Empty>Bu aralıkta kapanmış işlem yok.</Empty>
      ) : (
        <PnlBarChart
          data={series}
          bucket={bucket}
          currency={currency}
          unit={unit}
          className="h-[280px] w-full"
        />
      )}
    </div>
  );
}

/** Seçilen boyuta (strateji, sembol, duygu…) göre performans. */
export function BreakdownView({ query, currency }: { query: TradeQuery; currency: string }) {
  const [dim, setDim] = useState<BreakdownDim>("setup");
  const [rows, setRows] = useState<BreakdownRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    statsApi
      .breakdown(dim, query)
      .then((r) => !cancelled && setRows(r))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Kırılım yüklenemedi"));
    return () => {
      cancelled = true;
    };
  }, [dim, query]);

  const dimGroups = useMemo(() => {
    const groups: Record<string, typeof BREAKDOWN_DIMS> = {};
    for (const d of BREAKDOWN_DIMS) (groups[d.group] ??= []).push(d);
    return groups;
  }, []);

  const format = labelFor(dim);

  return (
    <div className="space-y-4">
      <Select value={dim} onValueChange={(v) => setDim(v as BreakdownDim)}>
        <SelectTrigger size="sm" className="w-[220px]" aria-label="Kırılım boyutu">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(dimGroups).map(([group, items]) => (
            <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
              {items.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {rows === null ? (
        <Loading height="h-[280px]" />
      ) : rows.length === 0 ? (
        <Empty>Bu boyutta veri yok.</Empty>
      ) : (
        <>
          <BreakdownChart
            rows={rows.slice(0, 12)}
            currency={currency}
            labelFor={format}
            className="h-[300px] w-full"
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Değer</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                  <TableHead className="text-right">Kazanma</TableHead>
                  <TableHead className="text-right">Ort. R</TableHead>
                  <TableHead className="text-right">Toplam R</TableHead>
                  <TableHead className="text-right">Net K/Z</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{format(r.key)}</TableCell>
                    <TableCell className="num text-right">{r.trade_count}</TableCell>
                    <TableCell className="num text-right">{percent(r.win_rate)}</TableCell>
                    <TableCell className={cn("num text-right", pnlTone(r.avg_r))}>
                      {r.avg_r === null ? "—" : `${ratio(r.avg_r)}R`}
                    </TableCell>
                    <TableCell className={cn("num text-right", pnlTone(r.total_r))}>
                      {rMultiple(r.total_r)}
                    </TableCell>
                    <TableCell className={cn("num text-right font-medium", pnlTone(r.net_pnl))}>
                      {money(r.net_pnl, currency, { signed: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
