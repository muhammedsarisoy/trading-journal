"use client";

import { Loader2 } from "lucide-react";

import { TradeForm } from "@/components/trade-form";
import { useDistinct, useMeta } from "@/hooks/use-meta";

export default function NewTradePage() {
  const { funds, loading } = useMeta();
  const distinct = useDistinct();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Yeni işlem</h1>
        <p className="text-sm text-muted-foreground">
          Fiyat bilgisi, karar gerekçesi ve psikoloji kaydını birlikte tut.
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <TradeForm funds={funds} setupSuggestions={distinct.setup} />
      )}
    </div>
  );
}
