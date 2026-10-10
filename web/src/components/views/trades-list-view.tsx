"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { TradesTable } from "@/components/trades-table";
import { ExportTradesPdf } from "@/components/export-trades-pdf";
import {
  ALL,
  DEFAULT_FILTERS,
  FilterBar,
  filtersToQuery,
  type Filters,
} from "@/components/filter-bar";
import { useDistinct, useMeta } from "@/hooks/use-meta";
import { tradesApi } from "@/lib/api";
import { ASSET_CLASSES, ASSET_LABELS, RANGES } from "@/lib/constants";
import { money, pnlTone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { AssetClass, Trade, TradeQuery, TradeStatus } from "@/lib/types";

const PAGE_SIZE = 50;

/** Süzgeçli işlem listesi ve PDF çıktısı. İşlemler sayfasının liste görünümü. */
export function TradesListView() {
  const { funds } = useMeta();
  const distinct = useDistinct();

  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, range: "all" });
  const [status, setStatus] = useState<TradeStatus | typeof ALL>(ALL);
  const [symbol, setSymbol] = useState<string>(ALL);
  const [assetClass, setAssetClass] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Tabloyu da PDF çıktısını da besleyen tek sorgu.
  const query = useMemo<TradeQuery>(
    () => ({
      ...filtersToQuery(filters),
      status: status === ALL ? undefined : status,
      symbol: symbol === ALL ? undefined : symbol,
      asset_class: assetClass === ALL ? undefined : (assetClass as AssetClass),
      q: debounced || undefined,
    }),
    [filters, status, symbol, assetClass, debounced],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tradesApi.list({
        ...query,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setTrades(res.items);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "İşlemler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtre değişince ilk sayfaya dön.
  useEffect(() => {
    setPage(0);
  }, [query]);

  // PDF çıktısının başına yazılan, ekranda seçili olan filtreler.
  const filterLabels = useMemo(() => {
    const labels = [`Aralık: ${RANGES.find((r) => r.value === filters.range)?.label ?? "Tümü"}`];
    labels.push(
      `Hesap: ${
        filters.fundId === ALL ? "Tümü" : (funds.find((f) => f.id === filters.fundId)?.name ?? "—")
      }`,
    );
    if (filters.currency !== ALL) labels.push(`Para birimi: ${filters.currency}`);
    labels.push(`Durum: ${status === ALL ? "Tümü" : status === "closed" ? "Kapalı" : "Açık"}`);
    if (symbol !== ALL) labels.push(`Sembol: ${symbol}`);
    if (assetClass !== ALL) {
      labels.push(`Enstrüman: ${ASSET_LABELS[assetClass as AssetClass] ?? assetClass}`);
    }
    if (debounced) labels.push(`Arama: "${debounced}"`);
    return labels;
  }, [filters, funds, status, symbol, assetClass, debounced]);

  const pageNetPnl = useMemo(() => trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0), [trades]);
  const currency = trades[0]?.currency ?? funds[0]?.currency ?? "USD";
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterBar filters={filters} onChange={setFilters} funds={funds} />

        <Tabs value={status} onValueChange={(v) => setStatus(v as TradeStatus | typeof ALL)}>
          <TabsList>
            <TabsTrigger value={ALL}>Tümü</TabsTrigger>
            <TabsTrigger value="closed">Kapalı</TabsTrigger>
            <TabsTrigger value="open">Açık</TabsTrigger>
          </TabsList>
        </Tabs>

        {distinct.symbol.length > 0 && (
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tüm semboller</SelectItem>
              {distinct.symbol.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={assetClass} onValueChange={setAssetClass}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm enstrümanlar</SelectItem>
            {ASSET_CLASSES.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sembol, strateji, not içinde ara"
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          <span className="num">{total}</span> işlem · bu sayfanın toplamı{" "}
          <span className={cn("num", pnlTone(pageNetPnl))}>
            {money(pageNetPnl, currency, { signed: true })}
          </span>
        </span>
        <ExportTradesPdf query={query} filters={filterLabels} disabled={loading} />
      </div>

      <TradesTable trades={trades} loading={loading} emptyText="Bu filtrelere uyan işlem yok." />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Önceki
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Sonraki
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
