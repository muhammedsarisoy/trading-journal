/*
 * Giriş ekranının dekoratif piyasa arka planı: mum grafiği + hareketli ortalama.
 *
 * Kaynak: Uiverse.io "popular-dingo-38" (vishnu1100) — polyline'ı soldan sağa
 * süpürerek açan "kalp ritmi" yükleyicisi.
 *   https://uiverse.io/vishnu1100/popular-dingo-38
 *   https://github.com/uiverse-io/galaxy/blob/main/loaders/vishnu1100_popular-dingo-38.html
 * Lisans: MIT — Copyright (c) 2023 Uiverse.io
 *   https://github.com/uiverse-io/galaxy/blob/main/LICENSE
 *
 * Uyarlama: ritim çizgisi yerine fiyat üzerinde 8'lik hareketli ortalama,
 * altına sırayla yükselen mumlar ve son fiyat işareti eklendi. Örtü div'inin
 * genişliğini oynatmak yerine çizgi `clip-path` ile açılır; renkler temanın
 * kâr/zarar belirteçlerinden gelir.
 *
 * Tamamen statik SVG + CSS: istemci JS'i yok, dış istek yok, CSP'ye dokunmaz.
 * Sürekli dönen tek animasyon son fiyattaki küçük nabızdır (transform/opacity).
 */
import styles from "./market-backdrop.module.css";

type Candle = { open: number; close: number; high: number; low: number };

const COUNT = 56;
const SLOT = 10;
const BODY = 6;
/** Sağda etiket için boş bırakılan alan (mum yuvası cinsinden). */
const PAD_SLOTS = 8;
const W = (COUNT + PAD_SLOTS) * SLOT;
/** Yükseklik yüzde gibi okunur: y=30 sayfanın %30'u. */
const H = 100;
const Y_TOP = 32;
const Y_BOTTOM = 90;
const MA_PERIOD = 8;

/** Sabit tohumlu küçük PRNG: her çizimde aynı grafik çıkar. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hafif yükseliş eğilimli, arada geri çekilen bir rastgele yürüyüş. */
function buildCandles(): Candle[] {
  const rand = mulberry32(11);
  const out: Candle[] = [];
  let price = 1180;
  for (let i = 0; i < COUNT; i++) {
    const open = price;
    // Kartın iki yanında okunur bir hikâye: yükseliş, geri çekilme, ralli.
    const drift = i < 16 ? 3 : i < 24 ? -3.5 : i < 38 ? 2.5 : i < 44 ? -3 : 5;
    let close = open + drift + (rand() - 0.5) * 14;
    // Son mum yükselişte bitsin: etiket kâr renginde kalır.
    if (i === COUNT - 1 && close <= open) close = open + 6;
    out.push({
      open,
      close,
      high: Math.max(open, close) + rand() * 7,
      low: Math.min(open, close) - rand() * 7,
    });
    price = close;
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

const candles = buildCandles();
const min = Math.min(...candles.map((c) => c.low));
const max = Math.max(...candles.map((c) => c.high));
const toY = (p: number) => round(Y_BOTTOM - ((p - min) / (max - min)) * (Y_BOTTOM - Y_TOP));
const centerX = (i: number) => i * SLOT + SLOT / 2;

const bars = candles.map((c, i) => {
  const top = toY(Math.max(c.open, c.close));
  const bottom = toY(Math.min(c.open, c.close));
  return {
    up: c.close >= c.open,
    cx: centerX(i),
    high: toY(c.high),
    low: toY(c.low),
    top,
    height: Math.max(0.4, round(bottom - top)),
  };
});

const maPoints = candles
  .map((_, i) => {
    const from = Math.max(0, i - MA_PERIOD + 1);
    const span = candles.slice(from, i + 1);
    const avg = span.reduce((s, c) => s + c.close, 0) / span.length;
    return `${centerX(i)},${toY(avg)}`;
  })
  .join(" ");

const last = candles[COUNT - 1];
const lastLeft = `${round((centerX(COUNT - 1) / W) * 100)}%`;
const lastTop = `${toY(last.close)}%`;
const lastLabel = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(last.close);

export function MarketBackdrop() {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 select-none overflow-hidden ${styles.root}`}
    >
      <div className={`absolute inset-0 ${styles.grid}`} />

      <div className={`absolute inset-0 ${styles.chart}`}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className={`absolute inset-0 size-full ${styles.candles}`}
        >
          {bars.map((b, i) => (
            <g
              key={i}
              className={`${styles.candle} ${b.up ? styles.up : styles.down}`}
              style={{ "--i": i } as React.CSSProperties}
            >
              <line
                x1={b.cx}
                x2={b.cx}
                y1={b.high}
                y2={b.low}
                vectorEffect="non-scaling-stroke"
              />
              <rect x={b.cx - BODY / 2} y={b.top} width={BODY} height={b.height} />
            </g>
          ))}
        </svg>

        {/* Ortalama ayrı katmanda: soldan sağa clip-path ile açılır. */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className={`absolute inset-0 size-full ${styles.ma}`}
        >
          <polyline points={maPoints} vectorEffect="non-scaling-stroke" />
        </svg>

        {/* Son fiyat: kesikli seviye çizgisi, nabız ve etiket. */}
        <div
          className={`absolute right-0 ${styles.level}`}
          style={{ left: lastLeft, top: lastTop }}
        />
        <span className={styles.dot} style={{ left: lastLeft, top: lastTop }} />
        <span
          className={`num absolute right-4 hidden rounded-sm px-1.5 py-0.5 text-[11px] leading-none sm:block md:right-6 ${styles.tag}`}
          style={{ top: lastTop }}
        >
          {lastLabel}
        </span>
      </div>
    </div>
  );
}
