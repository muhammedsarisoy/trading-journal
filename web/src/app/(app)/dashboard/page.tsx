"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { statsApi, tradesApi } from "@/lib/api";
import {
  currencyOf,
  DEFAULT_FILTERS,
  FilterBar,
  filtersToQuery,
  type Filters,
} from "@/components/filter-bar";
import { useMeta } from "@/hooks/use-meta";
import { Metric, toneOf } from "@/components/metric";
import { EquityChart } from "@/components/charts/equity-chart";
import { type ChartUnit } from "@/components/charts/pnl-bar-chart";
import { TradesTable } from "@/components/trades-table";
import { BreakdownView, PeriodsView } from "@/components/views/analytics-view";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, percent, rMultiple, ratio } from "@/lib/format";
import type { SeriesPoint, Summary, Trade } from "@/lib/types";

const RECENT_LIMIT = 10;

export default function DashboardPage() {
  const { funds } = useMeta();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [unit, setUnit] = useState<ChartUnit>("r");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [recent, setRecent] = useState<Trade[]>([]);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const currency = useMemo(() => currencyOf(filters, funds), [filters, funds]);
  // Alt sekmeler aynı süzgeci kullanır; nesne değişmedikçe yeniden yüklenmesinler.
  const query = useMemo(() => filtersToQuery(filters), [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, ser, done, open] = await Promise.all([
        statsApi.summary(query),
        statsApi.series("day", query),
        tradesApi.list({ ...query, status: "closed", limit: RECENT_LIMIT }),
        tradesApi.list({ ...query, status: "open", limit: 20 }),
      ]);
      setSummary(s);
      setSeries(ser);
      setRecent(done.items);
      setOpenTrades(open.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const isEmpty = !loading && summary?.trade_count === 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium">Panel</h1>
        <FilterBar filters={filters} onChange={setFilters} funds={funds} />
      </header>

      {isEmpty ? (
        <EmptyState hasFunds={funds.length > 0} />
      ) : (
        <>
          {/* Sonuç solda, nasıl gelindiği sağda: tek bakışta okunur. */}
          <section className="grid gap-8 lg:grid-cols-[minmax(16rem,1fr)_2fr] lg:items-end">
            <div className="space-y-6">
              <Metric
                size="hero"
                value={money(summary?.net_pnl, currency, { signed: true })}
                label="net kâr / zarar"
                sub={
                  summary
                    ? `${rMultiple(summary.total_r)} · ${summary.closed_count} kapalı işlem`
                    : undefined
                }
                tone={toneOf(summary?.net_pnl)}
                loading={loading}
              />
              <dl className="grid grid-cols-3 gap-4">
                <SmallStat
                  label="kazanma"
                  value={percent(summary?.win_rate)}
                  hint={`${summary?.win_count ?? 0}K / ${summary?.loss_count ?? 0}Z`}
                  loading={loading}
                />
                <SmallStat
                  label="işlem başına"
                  value={summary?.avg_r != null ? `${ratio(summary.avg_r)}R` : "—"}
                  hint={`PF ${ratio(summary?.profit_factor)}`}
                  loading={loading}
                />
                <SmallStat
                  label="geri çekilme"
                  value={rMultiple(-Math.abs(summary?.max_drawdown_r ?? 0))}
                  hint="en derin"
                  loading={loading}
                  negative={Boolean(summary?.max_drawdown_r)}
                />
              </dl>
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm text-muted-foreground">
                  {unit === "r" ? "Kümülatif R" : "Kümülatif kâr / zarar"}
                </h2>
                <Tabs value={unit} onValueChange={(v) => setUnit(v as ChartUnit)}>
                  <TabsList>
                    <TabsTrigger value="r">R</TabsTrigger>
                    <TabsTrigger value="money">Para</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {loading ? (
                <div className="flex h-56 items-center justify-center text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span className="sr-only">Yükleniyor…</span>
                </div>
              ) : series.length === 0 ? (
                <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                  Bu aralıkta kapanmış işlem yok.
                </p>
              ) : (
                <EquityChart
                  data={series}
                  bucket="day"
                  currency={currency}
                  unit={unit}
                  className="h-56 w-full"
                />
              )}
            </div>
          </section>

          {openTrades.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm text-muted-foreground">
                Açık pozisyonlar <span className="num">{openTrades.length}</span>
              </h2>
              <TradesTable trades={openTrades} />
            </section>
          )}

          <Tabs defaultValue="recent" className="gap-4">
            <TabsList>
              <TabsTrigger value="recent">Son işlemler</TabsTrigger>
              <TabsTrigger value="periods">Dönemler</TabsTrigger>
              <TabsTrigger value="breakdown">Kırılım</TabsTrigger>
            </TabsList>
            <TabsContent value="recent" className="space-y-2">
              <TradesTable trades={recent} loading={loading} />
              <Button asChild variant="ghost" size="sm">
                <Link href="/trades">Tüm işlemler</Link>
              </Button>
            </TabsContent>
            <TabsContent value="periods">
              <PeriodsView query={query} currency={currency} />
            </TabsContent>
            <TabsContent value="breakdown">
              <BreakdownView query={query} currency={currency} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function SmallStat({
  label,
  value,
  hint,
  loading,
  negative,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  loading?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={negative ? "num mt-1 text-lg text-short" : "num mt-1 text-lg"}>
        {loading ? "…" : value}
      </dd>
      {hint && !loading && <dd className="truncate text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function EmptyState({ hasFunds }: { hasFunds: boolean }) {
  return (
    <div className="py-20 text-center">
      <h2 className="text-lg font-medium">Defter boş</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-pretty text-muted-foreground">
        {hasFunds
          ? "İlk işlemini kaydet. R, kazanma oranı ve geri çekilme buradan itibaren hesaplanır."
          : "Önce bir hesap tanımla, sonra ilk işlemini kaydet."}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        {!hasFunds && (
          <Button asChild variant="outline">
            <Link href="/settings">Hesap tanımla</Link>
          </Button>
        )}
        <Button asChild>
          <Link href="/trades/new">
            <Plus className="size-4" aria-hidden="true" />
            İşlem ekle
          </Link>
        </Button>
      </div>
    </div>
  );
}
