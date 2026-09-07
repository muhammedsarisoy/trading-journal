"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ExternalLink, Film, Pin, PinOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseVideo } from "@/lib/video";

export interface VideoHandle {
  /** Videoyu verilen saniyeye sarar ve oynatır. */
  seek: (seconds: number) => void;
}

/**
 * Günün videosu. Not zaman damgasına tıklanınca seek çağrılır: YouTube ve
 * Vimeo'ya oynatıcı komutu postMessage ile gider, dosyada currentTime yazılır.
 * Sabitlenirse not alırken ekranın üstünde küçük hâlde kalır.
 */
export const VideoFrame = forwardRef<VideoHandle, { url: string | null; title: string }>(
  function VideoFrame({ url, title }, ref) {
    const frameRef = useRef<HTMLIFrameElement>(null);
    const fileRef = useRef<HTMLVideoElement>(null);
    const [pinned, setPinned] = useState(false);

    const video = useMemo(() => parseVideo(url), [url]);

    useImperativeHandle(ref, () => ({
      seek(seconds: number) {
        if (video.kind === "youtube") {
          post(frameRef.current, { event: "command", func: "seekTo", args: [seconds, true] });
          post(frameRef.current, { event: "command", func: "playVideo", args: [] });
          return;
        }
        if (video.kind === "vimeo") {
          post(frameRef.current, { method: "setCurrentTime", value: seconds });
          post(frameRef.current, { method: "play" });
          return;
        }
        if (fileRef.current) {
          fileRef.current.currentTime = seconds;
          void fileRef.current.play();
        }
      },
    }));

    if (!url) {
      return (
        <div className="flex items-center gap-2 border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          <Film className="size-4 shrink-0" aria-hidden="true" />
          Bu güne henüz video bağlantısı eklenmedi. Günü düzenleyip YouTube ya da Vimeo adresini
          yapıştır.
        </div>
      );
    }

    if (!video.src) {
      return (
        <div className="flex flex-wrap items-center gap-2 border border-border px-4 py-6 text-sm text-muted-foreground">
          <span>Bu adres sayfa içinde oynatılamıyor.</span>
          <Button asChild variant="outline" size="sm">
            <a href={video.href} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="size-4" aria-hidden="true" />
              Videoyu aç
            </a>
          </Button>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "z-30 bg-background",
          pinned && "sticky top-12 ml-auto w-full max-w-sm pt-2 pb-3",
        )}
      >
        <div className="relative aspect-video w-full overflow-hidden border border-border bg-black">
          {video.kind === "file" ? (
            <video ref={fileRef} src={video.src} controls className="size-full" />
          ) : (
            <iframe
              ref={frameRef}
              src={video.src}
              title={title}
              className="size-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setPinned((p) => !p)}
            aria-pressed={pinned}
          >
            {pinned ? (
              <PinOff className="size-3.5" aria-hidden="true" />
            ) : (
              <Pin className="size-3.5" aria-hidden="true" />
            )}
            {pinned ? "Sabitlemeyi kaldır" : "Not alırken üstte tut"}
          </Button>
          <Button asChild variant="ghost" size="sm" className="ml-auto text-xs text-muted-foreground">
            <a href={video.href} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Kaynakta aç
            </a>
          </Button>
        </div>
      </div>
    );
  },
);

/** Oynatıcı komutları iframe'e JSON olarak gider. */
function post(frame: HTMLIFrameElement | null, message: unknown) {
  frame?.contentWindow?.postMessage(JSON.stringify(message), "*");
}
