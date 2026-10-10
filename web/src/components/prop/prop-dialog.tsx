"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { propApi } from "@/lib/api";
import { ACCOUNT_SIZES, CURRENCIES, PROP_FIRMS, PROP_KIND_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Fund, PropKind, PropTransaction } from "@/lib/types";

const NO_FUND = "__none__";
const KINDS: PropKind[] = ["fee", "payout", "refund"];

type FormState = {
  kind: PropKind;
  firm: string;
  amount: string;
  currency: string;
  occurredOn: string;
  accountSize: string;
  fundId: string;
  note: string;
};

function initial(tx: PropTransaction | null, lastFirm?: string): FormState {
  return {
    kind: tx?.kind ?? "fee",
    firm: tx?.firm ?? lastFirm ?? PROP_FIRMS[0] ?? "",
    amount: tx ? String(tx.amount).replace(".", ",") : "",
    currency: tx?.currency ?? "USD",
    occurredOn: tx?.occurred_on ?? format(new Date(), "yyyy-MM-dd"),
    accountSize: tx?.account_size ? String(tx.account_size) : "",
    fundId: tx?.fund_id ?? NO_FUND,
    note: tx?.note ?? "",
  };
}

/** "1.234,56" ya da "1234.56" → 1234.56 */
function parseAmount(raw: string) {
  const clean = raw.trim().replace(/\s/g, "");
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function sizeLabel(n: number) {
  return n >= 1000 ? `${n / 1000}K` : String(n);
}

export function PropDialog({
  open,
  onOpenChange,
  editing,
  funds,
  firms,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null: yeni kayıt */
  editing: PropTransaction | null;
  funds: Fund[];
  /** Kullanıcının daha önce girdiği firmalar; hazır listeye eklenir. */
  firms: string[];
  onSaved: () => void;
}) {
  // Üst bileşen her açılışta key değiştirir; form düzenlenen kayıtla ya da
  // son kullanılan firmayla sıfırdan başlar.
  const [form, setForm] = useState<FormState>(() => initial(editing, firms[0]));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const firmOptions = [...new Set([...PROP_FIRMS, ...firms])];
  const propFunds = funds.filter((f) => f.is_prop);
  const isFee = form.kind === "fee";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (!form.firm.trim()) return toast.error("Firma adını yaz.");
    if (!(amount > 0)) return toast.error("Tutar sıfırdan büyük olmalı.");

    const size = parseAmount(form.accountSize);
    const input = {
      kind: form.kind,
      firm: form.firm.trim(),
      amount,
      currency: form.currency,
      occurred_on: form.occurredOn,
      account_size: isFee && size > 0 ? size : null,
      fund_id: form.fundId === NO_FUND ? null : form.fundId,
      note: form.note.trim() || null,
    };

    setSaving(true);
    try {
      if (editing) await propApi.update(editing.id, input);
      else await propApi.create(input);
      toast.success(editing ? "Kayıt güncellendi." : `${PROP_KIND_LABELS[form.kind]} eklendi.`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{editing ? "Kaydı düzenle" : "Prop kaydı ekle"}</DialogTitle>
            <DialogDescription>
              Challenge için ödediğin ücreti ya da firmadan aldığın parayı gir.
            </DialogDescription>
          </DialogHeader>

          <ToggleGroup
            type="single"
            variant="outline"
            value={form.kind}
            onValueChange={(v) => v && set("kind", v as PropKind)}
            className="w-full"
            aria-label="Kayıt türü"
          >
            {KINDS.map((k) => (
              <ToggleGroupItem key={k} value={k} className="flex-1">
                {k === "fee" ? "Ücret" : PROP_KIND_LABELS[k]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="space-y-2">
            <Label htmlFor="prop-firm">Firma</Label>
            <div className="flex flex-wrap gap-1.5">
              {firmOptions.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => set("firm", f)}
                  aria-pressed={form.firm === f}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    form.firm === f
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <Input
              id="prop-firm"
              value={form.firm}
              onChange={(e) => set("firm", e.target.value)}
              placeholder="Listede yoksa adını yaz"
              maxLength={80}
            />
          </div>

          <div className="grid grid-cols-[1fr_6.5rem] gap-3">
            <div className="space-y-2">
              <Label htmlFor="prop-amount">Tutar</Label>
              <Input
                id="prop-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder={isFee ? "299" : "1.200"}
                className="num"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-currency">Para birimi</Label>
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger id="prop-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prop-date">Tarih</Label>
            <Input
              id="prop-date"
              type="date"
              value={form.occurredOn}
              onChange={(e) => set("occurredOn", e.target.value)}
              required
            />
          </div>

          {isFee && (
            <div className="space-y-2">
              <Label htmlFor="prop-size">Hesap büyüklüğü</Label>
              <div className="flex flex-wrap gap-1.5">
                {ACCOUNT_SIZES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() =>
                      set("accountSize", form.accountSize === String(n) ? "" : String(n))
                    }
                    aria-pressed={form.accountSize === String(n)}
                    className={cn(
                      "num rounded-full border px-3 py-1 text-xs transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      form.accountSize === String(n)
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {sizeLabel(n)}
                  </button>
                ))}
              </div>
              <Input
                id="prop-size"
                inputMode="numeric"
                value={form.accountSize}
                onChange={(e) => set("accountSize", e.target.value)}
                placeholder="İsteğe bağlı"
                className="num"
              />
            </div>
          )}

          {propFunds.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="prop-fund">Hesap</Label>
              <Select value={form.fundId} onValueChange={(v) => set("fundId", v)}>
                <SelectTrigger id="prop-fund">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FUND}>Bağlama</SelectItem>
                  {propFunds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="prop-note">Not</Label>
            <Textarea
              id="prop-note"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              rows={2}
              placeholder="İndirim kodu, aşama, hesap numarası…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {editing ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
