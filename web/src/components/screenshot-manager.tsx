"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { screenshotsApi } from "@/lib/api";
import { MAX_SCREENSHOT_BYTES, PHASES, PHASE_LABELS } from "@/lib/constants";
import type { Phase, Screenshot } from "@/lib/types";

export interface PendingFile {
  key: string;
  file: File;
  previewUrl: string;
  phase: Phase;
  caption: string;
}

/**
 * İşlem ekran görüntüleri. Kayıtlı bir işlem varsa dosyalar hemen yüklenir;
 * yeni işlemde bekletilir ve kayıt açıldıktan sonra TradeForm yükler.
 */
export function ScreenshotManager({
  tradeId,
  pending,
  onPendingChange,
}: {
  tradeId?: string;
  pending: PendingFile[];
  onPendingChange: (next: PendingFile[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<Screenshot[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const loadSaved = useCallback(async () => {
    if (!tradeId) return;
    try {
      const shots = await screenshotsApi.list(tradeId);
      setSaved(shots);
      const entries = await Promise.all(
        shots.map(async (s) => [s.id, await screenshotsApi.signedUrl(s.path)] as const),
      );
      setUrls(Object.fromEntries(entries));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Görseller okunamadı");
    }
  }, [tradeId]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  // Bekleyen dosyaların önizleme adresleri bileşen kapanınca serbest bırakılır.
  useEffect(() => {
    return () => pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((f) => {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name}: yalnız görsel yüklenebilir`);
        return false;
      }
      if (f.size > MAX_SCREENSHOT_BYTES) {
        toast.error(`${f.name}: 10 MB sınırını aşıyor`);
        return false;
      }
      return true;
    });
    if (!accepted.length) return;

    if (!tradeId) {
      onPendingChange([
        ...pending,
        ...accepted.map((file) => ({
          key: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          phase: "entry" as Phase,
          caption: "",
        })),
      ]);
      return;
    }

    setBusy(true);
    try {
      for (const file of accepted) {
        await screenshotsApi.upload(tradeId, file, { phase: "entry" });
      }
      await loadSaved();
      toast.success("Görsel yüklendi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Yükleme başarısız");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeSaved(shot: Screenshot) {
    setBusy(true);
    try {
      await screenshotsApi.remove(shot);
      setSaved((prev) => prev.filter((s) => s.id !== shot.id));
      toast.success("Görsel silindi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Silinemedi");
    } finally {
      setBusy(false);
    }
  }

  function updatePending(key: string, patch: Partial<PendingFile>) {
    onPendingChange(pending.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function removePending(key: string) {
    const item = pending.find((p) => p.key === key);
    if (item) URL.revokeObjectURL(item.previewUrl);
    onPendingChange(pending.filter((p) => p.key !== key));
  }

  const hasAny = saved.length > 0 || pending.length > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Ekran görüntüleri</CardTitle>
          <CardDescription>Grafiğin girişteki ve çıkıştaki hali.</CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          Görsel ekle
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </CardHeader>

      <CardContent>
        {!hasAny ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Henüz görsel yok. PNG/JPG/WebP, en fazla 10 MB.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((shot) => (
              <figure key={shot.id} className="space-y-2">
                <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
                  {urls[shot.id] && (
                    <Image
                      src={urls[shot.id]}
                      alt={shot.caption ?? "İşlem ekran görüntüsü"}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  )}
                </div>
                <figcaption className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded border px-1.5 py-0.5">{PHASE_LABELS[shot.phase]}</span>
                  <span className="truncate">{shot.caption}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7"
                    onClick={() => removeSaved(shot)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </figcaption>
              </figure>
            ))}

            {pending.map((item) => (
              <figure key={item.key} className="space-y-2">
                <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
                  {/* Yerel önizleme; kayıt açılınca Storage'a yüklenecek. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex gap-2">
                  <Select
                    value={item.phase}
                    onValueChange={(v) => updatePending(item.key, { phase: v as Phase })}
                  >
                    <SelectTrigger size="sm" className="w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PHASES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={item.caption}
                    onChange={(e) => updatePending(item.key, { caption: e.target.value })}
                    placeholder="Açıklama"
                    className="h-8"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => removePending(item.key)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </figure>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
