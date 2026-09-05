"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { BUCKETS } from "@/lib/constants";
import { statsApi, tradesApi } from "@/lib/api";
import {
  DEFAULT_FILTERS,
  FilterBar,
  filtersToQuery,
  type Filters,
} from "@/components/filter-bar";
import { useMeta } from "@/hooks/use-meta";
import { Metric, MetricRow, toneOf } from "@/components/metric";
import { RTape } from "@/components/charts/r-tape";
import { EquityChart } from "@/components/charts/equity-chart";
import { PnlBarChart, type ChartUnit } from "@/components/charts/pnl-bar-chart";
import { TradesTable } from "@/components/trades-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, percent, rMultiple, ratio } from "@/lib/format";
import type { Bucket, SeriesPoint, Summary, Trade } from "@/lib/types";

const TAPE_LIMIT = 200;

export default function DashboardPage() {
  const { funds } = useMeta();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [bucket, setBucket] = useState<Bucket>("day");
  const [unit, setUnit] = useState<ChartUnit>("r");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [closed, setClosed] = useState<Trade[]>([]);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  // Para birimi seçili hesaptan; seçim yoksa ilk hesabınki.
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
      const [s, ser, done, open] = await Promise.all([
        statsApi.summary(query),
        statsApi.series(bucket, query),
        tradesApi.list({ ...query, status: "closed", limit: TAPE_LIMIT }),
        tradesApi.list({ ...query, status: "open", limit: 20 }),
      ]);
      setSummary(s);
      setSeries(ser);
      setClosed(done.items);
      setOpenTrades(open.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [filters, bucket]);

  useEffect(() => {
    void load();
  }, [load]);

  const isEmpty = !loading && summary?.trade_count === 0;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium text-pretty">Panel</h1>
        <FilterBar filters={filters} onChange={setFilters} funds={funds} />
      </header>

      {isEmpty ? (
        <EmptyState hasFunds={funds.length > 0} />
      ) : (
        <>
          {/* ---------------------------------------------- kahraman */}
          <section className="border-y border-border">
            <div className="grid gap-6 px-4 py-6 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-center">
              <Metric
                size="hero"
                value={rMultiple(summary?.total_r)}
                label="toplam R"
                tone={toneOf(summary?.total_r)}
                sub={
                  summary?.avg_r != null
                    ? `işlem başına ${ratio(summary.avg_r)}R`
                    : "risk tutarı girilmiş işlem yok"
                }
                loading={loading}
              />
              <RTape trades={closed} />
            </div>

            <MetricRow className="border-t border-border sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                size="sm"
                value={money(summary?.net_pnl, currency, { signed: true })}
                label="net kâr / zarar"
                tone={toneOf(summary?.net_pnl)}
                loading={loading}
              />
              <Metric
                size="sm"
                value={percent(summary?.win_rate)}
                label="kazanma oranı"
                sub={`${summary?.win_count ?? 0} kazanç, ${summary?.loss_count ?? 0} kayıp`}
                loading={loading}
              />
              <Metric
                size="sm"
                value={ratio(summary?.profit_factor)}
                label="profit factor"
                sub={`beklenti ${money(summary?.expectancy, currency, { signed: true })}`}
                loading={loading}
              />
              <Metric
                size="sm"
                value={rMultiple(-Math.abs(summary?.max_drawdown_r ?? 0))}
                label="en derin geri çekilme"
                tone={summary?.max_drawdown_r ? "short" : "neutral"}
                sub={money(summary?.max_drawdown, currency)}
                loading={loading}
              />
            </MetricRow>
          </section>

          {/* ------------------------------------------------ seyir */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-base font-medium">
                {unit === "r" ? "Dönemsel R" : "Dönemsel kâr / zarar"}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs value={unit} onValueChange={(v) => setUnit(v as ChartUnit)}>
                  <TabsList>
                    <TabsTrigger value="r">R</TabsTrigger>
                    <TabsTrigger value="money">Para</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Tabs value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
                  <TabsList>
                    {BUCKETS.map((b) => (
                      <TabsTrigger key={b.value} value={b.value}>
                        {b.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {loading ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span className="sr-only">Yükleniyor…</span>
              </div>
            ) : series.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Bu aralıkta kapanmış işlem yok.
              </p>
            ) : (
              <div className="space-y-8 border-y border-border py-6">
                <PnlBarChart
                  data={series}
                  bucket={bucket}
                  currency={currency}
                  unit={unit}
                  className="h-56 w-full"
                />
                <EquityChart
                  data={series}
                  bucket={bucket}
                  currency={currency}
                  unit={unit}
                  className="h-48 w-full"
                />
              </div>
            )}
          </section>

          {/* --------------------------------------- açık pozisyonlar */}
          {openTrades.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-medium">
                Açık pozisyonlar{" "}
                <span className="num text-muted-foreground">{openTrades.length}</span>
              </h2>
              <TradesTable trades={openTrades} />
            </section>
          )}

          {/* ------------------------------------------------ defter */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-medium">Defter</h2>
              <Button asChild variant="ghost" size="sm">
                <Link href="/trades">Tüm işlemler</Link>
              </Button>
            </div>
            <TradesTable trades={closed.slice(0, 12)} loading={loading} />
          </section>
        </>
      )}
    </div>
  );
}

function EmptyState({ hasFunds }: { hasFunds: boolean }) {
  return (
    <div className="border-y border-border py-20 text-center">
      <h2 className="text-lg font-medium">Defter boş</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-pretty text-muted-foreground">
        {hasFunds
          ? "İlk işlemini kaydet. R, kazanma oranı ve geri çekilme buradan itibaren hesaplanır."
          : "Önce Ayarlar'dan bir hesap tanımla, sonra ilk işlemini kaydet."}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        {!hasFunds && (
          <Button asChild variant="outline">
            <Link href="/settings">Hesap Tanımla</Link>
          </Button>
        )}
        <Button asChild>
          <Link href="/trades/new">
            <Plus className="size-4" aria-hidden="true" />
            İşlem Ekle
          </Link>
        </Button>
      </div>
    </div>
  );
}
