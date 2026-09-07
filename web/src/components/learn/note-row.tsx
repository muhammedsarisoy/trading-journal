"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Clock,
  ImagePlus,
  Loader2,
  Maximize2,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseStamp, stamp } from "@/lib/video";
import type { LessonNote, LessonNoteInput } from "@/lib/types";

export type NotePatch = Partial<Omit<LessonNoteInput, "sort_order">>;

/**
 * Tek not bloğu: bir yanda grafiğin ekran görüntüsü, öbür yanda o grafiğe dair
 * not. Metin alandan çıkınca kaydedilir; görsel sürüklenerek, seçilerek ya da
 * panodan yapıştırılarak eklenir.
 */
export function NoteRow({
  note,
  imageUrl,
  index,
  count,
  busy,
  hasVideo,
  onPatch,
  onDelete,
  onMove,
  onSeek,
  onUpload,
}: {
  note: LessonNote;
  imageUrl?: string;
  index: number;
  count: number;
  busy?: boolean;
  hasVideo: boolean;
  onPatch: (patch: NotePatch) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onSeek: (seconds: number) => void;
  onUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [heading, setHeading] = useState(note.heading ?? "");
  const [body, setBody] = useState(note.body ?? "");
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Dışarıdan gelen değişiklikleri (sıralama, sunucu yanıtı) yansıt.
  useEffect(() => {
    setHeading(note.heading ?? "");
    setBody(note.body ?? "");
  }, [note.id, note.heading, note.body]);

  const imageLeft = note.image_side === "left";

  function takeFiles(files: FileList | null) {
    const file = Array.from(files ?? []).find((f) => f.type.startsWith("image/"));
    if (file) onUpload(file);
  }

  function commitTime() {
    const raw = timeDraft ?? "";
    setTimeDraft(null);
    if (!raw.trim()) {
      if (note.timestamp_sec !== null) onPatch({ timestamp_sec: null });
      return;
    }
    const seconds = parseStamp(raw);
    if (seconds === null || seconds === note.timestamp_sec) return;
    onPatch({ timestamp_sec: seconds });
  }

  return (
    <article
      className="group grid gap-5 border-t border-border py-6 md:grid-cols-2"
      onPaste={(e) => takeFiles(e.clipboardData?.files ?? null)}
    >
      {/* ------------------------------------------------------------ not */}
      <div className={cn("order-2 min-w-0", imageLeft ? "md:order-2" : "md:order-1")}>
        <div className="flex items-center gap-2">
          <span className="num shrink-0 text-xs text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>

          <input
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            onBlur={() => heading !== (note.heading ?? "") && onPatch({ heading: heading || null })}
            placeholder="Başlık"
            aria-label="Not başlığı"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0"
          />

          {/* video anı */}
          {timeDraft !== null ? (
            <Input
              autoFocus
              value={timeDraft}
              onChange={(e) => setTimeDraft(e.target.value)}
              onBlur={commitTime}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setTimeDraft(null);
              }}
              placeholder="12:30"
              aria-label="Videodaki an"
              className="num h-7 w-20 text-xs"
            />
          ) : note.timestamp_sec !== null ? (
            <button
              type="button"
              onClick={() => (hasVideo ? onSeek(note.timestamp_sec!) : undefined)}
              onDoubleClick={() => setTimeDraft(stamp(note.timestamp_sec))}
              title={hasVideo ? "Videoyu bu ana sar (çift tıkla: düzenle)" : "Videodaki an"}
              className="num shrink-0 border border-border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-rule-strong hover:text-foreground"
            >
              {stamp(note.timestamp_sec)}
            </button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Videodaki anı işaretle"
              onClick={() => setTimeDraft("")}
            >
              <Clock className="size-3.5" aria-hidden="true" />
            </Button>
          )}

          {/* blok işlemleri */}
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Görseli diğer yana al"
              onClick={() => onPatch({ image_side: imageLeft ? "right" : "left" })}
            >
              <ArrowLeftRight className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Yukarı taşı"
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ChevronUp className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Aşağı taşı"
              disabled={index === count - 1}
              onClick={() => onMove(1)}
            >
              <ChevronDown className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              aria-label="Notu sil"
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => body !== (note.body ?? "") && onPatch({ body: body || null })}
          placeholder="Grafikte ne oluyor, kural ne, neden çalışıyor?"
          aria-label="Not"
          className="mt-2 field-sizing-content min-h-28 w-full resize-y bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* -------------------------------------------------------- görsel */}
      <div className={cn("order-1 min-w-0", imageLeft ? "md:order-1" : "md:order-2")}>
        {note.image_path && imageUrl ? (
          <figure className="relative">
            <button
              type="button"
              onClick={() => setZoom(true)}
              className="relative block aspect-video w-full overflow-hidden border border-border bg-muted"
              aria-label="Görseli büyüt"
            >
              <Image
                src={imageUrl}
                alt={note.heading ?? "Ders grafiği"}
                fill
                unoptimized
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <span className="absolute right-1.5 bottom-1.5 bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 className="size-3.5" aria-hidden="true" />
              </span>
            </button>

            <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => fileRef.current?.click()}
              >
                Görseli değiştir
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => onPatch({ image_path: null })}
              >
                Kaldır
              </Button>
            </div>
          </figure>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              takeFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex aspect-video w-full flex-col items-center justify-center gap-1.5 border border-dashed px-4 text-center text-xs transition-colors",
              dragging
                ? "border-rule-strong bg-accent text-foreground"
                : "border-border text-muted-foreground hover:border-rule-strong hover:text-foreground",
            )}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="size-4" aria-hidden="true" />
            )}
            <span>Grafiği bırak, seç ya da yapıştır</span>
            <span className="text-muted-foreground">PNG · JPG · WebP, en fazla 10 MB</span>
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            takeFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {imageUrl && (
        <Dialog open={zoom} onOpenChange={setZoom}>
          <DialogContent className="max-w-6xl border-border p-2 sm:max-w-6xl">
            <DialogTitle className="sr-only">{note.heading ?? "Ders grafiği"}</DialogTitle>
            {/* Tam boy inceleme: grafik detayları küçük çerçevede okunmuyor. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={note.heading ?? "Ders grafiği"}
              className="max-h-[85vh] w-full object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </article>
  );
}
