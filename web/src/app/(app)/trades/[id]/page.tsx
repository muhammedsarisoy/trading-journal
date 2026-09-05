"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScreenshotManager } from "@/components/screenshot-manager";
import { removeStoragePaths, tradesApi } from "@/lib/api";
import { ASSET_LABELS, EMOTION_LABELS } from "@/lib/constants";
import { dateTime, money, pnlTone, price, rMultiple } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Trade } from "@/lib/types";

export default function TradeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    tradesApi
      .get(params.id)
      .then(setTrade)
      .catch((err) => toast.error(err instanceof Error ? err.message : "İşlem okunamadı"))
      .finally(() => setLoading(false));
  }, [params?.id]);

  async function handleDelete() {
    if (!trade) return;
    setDeleting(true);
    try {
      const { removed_paths } = await tradesApi.remove(trade.id);
      await removeStoragePaths(removed_paths ?? []);
      toast.success("İşlem silindi.");
      router.push("/trades");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Silinemedi");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!trade) return <p className="text-sm text-muted-foreground">İşlem bulunamadı.</p>;

  const isLong = trade.direction === "long";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/trades">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>

        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            isLong ? "bg-profit-muted text-profit" : "bg-loss-muted text-loss",
          )}
        >
          {isLong ? <ArrowUpRight className="size-5" /> : <ArrowDownRight className="size-5" />}
        </span>

        <div>
          <h1 className="text-2xl font-semibold leading-tight">{trade.symbol}</h1>
          <p className="text-sm text-muted-foreground">
            {ASSET_LABELS[trade.asset_class]} · {isLong ? "Long" : "Short"}
            {trade.timeframe ? ` · ${trade.timeframe}` : ""}
          </p>
        </div>

        <Badge variant={trade.status === "open" ? "outline" : "secondary"}>
          {trade.status === "open" ? "Açık" : "Kapalı"}
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/trades/${trade.id}/edit`}>
              <Pencil className="size-4" /> Düzenle
            </Link>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-loss">
                <Trash2 className="size-4" /> Sil
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>İşlem silinsin mi?</AlertDialogTitle>
                <AlertDialogDescription>
                  {trade.symbol} işlemi ve ona bağlı ekran görüntüleri kalıcı olarak silinir.
                  Bu işlem geri alınamaz.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                  {deleting && <Loader2 className="size-4 animate-spin" />}
                  Sil
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Net kâr / zarar"
          value={money(trade.pnl, trade.currency, { signed: true })}
          className={pnlTone(trade.pnl)}
        />
        <Metric
          label="R katsayısı"
          value={rMultiple(trade.r_multiple)}
          className={pnlTone(trade.r_multiple)}
        />
        <Metric label="Riske edilen" value={money(trade.risk_amount, trade.currency)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">İşlem verisi</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Row label="İşlem tarihi" value={dateTime(trade.opened_at)} />
            <Row label="Fon / hesap" value={trade.fund_name ?? "—"} />
            <Row label="Enstrüman sınıfı" value={ASSET_LABELS[trade.asset_class]} />
            <Row label="Zaman dilimi" value={trade.timeframe ?? "—"} />
            <Row label="Stop loss" value={price(trade.stop_loss)} mono />
            <Row label="Take profit" value={price(trade.take_profit)} mono />
            <Row label="Para birimi" value={trade.currency} />
            <Row label="Durum" value={trade.status === "open" ? "Açık" : "Kapalı"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Karar gerekçesi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Row label="Strateji" value={trade.setup ?? "—"} />
            <div>
              <div className="text-xs uppercase text-muted-foreground">Giriş gerekçesi</div>
              <p className="mt-1 whitespace-pre-wrap">{trade.reason || "—"}</p>
            </div>
            <TagRow label="Nelere baktım" items={trade.confluences} />
            <TagRow label="Etiketler" items={trade.tags} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Psikoloji</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Row
              label="İşlem öncesi"
              value={trade.emotion_before ? (EMOTION_LABELS[trade.emotion_before] ?? trade.emotion_before) : "—"}
            />
            <Row
              label="İşlem sonrası"
              value={trade.emotion_after ? (EMOTION_LABELS[trade.emotion_after] ?? trade.emotion_after) : "—"}
            />
            <Row label="Güven" value={trade.confidence ? `${trade.confidence}/5` : "—"} />
            <Row label="Stres" value={trade.stress ? `${trade.stress}/5` : "—"} />
          </div>

          <Row
            label="Plana uyum"
            value={
              trade.followed_plan === null
                ? "—"
                : trade.followed_plan
                  ? "Plana sadık kaldım"
                  : "Plandan saptım"
            }
          />

          <TagRow label="Yaptığım hatalar" items={trade.mistakes} tone="warning" />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Çıkarılan ders</div>
              <p className="mt-1 whitespace-pre-wrap">{trade.lesson || "—"}</p>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Notlar</div>
              <p className="mt-1 whitespace-pre-wrap">{trade.notes || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ScreenshotManager tradeId={trade.id} pending={[]} onPendingChange={() => {}} />
    </div>
  );
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("num mt-1 text-xl font-semibold", className)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5", mono && "num")}>{value}</div>
    </div>
  );
}

function TagRow({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone?: "warning";
}) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      {items.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className={cn(tone === "warning" && "bg-loss-muted text-loss")}
            >
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <div className="mt-0.5">—</div>
      )}
    </div>
  );
}
