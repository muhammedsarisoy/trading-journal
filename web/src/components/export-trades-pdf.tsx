"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { tradesApi } from "@/lib/api";
import { downloadPdf } from "@/lib/pdf";
import { buildTradesPdf, tradesPdfFilename } from "@/lib/trades-pdf";
import type { Trade, TradeQuery } from "@/lib/types";

// Ekrandaki sayfalama 50'şer; çıktı filtreye uyan her kaydı ister.
const CHUNK = 500;
const MAX_ROWS = 5000;

async function fetchAll(query: TradeQuery): Promise<Trade[]> {
  const items: Trade[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += CHUNK) {
    const res = await tradesApi.list({ ...query, limit: CHUNK, offset });
    items.push(...res.items);
    if (res.items.length < CHUNK || items.length >= res.total) break;
  }
  return items;
}

/**
 * Filtrelenmiş işlem listesini PDF olarak indirir. Sayfadaki 50 kaydı değil,
 * filtreye uyan bütün kayıtları alır.
 */
export function ExportTradesPdf({
  query,
  filters,
  disabled,
}: {
  query: TradeQuery;
  /** "Aralık: Son 90 gün" gibi, çıktının başına yazılan etiketler. */
  filters: string[];
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const trades = await fetchAll(query);
      if (!trades.length) {
        toast.info("Bu filtrelere uyan işlem yok.");
        return;
      }
      downloadPdf(buildTradesPdf({ trades, filters }), tradesPdfFilename());
      toast.success(`${trades.length} işlem PDF olarak indirildi.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF oluşturulamadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={run} disabled={busy || disabled}>
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="size-4" aria-hidden="true" />
      )}
      {busy ? "Hazırlanıyor…" : "PDF indir"}
    </Button>
  );
}
