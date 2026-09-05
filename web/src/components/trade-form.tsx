"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TagInput } from "@/components/tag-input";
import { ScreenshotManager, type PendingFile } from "@/components/screenshot-manager";
import { screenshotsApi, tradesApi } from "@/lib/api";
import {
  ASSET_CLASSES,
  CONFLUENCE_SUGGESTIONS,
  DIRECTIONS,
  EMOTIONS,
  MISTAKE_SUGGESTIONS,
  SETUP_SUGGESTIONS,
  TIMEFRAMES,
} from "@/lib/constants";
import { currencySymbol, fromLocalInput, money, pnlTone, toLocalInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AssetClass, Direction, Fund, Trade } from "@/lib/types";

const NONE = "__none__";

type FormState = {
  symbol: string;
  assetClass: AssetClass;
  direction: Direction;
  timeframe: string;
  fundId: string;
  openedAt: string;

  pnl: string;
  risk: string;
  rGain: string;
  stopLoss: string;
  takeProfit: string;

  setup: string;
  reason: string;
  confluences: string[];
  tags: string[];

  emotionBefore: string;
  emotionAfter: string;
  confidence: string;
  stress: string;
  followedPlan: boolean | null;
  mistakes: string[];
  lesson: string;
  notes: string;
};

function initialState(trade?: Trade): FormState {
  const s = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

  return {
    symbol: trade?.symbol ?? "",
    assetClass: trade?.asset_class ?? "forex",
    direction: trade?.direction ?? "long",
    timeframe: trade?.timeframe ?? "",
    fundId: trade?.fund_id ?? NONE,
    openedAt: toLocalInput(trade?.opened_at ?? new Date()),

    // Kapalı işlemde pnl_override boşsa eski formülden gelen değeri göster.
    pnl: s(trade?.pnl_override),
    risk: s(trade?.risk_manual ?? trade?.risk_amount),
    rGain: s(trade?.r_manual),
    stopLoss: s(trade?.stop_loss),
    takeProfit: s(trade?.take_profit),

    setup: trade?.setup ?? "",
    reason: trade?.reason ?? "",
    confluences: trade?.confluences ?? [],
    tags: trade?.tags ?? [],

    emotionBefore: trade?.emotion_before ?? NONE,
    emotionAfter: trade?.emotion_after ?? NONE,
    confidence: trade?.confidence ? String(trade.confidence) : NONE,
    stress: trade?.stress ? String(trade.stress) : NONE,
    followedPlan: trade?.followed_plan ?? null,
    mistakes: trade?.mistakes ?? [],
    lesson: trade?.lesson ?? "",
    notes: trade?.notes ?? "",
  };
}

function toNum(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function TradeForm({
  trade,
  funds,
  setupSuggestions = [],
}: {
  trade?: Trade;
  funds: Fund[];
  setupSuggestions?: string[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialState(trade));
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Para birimi seçilen hesaptan gelir; ayrı alan olarak sorulmaz.
  const currency = useMemo(() => {
    if (form.fundId === NONE) return trade?.currency ?? "USD";
    return funds.find((f) => f.id === form.fundId)?.currency ?? trade?.currency ?? "USD";
  }, [form.fundId, funds, trade?.currency]);

  const pnlValue = toNum(form.pnl);
  const riskValue = toNum(form.risk);
  const rValue = toNum(form.rGain);

  // İki yönlü türetme: hangisi boşsa diğerinden hesaplanır.
  // Sunucudaki coalesce sırasıyla aynı mantık.
  const effectivePnl =
    pnlValue ?? (rValue !== null && riskValue !== null ? rValue * riskValue : null);
  const effectiveR =
    rValue ?? (pnlValue !== null && riskValue ? pnlValue / riskValue : null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.symbol.trim()) return toast.error("Sembol zorunlu.");

    const payload = {
      fund_id: form.fundId === NONE ? null : form.fundId,
      symbol: form.symbol.trim().toUpperCase(),
      asset_class: form.assetClass,
      direction: form.direction,
      currency,
      opened_at: fromLocalInput(form.openedAt) ?? new Date().toISOString(),
      timeframe: form.timeframe || null,

      pnl_override: pnlValue,
      risk_manual: riskValue,
      r_manual: rValue,
      stop_loss: toNum(form.stopLoss),
      take_profit: toNum(form.takeProfit),

      // Formdan kaldırılan alanlar: düzenlemede mevcut değer korunur.
      platform_id: trade?.platform_id ?? null,
      closed_at: trade?.closed_at ?? null,
      entry_price: trade?.entry_price ?? null,
      exit_price: trade?.exit_price ?? null,
      quantity: trade?.quantity ?? null,
      quantity_unit: trade?.quantity_unit ?? null,
      contract_size: trade?.contract_size ?? null,
      leverage: trade?.leverage ?? null,
      fees: trade?.fees ?? 0,
      swap: trade?.swap ?? 0,

      setup: form.setup || null,
      reason: form.reason || null,
      confluences: form.confluences,
      tags: form.tags,

      emotion_before: form.emotionBefore === NONE ? null : form.emotionBefore,
      emotion_after: form.emotionAfter === NONE ? null : form.emotionAfter,
      confidence: form.confidence === NONE ? null : Number(form.confidence),
      stress: form.stress === NONE ? null : Number(form.stress),
      followed_plan: form.followedPlan,
      mistakes: form.mistakes,
      lesson: form.lesson || null,
      notes: form.notes || null,
    };

    setSaving(true);
    try {
      const saved = trade
        ? await tradesApi.update(trade.id, payload)
        : await tradesApi.create(payload);

      // Yeni işlemde bekleyen görseller kayıt açıldıktan sonra yüklenir.
      for (const item of pending) {
        await screenshotsApi.upload(saved.id, item.file, {
          phase: item.phase,
          caption: item.caption || null,
        });
      }

      toast.success(trade ? "İşlem güncellendi." : "İşlem kaydedildi.");
      router.push(`/trades/${saved.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ------------------------------------------------------- İşlem */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">İşlem</CardTitle>
          <CardDescription>Ne aldın, hangi hesaptan.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Sembol" htmlFor="symbol" required>
            <Input
              id="symbol"
              required
              value={form.symbol}
              onChange={(e) => set("symbol", e.target.value)}
              placeholder="EURUSD, BTCUSDT, THYAO"
              className="uppercase"
            />
          </Field>

          <Field label="Yön">
            <ToggleGroup
              type="single"
              variant="outline"
              value={form.direction}
              onValueChange={(v) => v && set("direction", v as Direction)}
              className="w-full"
            >
              {DIRECTIONS.map((d) => (
                <ToggleGroupItem
                  key={d.value}
                  value={d.value}
                  className={cn(
                    "flex-1",
                    form.direction === d.value &&
                      (d.value === "long" ? "text-profit" : "text-loss"),
                  )}
                >
                  {d.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          <Field label="İşlem tarihi" required>
            <Input
              type="datetime-local"
              required
              value={form.openedAt}
              onChange={(e) => set("openedAt", e.target.value)}
            />
          </Field>

          <Field label="Fon / hesap" hint={`Para birimi: ${currency}`}>
            <Select value={form.fundId} onValueChange={(v) => set("fundId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seç" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Belirtilmedi</SelectItem>
                {funds.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Enstrüman sınıfı">
            <Select
              value={form.assetClass}
              onValueChange={(v) => set("assetClass", v as AssetClass)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CLASSES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Zaman dilimi">
            <Select
              value={form.timeframe || NONE}
              onValueChange={(v) => set("timeframe", v === NONE ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seç" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Belirtilmedi</SelectItem>
                {TIMEFRAMES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ Sonuç */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sonuç</CardTitle>
          <CardDescription>
            Riski gir, sonra <strong>R</strong> ya da <strong>net tutar</strong>dan birini —
            diğeri hesaplanır. İkisi de boşsa işlem açık sayılır ve raporlara girmez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={`Riske ettiğim tutar (${currencySymbol(currency)})`}
              hint="1R kaç para ediyor"
            >
              <Input
                inputMode="decimal"
                value={form.risk}
                onChange={(e) => set("risk", e.target.value)}
                placeholder="100"
              />
            </Field>

            <Field label="Kazandığım R" hint="Zarar için eksi: -1, -0,5">
              <Input
                inputMode="decimal"
                value={form.rGain}
                onChange={(e) => set("rGain", e.target.value)}
                placeholder="2,5"
              />
            </Field>

            <Field
              label={`Net kâr / zarar (${currencySymbol(currency)})`}
              hint="Boşsa R × riskten hesaplanır"
            >
              <Input
                inputMode="decimal"
                value={form.pnl}
                onChange={(e) => set("pnl", e.target.value)}
                placeholder="-250 veya 480"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Stop loss" hint="Sadece kayıt">
              <Input
                inputMode="decimal"
                value={form.stopLoss}
                onChange={(e) => set("stopLoss", e.target.value)}
              />
            </Field>

            <Field label="Take profit" hint="Sadece kayıt">
              <Input
                inputMode="decimal"
                value={form.takeProfit}
                onChange={(e) => set("takeProfit", e.target.value)}
              />
            </Field>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-8 text-sm">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Kaydedilecek sonuç</div>
              <div className={cn("num text-lg font-semibold", pnlTone(effectivePnl))}>
                {effectivePnl === null
                  ? "Açık işlem"
                  : money(effectivePnl, currency, { signed: true })}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">R katsayısı</div>
              <div className={cn("num text-lg font-semibold", pnlTone(effectiveR))}>
                {effectiveR === null
                  ? "—"
                  : `${effectiveR > 0 ? "+" : ""}${effectiveR.toFixed(2)}R`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------- Gerekçe */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Karar gerekçesi</CardTitle>
          <CardDescription>Neye göre aldın, nelere baktın.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Strateji / setup">
              <Input
                list="setup-suggestions"
                value={form.setup}
                onChange={(e) => set("setup", e.target.value)}
                placeholder="Kırılım, pullback, seans açılışı..."
              />
              <datalist id="setup-suggestions">
                {[...new Set([...setupSuggestions, ...SETUP_SUGGESTIONS])].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Etiketler">
              <TagInput
                value={form.tags}
                onChange={(v) => set("tags", v)}
                placeholder="Etiket ekle"
              />
            </Field>
          </div>

          <Field label="Giriş gerekçesi" hint="Neden bu işlemi açtın">
            <Textarea
              rows={3}
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              placeholder="4H trend yukarı, günlük desteğe geri çekilme, hacim teyidi..."
            />
          </Field>

          <Field label="Nelere baktım" hint="Girişi destekleyen teyitler">
            <TagInput
              value={form.confluences}
              onChange={(v) => set("confluences", v)}
              suggestions={CONFLUENCE_SUGGESTIONS}
              placeholder="Teyit ekle"
            />
          </Field>
        </CardContent>
      </Card>

      {/* --------------------------------------------------- Psikoloji */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Psikoloji</CardTitle>
          <CardDescription>İşlem anındaki ruh halin ve sonrası.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="İşlem öncesi duygu">
              <EmotionSelect value={form.emotionBefore} onChange={(v) => set("emotionBefore", v)} />
            </Field>
            <Field label="İşlem sonrası duygu">
              <EmotionSelect value={form.emotionAfter} onChange={(v) => set("emotionAfter", v)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Güven düzeyi" hint="1 = çok düşük, 5 = çok yüksek">
              <RatingInput value={form.confidence} onChange={(v) => set("confidence", v)} />
            </Field>
            <Field label="Stres düzeyi" hint="1 = sakin, 5 = çok stresli">
              <RatingInput value={form.stress} onChange={(v) => set("stress", v)} />
            </Field>
          </div>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch
              id="followedPlan"
              checked={form.followedPlan === true}
              onCheckedChange={(checked) => set("followedPlan", checked)}
            />
            <Label htmlFor="followedPlan" className="cursor-pointer">
              Planıma sadık kaldım
            </Label>
            {form.followedPlan !== null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto text-xs"
                onClick={() => set("followedPlan", null)}
              >
                Temizle
              </Button>
            )}
          </div>

          <Field label="Yaptığım hatalar">
            <TagInput
              value={form.mistakes}
              onChange={(v) => set("mistakes", v)}
              suggestions={MISTAKE_SUGGESTIONS}
              placeholder="Hata ekle"
              tone="warning"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Çıkarılan ders">
              <Textarea
                rows={3}
                value={form.lesson}
                onChange={(e) => set("lesson", e.target.value)}
                placeholder="Bir dahakine ne yapacağım"
              />
            </Field>
            <Field label="Notlar">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Serbest not"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <ScreenshotManager tradeId={trade?.id} pending={pending} onPendingChange={setPending} />

      <div className="flex items-center justify-end gap-2 pb-6">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {trade ? "Değişiklikleri kaydet" : "İşlemi kaydet"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  required,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="text-loss"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function EmotionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Seç" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Belirtilmedi</SelectItem>
        {EMOTIONS.map((e) => (
          <SelectItem key={e.value} value={e.value}>
            <span
              className={cn(
                "mr-2 inline-block size-2 rounded-full",
                e.tone === "good" && "bg-profit",
                e.tone === "bad" && "bg-loss",
                e.tone === "neutral" && "bg-muted-foreground",
              )}
            />
            {e.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RatingInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value === NONE ? "" : value}
      onValueChange={(v) => onChange(v || NONE)}
      className="w-full"
    >
      {["1", "2", "3", "4", "5"].map((n) => (
        <ToggleGroupItem key={n} value={n} className="flex-1">
          {n}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
