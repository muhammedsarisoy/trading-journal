"use client";

import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { ASSET_LABELS } from "@/lib/constants";
import { dateTime, money, rMultiple } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Trade } from "@/lib/types";

/** Sayının işaretine göre metin rengi. Sıfır ve boş nötr kalır. */
function tone(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-long" : "text-short";
}

/**
 * Defter. Kart değil tablo: kılcal satır çizgileri, sabit sütun genişlikleri,
 * sayılar sağa ve tek genişlikte hizalı.
 */
export function TradesTable({
  trades,
  loading,
  emptyText = "Kayıt yok.",
}: {
  trades: Trade[];
  loading?: boolean;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <div className="space-y-px border-y border-border py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (!trades.length) {
    return (
      <p className="border-y border-border py-10 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="w-full overflow-x-auto border-y border-border">
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <Th className="w-[7rem] text-left">Sembol</Th>
            <Th className="w-[11rem] text-left">Tarih</Th>
            <Th className="w-[10rem] text-left">Hesap</Th>
            <Th className="text-left">Strateji</Th>
            <Th className="w-[7rem] text-right">Risk</Th>
            <Th className="w-[6rem] text-right">R</Th>
            <Th className="w-[8rem] text-right">K/Z</Th>
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-border/70 [&>tr:last-child]:border-0">
          {trades.map((t) => (
            <tr key={t.id} className="transition-colors hover:bg-accent/50">
              <Td className="text-left">
                <Link
                  href={`/trades/${t.id}`}
                  className="inline-flex items-center gap-2 font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-block h-3 w-0.5 shrink-0",
                      t.direction === "long" ? "bg-long" : "bg-short",
                    )}
                  />
                  <span className="truncate">{t.symbol}</span>
                  <span className="sr-only">
                    {t.direction === "long" ? "long" : "short"}
                  </span>
                </Link>
              </Td>

              <Td className="text-left text-muted-foreground">
                <span className="num">{dateTime(t.opened_at)}</span>
                {t.status === "open" && (
                  <span className="ml-2 text-xs text-foreground/70">açık</span>
                )}
              </Td>

              <Td className="min-w-0 text-left text-muted-foreground">
                <span className="block truncate">{t.fund_name ?? "—"}</span>
                <span className="block truncate text-xs">{ASSET_LABELS[t.asset_class]}</span>
              </Td>

              <Td className="min-w-0 text-left text-muted-foreground">
                <span className="block truncate">{t.setup ?? "—"}</span>
              </Td>

              <Td className="num text-right text-muted-foreground">
                {money(t.risk_amount, t.currency)}
              </Td>

              <Td className={cn("num text-right", tone(t.r_multiple))}>
                {rMultiple(t.r_multiple)}
              </Td>

              <Td className={cn("num text-right font-medium", tone(t.pnl))}>
                {money(t.pnl, t.currency, { signed: true })}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ className, children }: { className?: string; children: React.ReactNode }) {
  return <th className={cn("px-3 py-2 font-normal", className)}>{children}</th>;
}

function Td({ className, children }: { className?: string; children: React.ReactNode }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>;
}
