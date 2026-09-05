// Go API'sinin döndüğü gövdelerin birebir karşılığı.

export type AssetClass =
  | "forex"
  | "crypto"
  | "stock"
  | "futures"
  | "commodity"
  | "index"
  | "option";

export type Direction = "long" | "short";

export type QuantityUnit = "lot" | "contract" | "share" | "coin" | "unit";

export type TradeStatus = "open" | "closed";

export type Phase = "entry" | "exit" | "analysis";

export interface Fund {
  id: string;
  name: string;
  broker: string | null;
  currency: string;
  starting_balance: number;
  is_prop: boolean;
  is_active: boolean;
  note: string | null;
  created_at: string;
}

export interface FundInput {
  name: string;
  broker: string | null;
  currency: string;
  starting_balance: number;
  is_prop: boolean;
  is_active: boolean;
  note: string | null;
}

export interface Platform {
  id: string;
  name: string;
  created_at: string;
}

export interface Trade {
  id: string;
  fund_id: string | null;
  platform_id: string | null;

  symbol: string;
  asset_class: AssetClass;
  direction: Direction;
  currency: string;

  opened_at: string;
  closed_at: string | null;
  timeframe: string | null;

  // Asıl sonuç kaynağı
  pnl_override: number | null;
  risk_manual: number | null;
  r_manual: number | null;

  // İsteğe bağlı fiyat/boyut alanları
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  quantity: number | null;
  quantity_unit: QuantityUnit | null;
  contract_size: number | null;
  leverage: number | null;
  fees: number;
  swap: number;

  setup: string | null;
  reason: string | null;
  confluences: string[];
  tags: string[];

  emotion_before: string | null;
  emotion_after: string | null;
  confidence: number | null;
  stress: number | null;
  followed_plan: boolean | null;
  mistakes: string[];
  lesson: string | null;
  notes: string | null;

  status: TradeStatus;
  pnl: number | null;
  risk_amount: number | null;
  r_multiple: number | null;

  fund_name: string | null;
  fund_currency: string | null;
  platform_name: string | null;

  created_at: string;
  updated_at: string;
}

export type TradeInput = Omit<
  Trade,
  | "id"
  | "status"
  | "pnl"
  | "risk_amount"
  | "r_multiple"
  | "fund_name"
  | "fund_currency"
  | "platform_name"
  | "created_at"
  | "updated_at"
>;

export interface TradeList {
  items: Trade[];
  total: number;
  limit: number;
  offset: number;
}

export interface Screenshot {
  id: string;
  trade_id: string;
  path: string;
  caption: string | null;
  phase: Phase;
  created_at: string;
}

export interface Summary {
  currency: string;
  trade_count: number;
  closed_count: number;
  open_count: number;
  win_count: number;
  loss_count: number;
  breakeven_count: number;
  net_pnl: number;
  gross_profit: number;
  gross_loss: number;
  win_rate: number | null;
  profit_factor: number | null;
  expectancy: number | null;
  avg_win: number | null;
  avg_loss: number | null;
  largest_win: number | null;
  largest_loss: number | null;
  avg_r: number | null;
  total_r: number;
  max_drawdown: number;
  max_drawdown_r: number;
  total_fees: number;
  avg_hold_minutes: number | null;
}

export interface SeriesPoint {
  bucket: string;
  net_pnl: number;
  profit: number;
  loss: number;
  trade_count: number;
  win_count: number;
  cumulative: number;
  net_r: number;
  cumulative_r: number;
}

export interface BreakdownRow {
  key: string;
  trade_count: number;
  win_count: number;
  net_pnl: number;
  win_rate: number | null;
  avg_r: number | null;
  total_r: number;
}

export type Bucket = "day" | "week" | "month" | "quarter" | "halfyear" | "year";

export type BreakdownDim =
  | "setup"
  | "symbol"
  | "asset_class"
  | "direction"
  | "timeframe"
  | "fund"
  | "emotion_before"
  | "emotion_after"
  | "followed_plan"
  | "confidence"
  | "stress"
  | "weekday"
  | "hour"
  | "confluence"
  | "mistake"
  | "tag";

export interface TradeQuery {
  from?: string;
  to?: string;
  fund_id?: string;
  platform_id?: string;
  status?: TradeStatus;
  symbol?: string;
  asset_class?: AssetClass;
  direction?: Direction;
  setup?: string;
  currency?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface DistinctValues {
  symbol: string[];
  setup: string[];
  tag: string[];
  confluence: string[];
}
