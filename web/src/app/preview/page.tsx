// GEÇİCİ — tasarım denetimi için sahte veriyle render. İnceleme bitince silinir.
import { Metric, MetricRow, toneOf } from "@/components/metric";
import { RTape } from "@/components/charts/r-tape";
import { TradesTable } from "@/components/trades-table";
import { money, percent, rMultiple, ratio } from "@/lib/format";
import type { Trade } from "@/lib/types";

const SYMBOLS = ["EURUSD", "BTCUSDT", "XAUUSD", "NAS100", "GBPJPY", "THYAO", "ETHUSDT"];
const SETUPS = ["Kırılım", "Geri çekilme", "Seans açılışı", "Ortalamaya dönüş", "Trend takibi"];
const FUNDS = ["BEM Funding", "Funding Pips", "Breakout", "OKX"];

function mockTrades(n: number): Trade[] {
  // Deterministik sözde-rastgele: her derlemede aynı görüntü.
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  return Array.from({ length: n }, (_, i) => {
    const r = Math.round((rnd() * 5 - 1.6) * 10) / 10;
    const risk = 100;
    const base = new Date(2026, 5, 1);
    base.setHours(base.getHours() + i * 9);

    return {
      id: `t${i}`,
      fund_id: null,
      platform_id: null,
      symbol: SYMBOLS[i % SYMBOLS.length],
      asset_class: i % 3 === 0 ? "crypto" : "forex",
      direction: rnd() > 0.45 ? "long" : "short",
      currency: "USD",
      opened_at: base.toISOString(),
      closed_at: null,
      timeframe: "4H",
      pnl_override: r * risk,
      risk_manual: risk,
      r_manual: r,
      entry_price: null,
      exit_price: null,
      stop_loss: null,
      take_profit: null,
      quantity: null,
      quantity_unit: null,
      contract_size: null,
      leverage: null,
      fees: 0,
      swap: 0,
      setup: SETUPS[i % SETUPS.length],
      reason: null,
      confluences: [],
      tags: [],
      emotion_before: null,
      emotion_after: null,
      confidence: null,
      stress: null,
      followed_plan: null,
      mistakes: [],
      lesson: null,
      notes: null,
      status: "closed",
      pnl: r * risk,
      risk_amount: risk,
      r_multiple: r,
      fund_name: FUNDS[i % FUNDS.length],
      fund_currency: "USD",
      platform_name: null,
      created_at: base.toISOString(),
      updated_at: base.toISOString(),
    } satisfies Trade;
  });
}

export default function PreviewPage() {
  const trades = mockTrades(84);
  const totalR = trades.reduce((s, t) => s + (t.r_multiple ?? 0), 0);
  const netPnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const wins = trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses = trades.length - wins;

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium">Panel</h1>
        <span className="text-xs text-muted-foreground">tasarım önizlemesi — sahte veri</span>
      </header>

      <section className="border-y border-border">
        <div className="grid gap-6 px-4 py-6 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-center">
          <Metric
            size="hero"
            value={rMultiple(totalR)}
            label="toplam R"
            tone={toneOf(totalR)}
            sub={`işlem başına ${ratio(totalR / trades.length)}R`}
          />
          <RTape trades={trades} />
        </div>

        <MetricRow className="border-t border-border sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            size="sm"
            value={money(netPnl, "USD", { signed: true })}
            label="net kâr / zarar"
            tone={toneOf(netPnl)}
          />
          <Metric
            size="sm"
            value={percent(wins / trades.length)}
            label="kazanma oranı"
            sub={`${wins} kazanç, ${losses} kayıp`}
          />
          <Metric size="sm" value={ratio(2.14)} label="profit factor" sub="beklenti +$84,00" />
          <Metric
            size="sm"
            value={rMultiple(-4.2)}
            label="en derin geri çekilme"
            tone="short"
            sub={money(420, "USD")}
          />
        </MetricRow>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">Defter</h2>
        <TradesTable trades={trades.slice(0, 10)} />
      </section>
    </main>
  );
}
