/**
 * İşlem listesinin PDF çıktısı: başlık, uygulanan filtreler, özet şerit ve
 * sayfalara bölünen defter tablosu.
 */

import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";

import { Pdf, type FontKey } from "@/lib/pdf";
import { ASSET_LABELS } from "@/lib/constants";
import { money, num, rMultiple } from "@/lib/format";
import type { Trade } from "@/lib/types";

// Ekran koyu tema; kâğıt beyaz. Renkler baskı için ayrı seçildi.
const INK = "#14181d";
const MUTED = "#6b7280";
const RULE = "#dfe3e8";
const RULE_SOFT = "#eef1f4";
const ZEBRA = "#f7f8fa";
const PROFIT = "#12704a";
const LOSS = "#b3261e";

const SIZE = 8;
const ROW_HEIGHT = 15;
const HEADER_HEIGHT = 18;

interface Column {
  label: string;
  width: number;
  align: "left" | "right";
  font?: FontKey;
  value: (t: Trade) => string;
  /** Değere göre renk; yoksa nötr mürekkep. */
  color?: (t: Trade) => string;
}

function tone(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return MUTED;
  return value > 0 ? PROFIT : LOSS;
}

const COLUMNS: Column[] = [
  {
    label: "Tarih",
    width: 92,
    align: "left",
    font: "mono",
    value: (t) => format(parseISO(t.opened_at), "dd.MM.yyyy HH:mm"),
  },
  { label: "Sembol", width: 72, align: "left", value: (t) => t.symbol },
  {
    label: "Yön",
    width: 44,
    align: "left",
    value: (t) => (t.direction === "long" ? "Long" : "Short"),
  },
  {
    label: "Enstrüman",
    width: 84,
    align: "left",
    value: (t) => ASSET_LABELS[t.asset_class] ?? t.asset_class,
  },
  { label: "Hesap", width: 96, align: "left", value: (t) => t.fund_name ?? "—" },
  { label: "Strateji", width: 111, align: "left", value: (t) => t.setup ?? "—" },
  {
    label: "Durum",
    width: 46,
    align: "left",
    value: (t) => (t.status === "closed" ? "Kapalı" : "Açık"),
  },
  {
    label: "Risk",
    width: 78,
    align: "right",
    font: "mono",
    value: (t) => money(t.risk_amount, t.currency),
  },
  {
    label: "R",
    width: 56,
    align: "right",
    font: "mono",
    value: (t) => rMultiple(t.r_multiple),
    color: (t) => tone(t.r_multiple),
  },
  {
    label: "K/Z",
    width: 90,
    align: "right",
    font: "mono",
    value: (t) => money(t.pnl, t.currency, { signed: true }),
    color: (t) => tone(t.pnl),
  },
];

export interface TradesReport {
  trades: Trade[];
  /** "Aralık: Son 90 gün" gibi, kullanıcının ekranda seçtiği filtreler. */
  filters: string[];
}

/** Para birimi karışıksa toplam tek sayıya inmez; her biri ayrı yazılır. */
function netByCurrency(trades: Trade[]): { currency: string; net: number }[] {
  const totals = new Map<string, number>();
  for (const t of trades) {
    if (t.pnl === null) continue;
    totals.set(t.currency, (totals.get(t.currency) ?? 0) + t.pnl);
  }
  return [...totals].map(([currency, net]) => ({ currency, net }));
}

function summarize(trades: Trade[]) {
  const closed = trades.filter((t) => t.status === "closed");
  const decided = closed.filter((t) => t.pnl !== null && t.pnl !== 0);
  const wins = decided.filter((t) => (t.pnl ?? 0) > 0).length;
  const rValues = trades.map((t) => t.r_multiple).filter((r): r is number => r !== null);
  const totalR = rValues.reduce((sum, r) => sum + r, 0);

  return {
    count: trades.length,
    closed: closed.length,
    open: trades.length - closed.length,
    winRate: decided.length ? wins / decided.length : null,
    totalR,
    avgR: rValues.length ? totalR / rValues.length : null,
    nets: netByCurrency(trades),
  };
}

function netLabel(nets: { currency: string; net: number }[]): string {
  if (!nets.length) return "—";
  return nets.map((n) => money(n.net, n.currency, { signed: true })).join("  ");
}

/** Özet şerit: dört hücre, üstte küçük etiket altta değer. */
function drawSummary(pdf: Pdf, y: number, sum: ReturnType<typeof summarize>): number {
  const left = pdf.margin;
  const width = pdf.width - pdf.margin * 2;
  const height = 44;

  pdf.rect(left, y, width, height, { color: ZEBRA });

  const cells: { label: string; value: string; color?: string }[] = [
    { label: "İŞLEM", value: `${sum.count}  (${sum.closed} kapalı · ${sum.open} açık)` },
    {
      label: "KAZANMA ORANI",
      value: sum.winRate === null ? "—" : `%${num(sum.winRate * 100, 1)}`,
    },
    {
      label: "TOPLAM R",
      value: `${rMultiple(sum.totalR)}   (ort. ${rMultiple(sum.avgR)})`,
      color: tone(sum.totalR),
    },
    {
      label: "NET K/Z",
      value: netLabel(sum.nets),
      color: sum.nets.length === 1 ? tone(sum.nets[0].net) : INK,
    },
  ];

  const cellWidth = width / cells.length;
  cells.forEach((cell, i) => {
    const x = left + i * cellWidth + 12;
    if (i > 0) {
      pdf.line(left + i * cellWidth, y + 8, left + i * cellWidth, y + height - 8, {
        color: RULE,
      });
    }
    pdf.text(cell.label, x, y + 17, { size: 6.5, color: MUTED });
    pdf.text(cell.value, x, y + 33, {
      font: "mono",
      size: 9,
      color: cell.color ?? INK,
      maxWidth: cellWidth - 24,
    });
  });

  return y + height + 18;
}

function drawTableHead(pdf: Pdf, y: number): number {
  let x = pdf.margin;
  for (const col of COLUMNS) {
    pdf.text(col.label, col.align === "right" ? x + col.width : x, y + 12, {
      font: "sansBold",
      size: 7,
      color: MUTED,
      align: col.align,
      maxWidth: col.width - 6,
    });
    x += col.width;
  }
  const bottom = y + HEADER_HEIGHT;
  pdf.line(pdf.margin, bottom, pdf.width - pdf.margin, bottom, { color: RULE, width: 0.8 });
  return bottom;
}

function drawFooters(pdf: Pdf, generatedAt: Date): void {
  const y = pdf.height - 18;
  for (let i = 0; i < pdf.pageCount; i++) {
    pdf.goToPage(i);
    pdf.line(pdf.margin, y - 12, pdf.width - pdf.margin, y - 12, { color: RULE_SOFT });
    pdf.text(
      `Trading Journal · ${format(generatedAt, "d MMMM yyyy HH:mm", { locale: tr })}`,
      pdf.margin,
      y,
      { size: 7, color: MUTED },
    );
    pdf.text(`${i + 1} / ${pdf.pageCount}`, pdf.width - pdf.margin, y, {
      size: 7,
      color: MUTED,
      align: "right",
    });
  }
}

export function buildTradesPdf({ trades, filters }: TradesReport): Pdf {
  const generatedAt = new Date();
  const pdf = new Pdf({ title: "İşlem Defteri", orientation: "landscape", margin: 36 });
  const sum = summarize(trades);

  pdf.text("İşlem Defteri", pdf.margin, pdf.margin + 12, { font: "sansBold", size: 17, color: INK });
  pdf.text(
    `${trades.length} kayıt · ${format(generatedAt, "d MMMM yyyy HH:mm", { locale: tr })}`,
    pdf.width - pdf.margin,
    pdf.margin + 12,
    { size: 8.5, color: MUTED, align: "right" },
  );

  let y = pdf.margin + 26;
  if (filters.length) {
    pdf.text(filters.join("   ·   "), pdf.margin, y + 8, {
      size: 8,
      color: MUTED,
      maxWidth: pdf.width - pdf.margin * 2,
    });
    y += 16;
  }

  y = drawSummary(pdf, y + 4, sum);
  y = drawTableHead(pdf, y);

  const bottomLimit = pdf.height - 42;

  if (!trades.length) {
    pdf.text("Bu filtrelere uyan işlem yok.", pdf.margin, y + 24, { size: 9, color: MUTED });
    drawFooters(pdf, generatedAt);
    return pdf;
  }

  trades.forEach((trade, index) => {
    if (y + ROW_HEIGHT > bottomLimit) {
      pdf.addPage();
      y = drawTableHead(pdf, pdf.margin);
    }

    if (index % 2 === 1) {
      pdf.rect(pdf.margin, y, pdf.width - pdf.margin * 2, ROW_HEIGHT, { color: ZEBRA });
    }

    let x = pdf.margin;
    for (const col of COLUMNS) {
      pdf.text(col.value(trade), col.align === "right" ? x + col.width - 4 : x + 2, y + 10.5, {
        font: col.font ?? "sans",
        size: SIZE,
        color: col.color ? col.color(trade) : INK,
        align: col.align,
        maxWidth: col.width - 6,
      });
      x += col.width;
    }

    y += ROW_HEIGHT;
  });

  // Toplam satırı — para birimi karışıksa K/Z tek sayıya inmez.
  if (y + ROW_HEIGHT + 6 > bottomLimit) {
    pdf.addPage();
    y = drawTableHead(pdf, pdf.margin);
  }
  pdf.line(pdf.margin, y, pdf.width - pdf.margin, y, { color: RULE, width: 0.8 });

  const totalX = COLUMNS.slice(0, 7).reduce((acc, c) => acc + c.width, pdf.margin);
  const rX = totalX + COLUMNS[7].width + COLUMNS[8].width;
  const pnlX = rX + COLUMNS[9].width;

  pdf.text("Toplam", pdf.margin + 2, y + 13, { font: "sansBold", size: SIZE, color: INK });
  pdf.text(rMultiple(sum.totalR), rX - 4, y + 13, {
    font: "mono",
    size: SIZE,
    color: tone(sum.totalR),
    align: "right",
  });
  pdf.text(
    sum.nets.length > 1 ? "karma" : netLabel(sum.nets),
    pnlX - 4,
    y + 13,
    {
      font: "mono",
      size: SIZE,
      color: sum.nets.length === 1 ? tone(sum.nets[0].net) : MUTED,
      align: "right",
      maxWidth: COLUMNS[9].width - 6,
    },
  );

  if (sum.nets.length > 1) {
    pdf.text(`Net K/Z: ${netLabel(sum.nets)}`, pdf.margin, y + 30, { size: 7.5, color: MUTED });
  }

  drawFooters(pdf, generatedAt);
  return pdf;
}

/** trading-journal-islemler-2026-09-10.pdf */
export function tradesPdfFilename(date = new Date()): string {
  return `trading-journal-islemler-${format(date, "yyyy-MM-dd")}.pdf`;
}
