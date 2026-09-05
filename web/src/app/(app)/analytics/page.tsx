"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  DEFAULT_FILTERS,
  FilterBar,
  filtersToQuery,
  type Filters,
} from "@/components/filter-bar";
import { BreakdownChart } from "@/components/charts/breakdown-chart";
import { PnlBarChart, type ChartUnit } from "@/components/charts/pnl-bar-chart";
import { useMeta } from "@/hooks/use-meta";
import { statsApi } from "@/lib/api";
import { BREAKDOWN_DIMS, BUCKETS, EMOTION_LABELS, WEEKDAY_LABELS } from "@/lib/constants";
import { money, percent, pnlTone, rMultiple, ratio } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { BreakdownDim, BreakdownRow, Bucket, SeriesPoint } from "@/lib/types";

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

export default function AnalyticsPage() {
  const { funds } = useMeta();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [bucket, setBucket] = useState<Bucket>("month");
  const [unit, setUnit] = useState<ChartUnit>("money");
  const [dim, setDim] = useState<BreakdownDim>("setup");

  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [rows, setRows] = useState<BreakdownRow[]>([]);
  const [loading, setLoading] = useState(true);

  const currency = useMemo(() => {
    if (filters.currency !== "__all__") return filters.currency;
    if (filters.fundId !== "__all__") {
      return funds.find((f) => f.id === filters.fundId)?.currency ?? "USD";
    }
    return funds[0]?.currency ?? "USD";
  }, [filters, funds]);

  const load = useCallback(async () => {
    setLoading(true);
    const query = filtersToQuery(filters);
    try {
      const [ser, br] = await Promise.all([
        statsApi.series(bucket, query),
        statsApi.breakdown(dim, query),
      ]);
      setSeries(ser);
      setRows(br);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analiz yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [filters, bucket, dim]);

  useEffect(() => {
    void load();
  }, [load]);

  const dimGroups = useMemo(() => {
    const groups: Record<string, typeof BREAKDOWN_DIMS> = {};
    for (const d of BREAKDOWN_DIMS) {
      (groups[d.group] ??= []).push(d);
    }
    return groups;
  }, []);

  const format = labelFor(dim);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analiz</h1>
          <p className="text-sm text-muted-foreground">
            Hangi karar ve hangi ruh hali para kazandırıyor.
          </p>
        </div>
        <FilterBar filters={filters} onChange={setFilters} funds={funds} />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">
              {unit === "r" ? "Dönemsel R" : "Dönemsel kâr / zarar"}
            </CardTitle>
            <CardDescription>Günlük, haftalık, aylık, 6 aylık ve yıllık kırılım.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={unit} onValueChange={(v) => setUnit(v as ChartUnit)}>
              <TabsList>
                <TabsTrigger value="money" className="text-xs">
                  Para
                </TabsTrigger>
                <TabsTrigger value="r" className="text-xs">
                  R
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
              <TabsList>
                {BUCKETS.map((b) => (
                  <TabsTrigger key={b.value} value={b.value} className="text-xs">
                    {b.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-[280px] items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : series.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Bu aralıkta kapanmış işlem yok.
            </p>
          ) : (
            <PnlBarChart
              data={series}
              bucket={bucket}
              currency={currency}
              unit={unit}
              className="h-[280px] w-full"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Kırılım</CardTitle>
            <CardDescription>Seçtiğin boyuta göre performans dağılımı.</CardDescription>
          </div>
          <Select value={dim} onValueChange={(v) => setDim(v as BreakdownDim)}>
            <SelectTrigger className="w-[220px]">
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
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex h-[280px] items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Bu boyutta veri yok.
            </p>
          ) : (
            <>
              <BreakdownChart
                rows={rows.slice(0, 12)}
                currency={currency}
                labelFor={format}
                className="h-[340px] w-full"
              />

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Değer</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                      <TableHead className="text-right">Kazanç</TableHead>
                      <TableHead className="text-right">Kazanma oranı</TableHead>
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
                        <TableCell className="num text-right">{r.win_count}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
}
