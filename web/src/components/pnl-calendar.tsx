"use client";

import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { tr } from "date-fns/locale";

import { money, moneyCompact, rMultiple } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Trade } from "@/lib/types";

export type CalendarUnit = "money" | "r";

/** Bir günün defter özeti. Tutarlar yalnız kapanmış işlemlerden gelir. */
export interface DayStat {
  key: string;
  netPnl: number;
  netR: number;
  closedCount: number;
  openCount: number;
  winCount: number;
  trades: Trade[];
}

/** Yerel takvim günü anahtarı: 2026-09-06 */
export function dayKey(value: string | Date) {
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "yyyy-MM-dd");
}

/**
 * İşlemleri açılış gününe göre toplar. Gün sınırı tarayıcının yerel saatine
 * göredir; sayfa da veriyi aynı sınırlarla çeker.
 */
export function groupByDay(trades: Trade[]) {
  const map = new Map<string, DayStat>();

  for (const t of trades) {
    const key = dayKey(t.opened_at);
    let day = map.get(key);
    if (!day) {
      day = { key, netPnl: 0, netR: 0, closedCount: 0, openCount: 0, winCount: 0, trades: [] };
      map.set(key, day);
    }
    day.trades.push(t);
    if (t.status === "closed") {
      day.closedCount += 1;
      day.netPnl += t.pnl ?? 0;
      day.netR += t.r_multiple ?? 0;
      if ((t.pnl ?? 0) > 0) day.winCount += 1;
    } else {
      day.openCount += 1;
    }
  }

  return map;
}

const EMPTY: DayStat = {
  key: "",
  netPnl: 0,
  netR: 0,
  closedCount: 0,
  openCount: 0,
  winCount: 0,
  trades: [],
};

/** Hücre değeri: büyük tutarlar kısaltılır, yoksa sığmaz. */
function cellValue(day: DayStat, unit: CalendarUnit, currency: string) {
  if (unit === "r") return rMultiple(day.netR);
  const v = day.netPnl;
  if (Math.abs(v) >= 10_000) return `${v > 0 ? "+" : ""}${moneyCompact(v, currency)}`;
  return money(v, currency, { signed: true });
}

/** Toplam etiketi — hafta ve ay şeritlerinde aynı biçim. */
function totalLabel(value: number, unit: CalendarUnit, currency: string) {
  if (unit === "r") return rMultiple(value);
  return `${value > 0 ? "+" : ""}${moneyCompact(value, currency)}`;
}

/** Sonucun büyüklüğünü zemin tonuna çevirir. Renk yalnız kâr/zararı kodlar. */
function tint(value: number, peak: number) {
  if (!value || !peak) return undefined;
  const pct = 7 + 18 * Math.min(1, Math.abs(value) / peak);
  const base = value > 0 ? "var(--long)" : "var(--short)";
  return `color-mix(in oklab, ${base} ${pct.toFixed(1)}%, transparent)`;
}

function toneClass(value: number) {
  if (value > 0) return "text-long";
  if (value < 0) return "text-short";
  return "text-muted-foreground";
}

const GRID = "grid grid-cols-7 sm:grid-cols-[repeat(7,minmax(0,1fr))_5rem]";

/**
 * Aylık kâr/zarar takvimi: her gün tek hücre, zemin tonu sonucun büyüklüğü,
 * sağdaki dar sütun o haftanın toplamı. Kutu yok — ızgara kılcal çizgilerle.
 */
export function PnlCalendar({
  month,
  days,
  unit,
  currency,
  selected,
  onSelect,
  className,
}: {
  month: Date;
  days: Map<string, DayStat>;
  unit: CalendarUnit;
  currency: string;
  selected: string | null;
  onSelect: (key: string | null) => void;
  className?: string;
}) {
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const cells = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const valueOf = (d: DayStat) => (unit === "r" ? d.netR : d.netPnl);

  // Ton ölçeği yalnız görünen ayın günlerinden kurulur.
  const peak = Math.max(
    0,
    ...cells
      .filter((d) => isSameMonth(d, month))
      .map((d) => Math.abs(valueOf(days.get(dayKey(d)) ?? EMPTY))),
  );

  const weeks: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className={cn("border border-border", className)}>
      <div className={cn(GRID, "border-b border-border text-xs text-muted-foreground")}>
        {weeks[0].map((d) => (
          <div key={d.toISOString()} className="px-2 py-1.5">
            {format(d, "EEEEEE", { locale: tr })}
          </div>
        ))}
        <div className="hidden px-2 py-1.5 text-right sm:block">Hafta</div>
      </div>

      <div className={cn(GRID, "gap-px bg-border")}>
        {weeks.map((week) => (
          <WeekRow
            key={week[0].toISOString()}
            week={week}
            month={month}
            days={days}
            unit={unit}
            currency={currency}
            peak={peak}
            selected={selected}
            onSelect={onSelect}
            total={week
              .filter((d) => isSameMonth(d, month))
              .reduce((sum, d) => sum + valueOf(days.get(dayKey(d)) ?? EMPTY), 0)}
          />
        ))}
      </div>
    </div>
  );
}

function WeekRow({
  week,
  month,
  days,
  unit,
  currency,
  peak,
  selected,
  onSelect,
  total,
}: {
  week: Date[];
  month: Date;
  days: Map<string, DayStat>;
  unit: CalendarUnit;
  currency: string;
  peak: number;
  selected: string | null;
  onSelect: (key: string | null) => void;
  total: number;
}) {
  return (
    <>
      {week.map((date) => {
        const key = dayKey(date);
        const outside = !isSameMonth(date, month);
        const day = days.get(key);

        if (outside || !day) {
          return (
            <div
              key={key}
              className={cn(
                "min-h-16 bg-background px-1.5 py-1.5 sm:min-h-20 sm:px-2",
                outside && "opacity-40",
              )}
            >
              <DayNumber date={date} />
            </div>
          );
        }

        const value = unit === "r" ? day.netR : day.netPnl;
        const active = selected === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(active ? null : key)}
            aria-pressed={active}
            aria-label={`${format(date, "d MMMM", { locale: tr })}, ${day.closedCount} kapalı işlem, ${
              unit === "r" ? rMultiple(day.netR) : money(day.netPnl, currency, { signed: true })
            }`}
            style={{ backgroundColor: tint(value, peak) }}
            className={cn(
              "relative min-h-16 bg-background px-1.5 py-1.5 text-left transition-shadow sm:min-h-20 sm:px-2",
              "hover:z-10 hover:ring-1 hover:ring-inset hover:ring-rule-strong",
              "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "z-10 ring-2 ring-inset ring-foreground/60",
            )}
          >
            <DayNumber date={date} />

            {day.closedCount > 0 ? (
              <>
                <div
                  className={cn(
                    "num mt-1.5 truncate text-[11px] font-medium sm:text-sm",
                    toneClass(value),
                  )}
                >
                  {cellValue(day, unit, currency)}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {day.closedCount} işlem
                  {unit === "money" && day.netR !== 0 && (
                    <span className="num"> · {rMultiple(day.netR)}</span>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-1.5 truncate text-[10px] text-muted-foreground">
                {day.openCount} açık
              </div>
            )}
          </button>
        );
      })}

      <div className="hidden min-h-16 flex-col items-end justify-center bg-background px-2 py-1.5 sm:flex sm:min-h-20">
        <span className={cn("num truncate text-xs", toneClass(total))}>
          {total === 0 ? "—" : totalLabel(total, unit, currency)}
        </span>
      </div>
    </>
  );
}

function DayNumber({ date }: { date: Date }) {
  return (
    <span
      className={cn(
        "num inline-flex h-5 min-w-5 items-center justify-center text-xs",
        isToday(date)
          ? "rounded-full bg-foreground px-1 font-medium text-background"
          : "text-muted-foreground",
      )}
    >
      {format(date, "d")}
    </span>
  );
}
