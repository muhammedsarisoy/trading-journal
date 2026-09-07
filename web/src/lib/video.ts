// Eğitim videosu bağlantılarını gömülebilir hale getirir.
// Desteklenen: YouTube (watch / kısa bağlantı / shorts / embed), Vimeo,
// doğrudan mp4/webm dosyası. Tanınmayan adres bağlantı olarak açılır.

export type VideoKind = "youtube" | "vimeo" | "file" | "unknown";

export interface ParsedVideo {
  kind: VideoKind;
  /** iframe ya da video etiketine verilecek adres. */
  src: string | null;
  /** Bağlantının kendisinde geçen başlangıç anı (saniye). */
  start: number;
  /** Yeni sekmede açmak için özgün adres. */
  href: string;
}

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"];
const VIMEO_HOSTS = ["vimeo.com", "www.vimeo.com", "player.vimeo.com"];

/** "1h2m10s" ya da "90" → saniye */
function parseStartParam(value: string | null): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const m = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function parseVideo(raw: string | null | undefined): ParsedVideo {
  const href = (raw ?? "").trim();
  if (!href) return { kind: "unknown", src: null, start: 0, href: "" };

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "unknown", src: null, start: 0, href };
  }

  const host = url.hostname.toLowerCase();
  const start = parseStartParam(url.searchParams.get("t") ?? url.searchParams.get("start"));

  if (YOUTUBE_HOSTS.includes(host)) {
    const id = youtubeId(url);
    if (!id) return { kind: "unknown", src: null, start, href };
    // enablejsapi: not zaman damgasına tıklayınca videoyu o ana sarabilmek için.
    const params = new URLSearchParams({
      enablejsapi: "1",
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
    });
    if (start) params.set("start", String(start));
    return {
      kind: "youtube",
      src: `https://www.youtube-nocookie.com/embed/${id}?${params}`,
      start,
      href,
    };
  }

  if (VIMEO_HOSTS.includes(host)) {
    const id = url.pathname.split("/").filter(Boolean).pop();
    if (!id || !/^\d+$/.test(id)) return { kind: "unknown", src: null, start, href };
    return {
      kind: "vimeo",
      src: `https://player.vimeo.com/video/${id}${start ? `#t=${start}s` : ""}`,
      start,
      href,
    };
  }

  if (/\.(mp4|webm|ogg|mov)$/i.test(url.pathname)) {
    return { kind: "file", src: href, start, href };
  }

  return { kind: "unknown", src: null, start, href };
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host.endsWith("youtu.be")) return url.pathname.slice(1).split("/")[0] || null;

  const v = url.searchParams.get("v");
  if (v) return v;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
    return parts[1] ?? null;
  }
  return null;
}

/** 3725 → "1:02:05" · 125 → "2:05" */
export function stamp(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(totalSeconds)) return "";
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "1:02:05" / "2:05" / "125" → saniye. Geçersizse null. */
export function parseStamp(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  if (!/^\d{1,2}(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(":").map(Number);
  return parts.reduce((acc, part) => acc * 60 + part, 0);
}
