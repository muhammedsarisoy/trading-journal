"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { fundsApi, tradesApi } from "@/lib/api";
import type { DistinctValues, Fund } from "@/lib/types";

/** Hesap/fon listesi — işlem formunun ve filtrelerin ortak verisi. */
export function useMeta() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const f = await fundsApi.list();
      setFunds(f);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Liste okunamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { funds, loading, reload, setFunds };
}

/** Kullanıcının daha önce girdiği sembol/strateji/etiket değerleri. */
export function useDistinct() {
  const [values, setValues] = useState<DistinctValues>({
    symbol: [],
    setup: [],
    tag: [],
    confluence: [],
  });

  useEffect(() => {
    tradesApi
      .distinct()
      .then((v) =>
        setValues({
          symbol: v.symbol ?? [],
          setup: v.setup ?? [],
          tag: v.tag ?? [],
          confluence: v.confluence ?? [],
        }),
      )
      .catch(() => {
        // Öneri listesi kritik değil; sessizce geç.
      });
  }, []);

  return values;
}
