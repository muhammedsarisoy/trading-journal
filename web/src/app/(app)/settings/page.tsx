"use client";

import { useState } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useMeta } from "@/hooks/use-meta";
import { fundsApi } from "@/lib/api";
import { CURRENCIES, DEFAULT_FUNDS } from "@/lib/constants";
import { money } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Fund } from "@/lib/types";

export default function SettingsPage() {
  const { funds, loading, reload } = useMeta();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ayarlar</h1>
        <p className="text-sm text-muted-foreground">
          İşlem formundaki hesap listesini buradan yönetirsin.
        </p>
      </div>

      <FundsCard funds={funds} loading={loading} onChanged={reload} />
    </div>
  );
}

function FundsCard({
  funds,
  loading,
  onChanged,
}: {
  funds: Fund[];
  loading: boolean;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [broker, setBroker] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [startingBalance, setStartingBalance] = useState("");
  const [isProp, setIsProp] = useState(false);
  const [saving, setSaving] = useState(false);

  async function addFund(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Hesap adı zorunlu.");
    setSaving(true);
    try {
      await fundsApi.create({
        name: name.trim(),
        broker: broker.trim() || null,
        currency,
        starting_balance: Number(startingBalance.replace(",", ".")) || 0,
        is_prop: isProp,
        is_active: true,
        note: null,
      });
      setName("");
      setBroker("");
      setStartingBalance("");
      setIsProp(false);
      await onChanged();
      toast.success("Hesap eklendi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eklenemedi");
    } finally {
      setSaving(false);
    }
  }

  async function removeFund(fund: Fund) {
    try {
      await fundsApi.remove(fund.id);
      await onChanged();
      toast.success("Hesap silindi. İşlemler korundu, hesap bağlantısı boşaltıldı.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Silinemedi");
    }
  }

  async function seedDefaults() {
    setSaving(true);
    try {
      await fundsApi.seed(DEFAULT_FUNDS.map((f) => ({ ...f, starting_balance: 0 })));
      await onChanged();
      toast.success("Hazır hesaplar eklendi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eklenemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Hesaplar / fonlar</CardTitle>
          <CardDescription>
            İşlemi hangi fondan aldığını burada tanımladığın hesaplardan seçersin.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={seedDefaults} disabled={saving}>
          <Sparkles className="size-4" />
          Hazır listeyi ekle
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={addFund} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="fundName" className="text-xs uppercase text-muted-foreground">
              Hesap adı
            </Label>
            <Input
              id="fundName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ana hesap"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="broker" className="text-xs uppercase text-muted-foreground">
              Aracı kurum
            </Label>
            <Input
              id="broker"
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              placeholder="IC Markets, Binance..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground">Para birimi</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
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
          <div className="space-y-1.5">
            <Label htmlFor="balance" className="text-xs uppercase text-muted-foreground">
              Başlangıç bakiyesi
            </Label>
            <Input
              id="balance"
              inputMode="decimal"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
              placeholder="10000"
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex flex-1 items-center gap-2">
              <Switch id="isProp" checked={isProp} onCheckedChange={setIsProp} />
              <Label htmlFor="isProp" className="text-sm">
                Prop
              </Label>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Ekle
            </Button>
          </div>
        </form>

        {loading ? (
          <p className="text-sm text-muted-foreground">Yükleniyor…</p>
        ) : funds.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Henüz hesap yok. Yukarıdan ekle.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {funds.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{f.name}</span>
                    {f.is_prop && <Badge variant="outline">Prop</Badge>}
                    {!f.is_active && <Badge variant="secondary">Pasif</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {f.broker ? `${f.broker} · ` : ""}
                    {f.currency} · başlangıç {money(f.starting_balance, f.currency)}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeFund(f)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

