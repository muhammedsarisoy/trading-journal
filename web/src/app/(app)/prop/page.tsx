"use client";

import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PropDialog } from "@/components/prop/prop-dialog";
import { Metric, toneOf } from "@/components/metric";
import { useMeta } from "@/hooks/use-meta";
import { propApi } from "@/lib/api";
import { PROP_KIND_LABELS } from "@/lib/constants";
import { dateShort, money, pnlTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PropSummary, PropTransaction } from "@/lib/types";

const ALL = "__all__";

/** 1.5 → "+%150" · -1 → "-%100" */
function roiText(roi: number | null) {
  if (roi === null) return "—";
  const sign = roi > 0 ? "+" : roi < 0 ? "-" : "";
  return `${sign}%${Math.abs(roi * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

function sizeText(n: number | null) {
  if (!n) return null;
  return n >= 1000 ? `${(n / 1000).toLocaleString("tr-TR")}K` : n.toLocaleString("tr-TR");
}

/** Ücret eksi, payout ve iade artı: net hesabıyla aynı yön. */
function signedAmount(tx: PropTransaction) {
  return tx.kind === "fee" ? -tx.amount : tx.amount;
}

export default function PropPage() {
  const { funds } = useMeta();
  const [summary, setSummary] = useState<PropSummary | null>(null);
  const [list, setList] = useState<PropTransaction[] | null>(null);
  const [version, setVersion] = useState(0);
  const [firm, setFirm] = useState<string>(ALL);
  const [dialog, setDialog] = useState<{
    open: boolean;
    editing: PropTransaction | null;
    key: number;
  }>({
    open: false,
    editing: null,
    key: 0,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([propApi.summary(), propApi.list()])
      .then(([s, l]) => {
        if (cancelled) return;
        setSummary(s);
        setList(l);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Prop kayıtları yüklenemedi"),
      );
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = () => setVersion((v) => v + 1);
  const openDialog = (editing: PropTransaction | null) =>
    setDialog((d) => ({ open: true, editing, key: d.key + 1 }));

  // Toplamlar tek para biriminde anlamlı; karışıksa ilkini gösterip uyarırız.
  const currency = summary?.currencies[0] ?? "USD";
  const mixed = (summary?.currencies.length ?? 0) > 1;
  const firms = useMemo(() => summary?.by_firm.map((f) => f.firm) ?? [], [summary]);
  const visible = useMemo(
    () => (list ?? []).filter((t) => firm === ALL || t.firm === firm),
    [list, firm],
  );

  async function remove(tx: PropTransaction) {
    try {
      await propApi.remove(tx.id);
      toast.success("Kayıt silindi.");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Silinemedi");
    }
  }

  const loading = summary === null;
  const total = summary?.total;
  const empty = !loading && list?.length === 0;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium">Prop</h1>
        <Button onClick={() => openDialog(null)}>
          <Plus className="size-4" aria-hidden="true" />
          Kayıt ekle
        </Button>
      </header>

      {empty ? (
        <div className="py-20 text-center">
          <h2 className="text-lg font-medium">Henüz prop kaydı yok</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-pretty text-muted-foreground">
            Aldığın challenge&apos;ların ücretini ve firmadan gelen payout&apos;ları gir. Ne kadar
            harcadığın, ne kadar geri aldığın ve net sonucun burada toplanır.
          </p>
          <Button className="mt-6" onClick={() => openDialog(null)}>
            <Plus className="size-4" aria-hidden="true" />
            İlk ücreti ekle
          </Button>
        </div>
      ) : (
        <>
          <section className="grid gap-8 md:grid-cols-[minmax(14rem,1fr)_2fr] md:items-end">
            <Metric
              size="hero"
              value={money(total?.net, currency, { signed: true })}
              label="net sonuç"
              sub={total ? `ROI ${roiText(total.roi)} · harcanana göre` : undefined}
              tone={toneOf(total?.net)}
              loading={loading}
            />
            <dl className="grid grid-cols-3 gap-4 md:justify-items-end md:text-right">
              <Figure
                label="harcanan"
                value={money(total?.fees, currency)}
                hint={`${total?.challenge_count ?? 0} challenge`}
                loading={loading}
              />
              <Figure
                label="payout"
                value={money(total?.payouts, currency)}
                hint={`${total?.payout_count ?? 0} ödeme`}
                loading={loading}
              />
              <Figure
                label="iade"
                value={money(total?.refunds, currency)}
                hint="geri gelen ücret"
                loading={loading}
              />
            </dl>
          </section>

          {mixed && (
            <p className="text-sm text-muted-foreground">
              Kayıtlarda birden fazla para birimi var ({summary?.currencies.join(", ")}). Toplamlar
              çevrilmeden toplanıyor.
            </p>
          )}

          {summary && summary.by_firm.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm text-muted-foreground">Firmalar</h2>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Firma</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Challenge</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Harcanan</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Geri gelen</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">ROI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.by_firm.map((f) => (
                      <TableRow key={f.firm}>
                        <TableCell className="font-medium">{f.firm}</TableCell>
                        <TableCell className="num hidden text-right sm:table-cell">
                          {f.challenge_count}
                        </TableCell>
                        <TableCell className="num hidden text-right sm:table-cell">
                          {money(f.fees, currency)}
                        </TableCell>
                        <TableCell className="num hidden text-right sm:table-cell">
                          {f.payouts + f.refunds > 0 ? money(f.payouts + f.refunds, currency) : "—"}
                        </TableCell>
                        <TableCell className={cn("num text-right font-medium", pnlTone(f.net))}>
                          {money(f.net, currency, { signed: true })}
                        </TableCell>
                        <TableCell className={cn("num text-right", pnlTone(f.roi))}>
                          {roiText(f.roi)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm text-muted-foreground">Kayıtlar</h2>
              {firms.length > 1 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Firmaya göre süz">
                  {[ALL, ...firms].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFirm(f)}
                      aria-pressed={firm === f}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        firm === f
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f === ALL ? "Tümü" : f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {list === null ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <ul className="rule-y border-y border-border">
                {visible.map((tx) => (
                  <li key={tx.id} className="flex items-center gap-4 py-3">
                    <span className="num w-24 shrink-0 text-xs text-muted-foreground">
                      {dateShort(tx.occurred_on)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {tx.firm}
                        {sizeText(tx.account_size) && (
                          <span className="num ml-2 text-muted-foreground">
                            {sizeText(tx.account_size)}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {PROP_KIND_LABELS[tx.kind]}
                        {tx.fund_name && ` · ${tx.fund_name}`}
                        {tx.note && ` · ${tx.note}`}
                      </div>
                    </div>
                    <span
                      className={cn("num shrink-0 text-sm font-medium", pnlTone(signedAmount(tx)))}
                    >
                      {money(signedAmount(tx), tx.currency, { signed: true })}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          aria-label="Kayıt işlemleri"
                        >
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openDialog(tx)}>
                          <Pencil className="size-4" aria-hidden="true" />
                          Düzenle
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void remove(tx)} className="text-loss">
                          <Trash2 className="size-4" aria-hidden="true" />
                          Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <PropDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        editing={dialog.editing}
        funds={funds}
        firms={firms}
        onSaved={reload}
      />
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: string;
  hint: string;
  loading: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num mt-1 truncate text-lg">{loading ? "…" : value}</dd>
      <dd className="truncate text-xs text-muted-foreground">{hint}</dd>
    </div>
  );
}
