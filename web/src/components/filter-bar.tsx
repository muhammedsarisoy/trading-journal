"use client";

import { CalendarRange, Wallet } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES, RANGES } from "@/lib/constants";
import type { Fund } from "@/lib/types";

export const ALL = "__all__";

/** Seçilen aralığı ISO tarihe çevirir (null = tüm zamanlar). */
export function rangeToFrom(range: string): string | undefined {
  const found = RANGES.find((r) => r.value === range);
  if (!found?.days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - found.days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export interface Filters {
  range: string;
  fundId: string;
  currency: string;
}

export const DEFAULT_FILTERS: Filters = {
  range: "90d",
  fundId: ALL,
  currency: ALL,
};

/** Filtreleri API sorgu parametrelerine çevirir. */
export function filtersToQuery(filters: Filters) {
  return {
    from: rangeToFrom(filters.range),
    fund_id: filters.fundId === ALL ? undefined : filters.fundId,
    currency: filters.currency === ALL ? undefined : filters.currency,
  };
}

/** Gösterilecek para birimi: seçili birim, yoksa seçili hesabınki. */
export function currencyOf(filters: Filters, funds: Fund[]) {
  if (filters.currency !== ALL) return filters.currency;
  if (filters.fundId !== ALL) {
    return funds.find((f) => f.id === filters.fundId)?.currency ?? "USD";
  }
  return funds[0]?.currency ?? "USD";
}

export function FilterBar({
  filters,
  onChange,
  funds,
  showRange = true,
  children,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  funds: Fund[];
  /** Takvim gibi kendi dönemi olan ekranlarda aralık seçici gizlenir. */
  showRange?: boolean;
  children?: React.ReactNode;
}) {
  const usedCurrencies = Array.from(new Set(funds.map((f) => f.currency)));
  const currencyOptions = usedCurrencies.length ? usedCurrencies : CURRENCIES;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showRange && (
        <Select value={filters.range} onValueChange={(range) => onChange({ ...filters, range })}>
          <SelectTrigger className="w-[150px]">
            <CalendarRange className="size-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.fundId} onValueChange={(fundId) => onChange({ ...filters, fundId })}>
        <SelectTrigger className="w-[180px]">
          <Wallet className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tüm hesaplar</SelectItem>
          {funds.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {currencyOptions.length > 1 && (
        <Select
          value={filters.currency}
          onValueChange={(currency) => onChange({ ...filters, currency })}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm para br.</SelectItem>
            {currencyOptions.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {children}
    </div>
  );
}
