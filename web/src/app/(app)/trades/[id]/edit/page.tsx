"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { TradeForm } from "@/components/trade-form";
import { useDistinct, useMeta } from "@/hooks/use-meta";
import { tradesApi } from "@/lib/api";
import type { Trade } from "@/lib/types";

export default function EditTradePage() {
  const params = useParams<{ id: string }>();
  const { funds, loading: metaLoading } = useMeta();
  const distinct = useDistinct();

  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    tradesApi
      .get(params.id)
      .then(setTrade)
      .catch((err) => toast.error(err instanceof Error ? err.message : "İşlem okunamadı"))
      .finally(() => setLoading(false));
  }, [params?.id]);

  if (loading || metaLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!trade) {
    return <p className="text-sm text-muted-foreground">İşlem bulunamadı.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{trade.symbol} · düzenle</h1>
        <p className="text-sm text-muted-foreground">
          Kaydı güncelle; hesaplanan değerler yeniden türetilir.
        </p>
      </div>

      <TradeForm trade={trade} funds={funds} setupSuggestions={distinct.setup} />
    </div>
  );
}
