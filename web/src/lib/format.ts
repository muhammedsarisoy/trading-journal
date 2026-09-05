import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  TRY: "₺",
  GBP: "£",
  USDT: "$",
};

export function currencySymbol(code?: string | null) {
  if (!code) return "";
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

/** 1234.5 → "$1.234,50" · signed=true ise "+$1.234,50" */
export function money(
  value: number | null | undefined,
  currency = "USD",
  { signed = false, decimals = 2 }: { signed?: boolean; decimals?: number } = {},
) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  const body = Math.abs(value).toLocaleString("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${currencySymbol(currency)}${body}`;
}

/** Kısa para: 12.400 → "$12,4B" (grafik eksenleri için) */
export function moneyCompact(value: number, currency = "USD") {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const sym = currencySymbol(currency);
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(1)}B`;
  return `${sign}${sym}${abs.toFixed(0)}`;
}

export function num(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/** Fiyat: küçük değerlerde daha çok ondalık. */
export function price(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : 8;
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

/** 0.4212 → "%42,1" */
export function percent(value: number | null | undefined, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `%${(value * 100).toLocaleString("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** 2.31 → "+2,31R" */
export function rMultiple(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}R`;
}

export function ratio(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const d = typeof value === "string" ? parseISO(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateTime(value: string | null | undefined) {
  const d = toDate(value);
  return d ? format(d, "dd MMM yyyy HH:mm", { locale: tr }) : "—";
}

export function dateShort(value: string | null | undefined) {
  const d = toDate(value);
  return d ? format(d, "dd MMM yyyy", { locale: tr }) : "—";
}

/** Grafik ekseni etiketi — kova türüne göre biçim değişir. */
export function bucketLabel(value: string, bucket: string) {
  const d = toDate(value);
  if (!d) return value;
  switch (bucket) {
    case "day":
      return format(d, "dd MMM", { locale: tr });
    case "week":
      return format(d, "dd MMM", { locale: tr });
    case "month":
      return format(d, "MMM yy", { locale: tr });
    case "quarter":
      return `${Math.floor(d.getMonth() / 3) + 1}Ç ${format(d, "yy")}`;
    case "halfyear":
      return `${d.getMonth() < 6 ? "1" : "2"}Y ${format(d, "yyyy")}`;
    case "year":
      return format(d, "yyyy");
    default:
      return format(d, "dd MMM yyyy", { locale: tr });
  }
}

/** <input type="datetime-local"> değeri (yerel saat). */
export function toLocalInput(value: string | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** datetime-local → ISO */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Tutulma süresi: "3s 30d" */
export function holdDuration(openedAt: string, closedAt: string | null) {
  if (!closedAt) return "—";
  const a = toDate(openedAt);
  const b = toDate(closedAt);
  if (!a || !b) return "—";
  return minutesToText(Math.round((b.getTime() - a.getTime()) / 60000));
}

export function minutesToText(mins: number | null | undefined) {
  if (mins === null || mins === undefined || Number.isNaN(mins)) return "—";
  const total = Math.max(0, Math.round(mins));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d) return `${d}g ${h}s`;
  if (h) return `${h}s ${m}d`;
  return `${m}d`;
}

/** Kâr/zarara göre metin rengi. */
export function pnlTone(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-profit" : "text-loss";
}
