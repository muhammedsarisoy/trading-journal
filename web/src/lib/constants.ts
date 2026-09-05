import type {
  AssetClass,
  Bucket,
  BreakdownDim,
  Direction,
  Phase,
  QuantityUnit,
} from "@/lib/types";

// Enstrüman sınıfları. contractSize, formda otomatik doldurulan çarpandır.
export const ASSET_CLASSES: {
  value: AssetClass;
  label: string;
  unit: QuantityUnit;
  contractSize: number;
}[] = [
  { value: "forex", label: "Forex / Parite", unit: "lot", contractSize: 100000 },
  { value: "crypto", label: "Kripto", unit: "coin", contractSize: 1 },
  { value: "stock", label: "Hisse", unit: "share", contractSize: 1 },
  { value: "futures", label: "Vadeli (Futures)", unit: "contract", contractSize: 1 },
  { value: "commodity", label: "Emtia", unit: "contract", contractSize: 1 },
  { value: "index", label: "Endeks", unit: "contract", contractSize: 1 },
  { value: "option", label: "Opsiyon", unit: "contract", contractSize: 100 },
];

export const ASSET_LABELS = Object.fromEntries(
  ASSET_CLASSES.map((a) => [a.value, a.label]),
) as Record<AssetClass, string>;

export const QUANTITY_UNITS: { value: QuantityUnit; label: string }[] = [
  { value: "lot", label: "Lot" },
  { value: "contract", label: "Kontrat" },
  { value: "share", label: "Adet (hisse)" },
  { value: "coin", label: "Adet (coin)" },
  { value: "unit", label: "Birim" },
];

export const UNIT_LABELS = Object.fromEntries(
  QUANTITY_UNITS.map((u) => [u.value, u.label]),
) as Record<QuantityUnit, string>;

export const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "long", label: "Long (Alış)" },
  { value: "short", label: "Short (Satış)" },
];

export const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W", "1M"];

export const CURRENCIES = ["USD", "EUR", "TRY", "GBP", "USDT"];

// İşlem öncesi / sonrası duygu durumu
export const EMOTIONS: { value: string; label: string; tone: "good" | "neutral" | "bad" }[] = [
  { value: "sakin", label: "Sakin", tone: "good" },
  { value: "kendine_guvenli", label: "Kendine güvenli", tone: "good" },
  { value: "sabirli", label: "Sabırlı", tone: "good" },
  { value: "odakli", label: "Odaklı", tone: "good" },
  { value: "notr", label: "Nötr", tone: "neutral" },
  { value: "tereddutlu", label: "Tereddütlü", tone: "neutral" },
  { value: "sikilmis", label: "Sıkılmış", tone: "neutral" },
  { value: "aceleci", label: "Aceleci / FOMO", tone: "bad" },
  { value: "intikamci", label: "İntikam modunda", tone: "bad" },
  { value: "korkulu", label: "Korkulu", tone: "bad" },
  { value: "acgozlu", label: "Açgözlü", tone: "bad" },
  { value: "yorgun", label: "Yorgun / dikkatsiz", tone: "bad" },
  { value: "stresli", label: "Stresli", tone: "bad" },
];

export const EMOTION_LABELS = Object.fromEntries(
  EMOTIONS.map((e) => [e.value, e.label]),
) as Record<string, string>;

// "Nelere baktım" — teyit önerileri (serbest metin de eklenebilir)
export const CONFLUENCE_SUGGESTIONS = [
  "Trend yönü",
  "Destek/Direnç",
  "Arz-talep bölgesi",
  "Fibonacci",
  "Trend çizgisi",
  "Kanal",
  "Formasyon",
  "Mum formasyonu",
  "Hacim",
  "RSI uyumsuzluğu",
  "MACD",
  "EMA kesişimi",
  "VWAP",
  "Likidite avı",
  "Order block",
  "FVG / dengesizlik",
  "Seans açılışı",
  "Haber / veri takvimi",
  "Bilanço",
  "Üst zaman dilimi teyidi",
  "Korelasyon",
];

export const MISTAKE_SUGGESTIONS = [
  "Plan dışı giriş",
  "Stop koymadım",
  "Stop kaydırdım",
  "Erken kapattım",
  "Geç girdim",
  "Aşırı pozisyon büyüklüğü",
  "İntikam işlemi",
  "FOMO",
  "Haber öncesi pozisyon",
  "Analiz etmeden girdim",
  "Kâr al seviyesine uymadım",
  "Aşırı işlem (overtrading)",
];

export const SETUP_SUGGESTIONS = [
  "Trend takibi",
  "Kırılım (breakout)",
  "Geri çekilme (pullback)",
  "Ortalamaya dönüş",
  "Range ticareti",
  "Seans açılışı",
  "Haber ticareti",
  "Scalp",
  "Swing",
];

/** Hazır hesap listesi — Ayarlar'daki tek tıkla ekleme bunu kullanır. */
export const DEFAULT_FUNDS: {
  name: string;
  currency: string;
  is_prop: boolean;
  broker: string | null;
}[] = [
  { name: "BEM Funding", currency: "USD", is_prop: true, broker: null },
  { name: "Funding Pips", currency: "USD", is_prop: true, broker: null },
  { name: "Breakout", currency: "USD", is_prop: true, broker: null },
  { name: "OKX", currency: "USD", is_prop: false, broker: null },
  { name: "Broker", currency: "USD", is_prop: false, broker: null },
];

export const BUCKETS: { value: Bucket; label: string }[] = [
  { value: "day", label: "Günlük" },
  { value: "week", label: "Haftalık" },
  { value: "month", label: "Aylık" },
  { value: "quarter", label: "Çeyreklik" },
  { value: "halfyear", label: "6 Aylık" },
  { value: "year", label: "Yıllık" },
];

export const RANGES: { value: string; label: string; days: number | null }[] = [
  { value: "7d", label: "Son 7 gün", days: 7 },
  { value: "30d", label: "Son 30 gün", days: 30 },
  { value: "90d", label: "Son 90 gün", days: 90 },
  { value: "180d", label: "Son 6 ay", days: 180 },
  { value: "365d", label: "Son 1 yıl", days: 365 },
  { value: "all", label: "Tümü", days: null },
];

export const BREAKDOWN_DIMS: { value: BreakdownDim; label: string; group: string }[] = [
  { value: "setup", label: "Strateji", group: "Karar" },
  { value: "confluence", label: "Baktığım teyit", group: "Karar" },
  { value: "symbol", label: "Sembol", group: "Enstrüman" },
  { value: "asset_class", label: "Enstrüman sınıfı", group: "Enstrüman" },
  { value: "direction", label: "Yön", group: "Enstrüman" },
  { value: "timeframe", label: "Zaman dilimi", group: "Enstrüman" },
  { value: "fund", label: "Fon / hesap", group: "Hesap" },
  { value: "emotion_before", label: "İşlem öncesi duygu", group: "Psikoloji" },
  { value: "emotion_after", label: "İşlem sonrası duygu", group: "Psikoloji" },
  { value: "followed_plan", label: "Plana uyum", group: "Psikoloji" },
  { value: "confidence", label: "Güven düzeyi", group: "Psikoloji" },
  { value: "stress", label: "Stres düzeyi", group: "Psikoloji" },
  { value: "mistake", label: "Yaptığım hata", group: "Psikoloji" },
  { value: "weekday", label: "Haftanın günü", group: "Zamanlama" },
  { value: "hour", label: "Saat", group: "Zamanlama" },
  { value: "tag", label: "Etiket", group: "Diğer" },
];

export const PHASES: { value: Phase; label: string }[] = [
  { value: "entry", label: "Giriş" },
  { value: "exit", label: "Çıkış" },
  { value: "analysis", label: "Analiz" },
];

export const PHASE_LABELS = Object.fromEntries(
  PHASES.map((p) => [p.value, p.label]),
) as Record<Phase, string>;

export const WEEKDAY_LABELS: Record<string, string> = {
  "1": "Pazartesi",
  "2": "Salı",
  "3": "Çarşamba",
  "4": "Perşembe",
  "5": "Cuma",
  "6": "Cumartesi",
  "7": "Pazar",
};

export const SCREENSHOT_BUCKET = "trade-screenshots";
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
