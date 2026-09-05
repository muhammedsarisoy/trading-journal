"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { TradesTable } from "@/components/trades-table";
import {
  ALL,
  DEFAULT_FILTERS,
  FilterBar,
  filtersToQuery,
  type Filters,
} from "@/components/filter-bar";
import { useDistinct, useMeta } from "@/hooks/use-meta";
import { tradesApi } from "@/lib/api";
import { ASSET_CLASSES } from "@/lib/constants";
import { money, pnlTone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { AssetClass, Trade, TradeStatus } from "@/lib/types";

const PAGE_SIZE = 50;

export default function TradesPage() {
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tradesApi.list({
        ...filtersToQuery(filters),
        status: status === ALL ? undefined : status,
        symbol: symbol === ALL ? undefined : symbol,
        asset_class: assetClass === ALL ? undefined : (assetClass as AssetClass),
        q: debounced || undefined,
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
  }, [filters, status, symbol, assetClass, debounced, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtre değişince ilk sayfaya dön.
  useEffect(() => {
    setPage(0);
  }, [filters, status, symbol, assetClass, debounced]);

  const pageNetPnl = useMemo(
    () => trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
    [trades],
  );
  const currency = trades[0]?.currency ?? funds[0]?.currency ?? "USD";
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">İşlemler</h1>
          <p className="text-sm text-muted-foreground">
            {total} kayıt · bu sayfanın toplamı{" "}
            <span className={cn("num", pnlTone(pageNetPnl))}>
              {money(pageNetPnl, currency, { signed: true })}
            </span>
          </p>
        </div>
        <Button asChild>
          <Link href="/trades/new">
            <Plus className="size-4" /> Yeni işlem
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0">
          <TradesTable
            trades={trades}
            loading={loading}
            emptyText="Bu filtrelere uyan işlem yok."
          />
        </CardContent>
      </Card>

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
