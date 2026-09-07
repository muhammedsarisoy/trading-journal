"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addMonths, format, isSameMonth, parseISO, startOfMonth } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { tradesApi } from "@/lib/api";
import {
  ALL,
  currencyOf,
  DEFAULT_FILTERS,
  FilterBar,
  type Filters,
} from "@/components/filter-bar";
import { useMeta } from "@/hooks/use-meta";
import { Metric, MetricRow } from "@/components/metric";
import { PnlCalendar, groupByDay, type CalendarUnit } from "@/components/pnl-calendar";
import { RTape } from "@/components/charts/r-tape";
import { TradesTable } from "@/components/trades-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, percent, rMultiple } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Trade } from "@/lib/types";

const MONTH_LIMIT = 500;

export default function CalendarPage() {
  const { funds } = useMeta();
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, range: "all" });
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [unit, setUnit] = useState<CalendarUnit>("money");
  const [selected, setSelected] = useState<string | null>(null);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const currency = useMemo(() => currencyOf(filters, funds), [filters, funds]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Sınırlar yerel ay başlangıçlarıdır; gün kovaları da yerel hesaplanır.
      const res = await tradesApi.list({
        from: month.toISOString(),
        to: addMonths(month, 1).toISOString(),
        fund_id: filters.fundId === ALL ? undefined : filters.fundId,
        currency: filters.currency === ALL ? undefined : filters.currency,
        limit: MONTH_LIMIT,
      });
      setTrades(res.items);
      if (res.total > res.items.length) {
        toast.warning(`Bu ayda ${res.total} işlem var; ilk ${res.items.length} tanesi gösteriliyor.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Takvim verisi yüklenemedi");
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, [month, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ay değişince önceki ayın seçili günü açık kalmasın.
  const goToMonth = (next: Date) => {
    setMonth(next);
    setSelected(null);
  };

  const days = useMemo(() => groupByDay(trades), [trades]);

  const totals = useMemo(() => {
    const closed = trades.filter((t) => t.status === "closed");
    const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
    const losses = closed.filter((t) => (t.pnl ?? 0) < 0).length;
    const decided = wins + losses;

    const dayValues = [...days.values()].filter((d) => d.closedCount > 0);
    const value = (v: (typeof dayValues)[number]) => (unit === "r" ? v.netR : v.netPnl);
    const best = dayValues.reduce<(typeof dayValues)[number] | null>(
      (acc, d) => (acc === null || value(d) > value(acc) ? d : acc),
      null,
    );
    const worst = dayValues.reduce<(typeof dayValues)[number] | null>(
      (acc, d) => (acc === null || value(d) < value(acc) ? d : acc),
      null,
    );

    return {
      netPnl: closed.reduce((s, t) => s + (t.pnl ?? 0), 0),
      netR: closed.reduce((s, t) => s + (t.r_multiple ?? 0), 0),
      closedCount: closed.length,
      openCount: trades.length - closed.length,
      winRate: decided ? wins / decided : null,
      tradingDays: dayValues.length,
      best: best && value(best) > 0 ? best : null,
      worst: worst && value(worst) < 0 ? worst : null,
    };
  }, [trades, days, unit]);

  const selectedDay = selected ? days.get(selected) : undefined;
  const isCurrentMonth = isSameMonth(month, new Date());
  const monthTotal = unit === "r" ? totals.netR : totals.netPnl;

  /** Birime göre tutar metni — ay, gün ve hücre başlıkları aynı biçimde. */
  const show = (value: number) =>
    unit === "r" ? rMultiple(value) : money(value, currency, { signed: true });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium text-pretty">Takvim</h1>
        <div className="flex flex-wrap items-center gap-2">
          <FilterBar filters={filters} onChange={setFilters} funds={funds} showRange={false} />
          <Tabs value={unit} onValueChange={(v) => setUnit(v as CalendarUnit)}>
            <TabsList>
              <TabsTrigger value="money">Para</TabsTrigger>
              <TabsTrigger value="r">R</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {/* ------------------------------------------------- ay şeridi */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Önceki ay"
            onClick={() => goToMonth(addMonths(month, -1))}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <h2 className="min-w-40 text-center text-base font-medium">
            {format(month, "LLLL yyyy", { locale: tr })}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sonraki ay"
            onClick={() => goToMonth(addMonths(month, 1))}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          {!isCurrentMonth && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToMonth(startOfMonth(new Date()))}
            >
              Bu ay
            </Button>
          )}
        </div>

        <div className="flex items-center gap-4">
          {loading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          <div className="text-right">
            <div
              className={cn(
                "num text-xl font-medium",
                monthTotal > 0 && "text-long",
                monthTotal < 0 && "text-short",
                monthTotal === 0 && "text-muted-foreground",
              )}
            >
              {show(monthTotal)}
            </div>
            <span className="text-xs text-muted-foreground">ay toplamı</span>
          </div>
        </div>
      </div>

      <MetricRow className="border-y border-border grid-cols-2 sm:grid-cols-4">
        <Metric
          size="sm"
          value={totals.closedCount}
          label="kapanmış işlem"
          sub={totals.openCount ? `${totals.openCount} açık pozisyon` : undefined}
          loading={loading}
        />
        <Metric
          size="sm"
          value={percent(totals.winRate)}
          label="kazanma oranı"
          sub={`${totals.tradingDays} işlem günü`}
          loading={loading}
        />
        <Metric
          size="sm"
          value={totals.best ? show(unit === "r" ? totals.best.netR : totals.best.netPnl) : "—"}
          label="en iyi gün"
          tone={totals.best ? "long" : "neutral"}
          sub={totals.best ? dayText(totals.best.key) : undefined}
          loading={loading}
        />
        <Metric
          size="sm"
          value={totals.worst ? show(unit === "r" ? totals.worst.netR : totals.worst.netPnl) : "—"}
          label="en kötü gün"
          tone={totals.worst ? "short" : "neutral"}
          sub={totals.worst ? dayText(totals.worst.key) : undefined}
          loading={loading}
        />
      </MetricRow>

      <PnlCalendar
        month={month}
        days={days}
        unit={unit}
        currency={currency}
        selected={selected}
        onSelect={setSelected}
      />

      {!loading && trades.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {format(month, "LLLL yyyy", { locale: tr })} ayında kayıtlı işlem yok.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href="/trades/new">
              <Plus className="size-4" aria-hidden="true" />
              İşlem Ekle
            </Link>
          </Button>
        </div>
      )}

      {/* ------------------------------------------------ gün defteri */}
      {selectedDay && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-base font-medium">{dayText(selectedDay.key)}</h2>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                {selectedDay.closedCount} kapalı · {selectedDay.winCount} kazanç
                {selectedDay.openCount > 0 && ` · ${selectedDay.openCount} açık`}
              </span>
              <span className="num">{rMultiple(selectedDay.netR)}</span>
              <span
                className={cn(
                  "num font-medium",
                  selectedDay.netPnl > 0 && "text-long",
                  selectedDay.netPnl < 0 && "text-short",
                  selectedDay.netPnl === 0 && "text-muted-foreground",
                )}
              >
                {money(selectedDay.netPnl, currency, { signed: true })}
              </span>
            </div>
          </div>

          {selectedDay.trades.filter((t) => t.r_multiple !== null).length > 1 && (
            <RTape trades={selectedDay.trades} />
          )}

          <TradesTable trades={selectedDay.trades} />
        </section>
      )}
    </div>
  );
}

/** 2026-09-06 → "6 Eylül Cumartesi" */
function dayText(key: string) {
  return format(parseISO(key), "d MMMM EEEE", { locale: tr });
}
