/**
 * Bağımlılıksız, küçük bir PDF yazıcısı.
 *
 * Yalnız bu defterin ihtiyacı kadarını yapar: standart Type1 yazı tipleri,
 * düz metin, çizgi ve dolgu dikdörtgen. Yazı tipi gömülmediği için çıktı
 * birkaç yüz kilobayt değil, birkaç kilobayt kalıyor.
 *
 * Türkçe: WinAnsi kodlamasında ş/ğ/ı/İ yok. Encoding sözlüğüne /Differences
 * eklenerek Latin harflerinin kullanılmayan altı yuvası (Šš/Žž ve iki boş kod)
 * Türkçe gliflere yönlendiriliyor; okuyucu bunları standart Adobe glif
 * adlarından çözüyor.
 */

export type FontKey = "sans" | "sansBold" | "mono";

/** Kullanılmayan WinAnsi yuvalarına yerleşen Türkçe glifler. */
const DIFFERENCES: Record<string, number> = {
  "Ş": 0x8a, // Scaron yuvası
  "ı": 0x8d, // WinAnsi'de tanımsız
  "Ğ": 0x8e, // Zcaron yuvası
  "İ": 0x8f, // WinAnsi'de tanımsız
  "ş": 0x9a, // scaron yuvası
  "ğ": 0x9e, // zcaron yuvası
};

/** Encoding sözlüğüne yazılan karşılık — kodlar artan sırada. */
const DIFFERENCES_PDF =
  "[138/Scedilla 141/dotlessi 142/Gbreve 143/Idotaccent 154/scedilla 158/gbreve]";

/**
 * CP1252'nin 0x80-0x9F aralığı. Türkçeye devredilen dört yuva (0x8A, 0x8E,
 * 0x9A, 0x9E) bilerek dışarıda; oraya düşen Šš/Žž yanlış harf çizerdi.
 */
const CP1252_HIGH: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "‹": 0x8b,
  "Œ": 0x8c,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  "›": 0x9b,
  "œ": 0x9c,
  "Ÿ": 0x9f,
};

/** Hiçbir yuvası olmayan ama metinde geçebilen işaretler. */
const FALLBACKS: Record<string, string> = {
  "₺": "TL",
  "₽": "RUB",
  "Š": "S",
  "š": "s",
  "Ž": "Z",
  "ž": "z",
  "→": "->",
  "≤": "<=",
  "≥": ">=",
  "≈": "~",
};

/** "32=278 48-57=556" → kod başına genişlik (1/1000 em). */
function widthTable(spec: string): number[] {
  const widths = new Array<number>(256).fill(0);
  for (const part of spec.split(" ")) {
    const [range, value] = part.split("=");
    const width = Number(value);
    const dash = range.indexOf("-");
    const start = dash < 0 ? Number(range) : Number(range.slice(0, dash));
    const end = dash < 0 ? start : Number(range.slice(dash + 1));
    for (let code = start; code <= end; code++) widths[code] = width;
  }
  return widths;
}

// Adobe çekirdek yazı tipi ölçüleri. Türkçeye devredilen yuvalar
// (138/141/142/143/154/158) yerine geçtikleri harfin genişliğini alır.
const HELVETICA = widthTable(
  "32=278 33=278 34=355 35=556 36=556 37=889 38=667 39=191 40=333 41=333 42=389 43=584 " +
    "44=278 45=333 46=278 47=278 48-57=556 58=278 59=278 60-62=584 63=556 64=1015 " +
    "65-66=667 67-68=722 69=667 70=611 71=778 72=722 73=278 74=500 75=667 76=556 77=833 " +
    "78=722 79=778 80=667 81=778 82=722 83=667 84=611 85=722 86=667 87=944 88-89=667 " +
    "90=611 91-93=278 94=469 95=556 96=333 97-98=556 99=500 100-101=556 102=278 " +
    "103-104=556 105-106=222 107=500 108=222 109=833 110-113=556 114=333 115=500 116=278 " +
    "117=556 118=500 119=722 120-122=500 123=334 124=260 125=334 126=584 128=556 130=222 " +
    "131=556 132=333 133=1000 134-135=556 136=333 137=1000 138=667 139=333 140=1000 " +
    "141=222 142=778 143=278 145-146=222 147-148=333 149=350 150=556 151=1000 152=333 " +
    "153=1000 154=500 155=333 156=944 158=556 159=667 160=278 161=333 162-165=556 166=260 " +
    "167=556 168=333 169=737 170=370 171=556 172=584 173=333 174=737 175=333 176=400 " +
    "177=584 178-180=333 181=556 182=537 183=278 184-185=333 186=365 187=556 188-190=834 " +
    "191=611 192-197=667 198=1000 199=722 200-203=667 204-207=278 208-209=722 210-214=778 " +
    "215=584 216=778 217-220=722 221-222=667 223=611 224-229=556 230=889 231=500 " +
    "232-235=556 236-239=278 240-246=556 247=584 248=611 249-252=556 253=500 254=556 255=500",
);

const HELVETICA_BOLD = widthTable(
  "32=278 33=333 34=474 35-36=556 37=889 38=722 39=238 40-41=333 42=389 43=584 44=278 " +
    "45=333 46-47=278 48-57=556 58-59=333 60-62=584 63=611 64=975 65-68=722 69=667 70=611 " +
    "71=778 72=722 73=278 74=556 75=722 76=611 77=833 78=722 79=778 80=667 81=778 82=722 " +
    "83=667 84=611 85=722 86=667 87=944 88-89=667 90=611 91=333 92=278 93=333 94=584 " +
    "95=556 96=333 97=556 98=611 99=556 100=611 101=556 102=333 103-104=611 105-106=278 " +
    "107=556 108=278 109=889 110-113=611 114=389 115=556 116=333 117=611 118=556 119=778 " +
    "120-121=556 122=500 123=389 124=280 125=389 126=584 128=556 130=278 131=556 132=500 " +
    "133=1000 134-135=556 136=333 137=1000 138=667 139=333 140=1000 141=278 142=778 " +
    "143=278 145-146=278 147-148=500 149=350 150=556 151=1000 152=333 153=1000 154=556 " +
    "155=333 156=889 158=611 159=667 160=278 161=333 162-165=556 166=280 167=556 168=333 " +
    "169=737 170=370 171=556 172=584 173=333 174=737 175=333 176=400 177=584 178-180=333 " +
    "181=611 182=556 183=278 184-185=333 186=365 187=556 188-190=834 191=611 192-197=722 " +
    "198=1000 199=722 200-203=667 204-207=278 208-209=722 210-214=778 215=584 216=778 " +
    "217-220=722 221-222=667 223=611 224-229=556 230=889 231=556 232-235=556 236-239=278 " +
    "240-246=611 247=584 248=611 249-252=611 253=556 254=611 255=556",
);

const COURIER = widthTable("32-255=600");

const FONTS: Record<FontKey, { res: string; base: string; widths: number[] }> = {
  sans: { res: "F1", base: "Helvetica", widths: HELVETICA },
  sansBold: { res: "F2", base: "Helvetica-Bold", widths: HELVETICA_BOLD },
  mono: { res: "F3", base: "Courier", widths: COURIER },
};

/** Metni yazı tipinin beklediği bayt dizisine çevirir. */
function encodeText(value: string): number[] {
  const bytes: number[] = [];
  for (const ch of value) {
    const swapped = DIFFERENCES[ch];
    if (swapped !== undefined) {
      bytes.push(swapped);
      continue;
    }
    const code = ch.codePointAt(0) ?? 0x3f;
    // Bölünemez boşluk: tr-TR sayı biçimlendirmesi üretebiliyor, düz boşluğa iner.
    if (code === 0xa0) {
      bytes.push(0x20);
      continue;
    }
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff)) {
      bytes.push(code);
      continue;
    }
    const high = CP1252_HIGH[ch];
    if (high !== undefined) {
      bytes.push(high);
      continue;
    }
    const fallback = FALLBACKS[ch];
    if (fallback !== undefined) {
      for (const byte of encodeText(fallback)) bytes.push(byte);
      continue;
    }
    bytes.push(0x3f); // "?"
  }
  return bytes;
}

/** PDF dize gösterimi: (…) içinde ters bölü ve parantez kaçışlı. */
function pdfString(value: string): number[] {
  const out: number[] = [0x28]; // (
  for (const byte of encodeText(value)) {
    if (byte === 0x0a || byte === 0x0d) {
      out.push(0x20);
      continue;
    }
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out.push(0x5c);
    out.push(byte);
  }
  out.push(0x29); // )
  return out;
}

function ascii(value: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < value.length; i++) out.push(value.charCodeAt(i) & 0xff);
  return out;
}

/** Gereksiz ondalık taşımayan sayı biçimi. */
function nf(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** "#1a9e6a" → PDF renk operandı. */
function rgb(hex: string): string {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return `${nf(r)} ${nf(g)} ${nf(b)}`;
}

export interface TextOptions {
  font?: FontKey;
  size?: number;
  color?: string;
  /** Hizalama, verilen x'e göre. */
  align?: "left" | "right" | "center";
  /** Doluysa metin bu genişliğe kısaltılır. */
  maxWidth?: number;
}

export interface PdfOptions {
  title?: string;
  orientation?: "portrait" | "landscape";
  /** Kenar boşluğu (punto). */
  margin?: number;
}

const A4_SHORT = 595.28;
const A4_LONG = 841.89;

export class Pdf {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  private readonly title: string;
  private readonly pages: number[][] = [];
  private current = 0;

  constructor({ title = "", orientation = "portrait", margin = 40 }: PdfOptions = {}) {
    this.title = title;
    this.width = orientation === "landscape" ? A4_LONG : A4_SHORT;
    this.height = orientation === "landscape" ? A4_SHORT : A4_LONG;
    this.margin = margin;
    this.pages.push([]);
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Yeni sayfa açar ve imleci oraya taşır. */
  addPage(): void {
    this.pages.push([]);
    this.current = this.pages.length - 1;
  }

  /** Alt bilgi gibi sonradan yazılan şeyler için sayfa değiştirir (0 tabanlı). */
  goToPage(index: number): void {
    if (index >= 0 && index < this.pages.length) this.current = index;
  }

  /** Metnin punto cinsinden genişliği. */
  textWidth(value: string, font: FontKey = "sans", size = 10): number {
    const { widths } = FONTS[font];
    let total = 0;
    for (const byte of encodeText(value)) total += widths[byte] || 0;
    return (total * size) / 1000;
  }

  /** Sığmayan metni "…" ile keser. */
  fit(value: string, maxWidth: number, font: FontKey = "sans", size = 10): string {
    if (this.textWidth(value, font, size) <= maxWidth) return value;
    const room = maxWidth - this.textWidth("…", font, size);
    let cut = "";
    for (const ch of value) {
      if (this.textWidth(cut + ch, font, size) > room) break;
      cut += ch;
    }
    return `${cut.trimEnd()}…`;
  }

  /** y, yazının taban çizgisi; koordinatlar sol üstten sayılır. */
  text(value: string, x: number, y: number, options: TextOptions = {}): void {
    const { font = "sans", size = 10, color = "#000000", align = "left", maxWidth } = options;
    const shown = maxWidth ? this.fit(value, maxWidth, font, size) : value;
    if (!shown) return;

    let left = x;
    if (align !== "left") {
      const w = this.textWidth(shown, font, size);
      left = align === "right" ? x - w : x - w / 2;
    }

    const out = this.pages[this.current];
    push(out, ascii(`BT ${rgb(color)} rg /${FONTS[font].res} ${nf(size)} Tf `));
    push(out, ascii(`${nf(left)} ${nf(this.height - y)} Td `));
    push(out, pdfString(shown));
    push(out, ascii(" Tj ET\n"));
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    { color = "#000000", width = 0.5 }: { color?: string; width?: number } = {},
  ): void {
    push(
      this.pages[this.current],
      ascii(
        `${rgb(color)} RG ${nf(width)} w ${nf(x1)} ${nf(this.height - y1)} m ` +
          `${nf(x2)} ${nf(this.height - y2)} l S\n`,
      ),
    );
  }

  /** Dolgu dikdörtgen; x/y sol üst köşe. */
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    { color = "#000000" }: { color?: string } = {},
  ): void {
    push(
      this.pages[this.current],
      ascii(`${rgb(color)} rg ${nf(x)} ${nf(this.height - y - h)} ${nf(w)} ${nf(h)} re f\n`),
    );
  }

  /** Nesneleri, çapraz başvuru tablosunu ve fragmanı yazıp dosyayı kurar. */
  private build(): Uint8Array<ArrayBuffer> {
    const objects: number[][] = [];
    const add = (body: number[]): number => {
      objects.push(body);
      return objects.length;
    };

    const encoding = add(
      ascii(`<</Type/Encoding/BaseEncoding/WinAnsiEncoding/Differences${DIFFERENCES_PDF}>>`),
    );
    const fontIds = (Object.keys(FONTS) as FontKey[]).map((key) => ({
      res: FONTS[key].res,
      id: add(
        ascii(
          `<</Type/Font/Subtype/Type1/BaseFont/${FONTS[key].base}/Encoding ${encoding} 0 R>>`,
        ),
      ),
    }));

    const resources = `<</Font<<${fontIds.map((f) => `/${f.res} ${f.id} 0 R`).join("")}>>>>`;

    // Sayfa nesneleri /Parent ile ağacın köküne bakar; kök, akışlardan sonra gelir.
    const parentId = objects.length + this.pages.length * 2 + 1;
    const pageIds: number[] = [];
    for (const content of this.pages) {
      const stream = add([
        ...ascii(`<</Length ${content.length}>>\nstream\n`),
        ...content,
        ...ascii("\nendstream"),
      ]);
      pageIds.push(
        add(
          ascii(
            `<</Type/Page/Parent ${parentId} 0 R/MediaBox[0 0 ${nf(this.width)} ${nf(
              this.height,
            )}]/Resources${resources}/Contents ${stream} 0 R>>`,
          ),
        ),
      );
    }

    const pagesId = add(
      ascii(
        `<</Type/Pages/Kids[${pageIds
          .map((id) => `${id} 0 R`)
          .join(" ")}]/Count ${pageIds.length}>>`,
      ),
    );
    const catalog = add(ascii(`<</Type/Catalog/Pages ${pagesId} 0 R>>`));
    const info = add([
      ...ascii("<</Title "),
      ...pdfString(this.title),
      ...ascii("/Producer "),
      ...pdfString("Trading Journal"),
      ...ascii(`/CreationDate ${pdfDate(new Date())}>>`),
    ]);

    const body: number[] = [...ascii("%PDF-1.4\n"), 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a];
    const offsets: number[] = [];
    objects.forEach((obj, i) => {
      offsets.push(body.length);
      push(body, ascii(`${i + 1} 0 obj\n`));
      push(body, obj);
      push(body, ascii("\nendobj\n"));
    });

    const xref = body.length;
    push(body, ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
    for (const offset of offsets) {
      push(body, ascii(`${String(offset).padStart(10, "0")} 00000 n \n`));
    }
    push(
      body,
      ascii(
        `trailer\n<</Size ${objects.length + 1}/Root ${catalog} 0 R/Info ${info} 0 R>>\n` +
          `startxref\n${xref}\n%%EOF\n`,
      ),
    );

    return Uint8Array.from(body);
  }

  toBlob(): Blob {
    return new Blob([this.build()], { type: "application/pdf" });
  }
}

/** Büyük diziler için: spread yerine döngü, yığın taşmasın. */
function push(target: number[], bytes: number[]): void {
  for (let i = 0; i < bytes.length; i++) target.push(bytes[i]);
}

function pdfDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `(D:${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())})`
  );
}

/** Dosyayı tarayıcıya indirtir. */
export function downloadPdf(pdf: Pdf, filename: string): void {
  const url = URL.createObjectURL(pdf.toBlob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Chrome indirmeyi kuyruğa aldıktan sonra serbest bırak.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
