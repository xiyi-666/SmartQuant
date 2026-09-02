// ============================================
// QuartSys Frontend Type Definitions
// ============================================

// ---- Auth Types ----
export interface User {
  id: number;
  username: string;
  email?: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

// ---- Market Data Types ----
export interface MarketIndex {
  code: string;
  name: string;
  symbol?: string;
  close: number;
  change_pct: number;
  open?: number;
  high?: number;
  low?: number;
}

export interface TopGainerIndustry {
  industry: string;
  avg_change: number;
  stocks: {
    code: string;
    name: string;
    change_pct: number;
  }[];
}

export interface MarketNews {
  title: string;
  time: string;
  source: string;
}

export interface MarketTemperature {
  calc_time?: string;
  data_date?: string;
  source?: string;
  rise_count: number;
  fall_count: number;
  flat_count?: number;
  total_count?: number;
  avg_change: number;
  avg_rise: number;
  avg_fall: number;
  market_volume?: number | null;
  market_volume_prev?: number | null;
  market_volume_change?: number | null;
  market_volume_change_pct?: number | null;
  market_volume_direction?: "up" | "down" | "flat" | "unknown" | string;
  market_volume_source?: string | null;
  market_volume_date?: string | null;
  market_volume_prev_date?: string | null;
  market_amount?: number | null;
  market_amount_prev?: number | null;
  market_amount_change?: number | null;
  market_amount_change_pct?: number | null;
  market_amount_direction?: "up" | "down" | "flat" | "unknown" | string;
  market_amount_source?: string | null;
  market_amount_date?: string | null;
  market_amount_prev_date?: string | null;
  heatmap_data: Record<string, any>;
}

// ---- Simulation Trading Types ----
export interface SimulationPosition {
  stock_code: string;
  stock_name: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  market_value: number;
}

export interface SimulationAccount {
  id?: number;
  balance: number;
  frozen_balance: number;
  total_assets: number;
  positions: SimulationPosition[];
}

export interface TradeRecord {
  id: number;
  stock_code: string;
  stock_name: string;
  trade_type: "buy" | "sell";
  price: number;
  quantity: number;
  amount: number;
  fee: number;
  trade_time: string;
}

export interface TradePayload {
  stock_code: string;
  trade_type: string;
  quantity: number;
  price?: number;
}

// ---- Watchlist Types ----
export interface WatchlistItem {
  id?: number;
  group_name: string;
  code: string;
  name: string;
  added_at?: string;
  color?: string;
}

export interface WatchlistGroup {
  name: string;
  stocks: WatchlistItem[];
  color?: string;
}

// ---- Screener Types ----
export interface FactorPreset {
  id: number;
  name: string;
  config: any[];
  updated_at?: string;
}

export interface ScreenerRow {
  code: string;
  name: string;
  price: number;
  ma60?: number;
  pe_ratio?: number;
  pb_ratio?: number;
  roe?: number;
  volume?: number;
  change_pct?: number;
}

export interface ScreenerQueryPayload {
  keyword?: string;
  factors: any[];
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  date?: string;
}

// ---- AI Insights Types ----
export interface AiDimension {
  趋势?: number;
  动量?: number;
  估值?: number;
  情绪?: number;
  风险?: number;
  [key: string]: number | undefined;
}

export interface AiInsightResult {
  task_id: number;
  status: string;
  dimensions: AiDimension;
  summary: string;
  analysis_list: Array<{
    dimension: string;
    score: number;
    summary?: string;
    text?: string;
  }>;
}

export interface AlphaRecommendation {
  id: number;
  strategy_name: string;
  stock_code: string;
  stock_name: string;
  stars: number;
  ai_logic?: string;
  buy_price?: number;
  stop_loss?: number;
  target_price?: number;
  created_at?: string;
}

export interface PositionAdvice {
  position_ratio: number;
  attack: string[];
  defense: string[];
  neutral: string;
  attack_reason?: string;
  defense_reason?: string;
  status?: string;
}

// ---- Strategy Types ----
export interface SavedStrategy {
  id: number;
  name: string;
  updated_at?: string;
  code?: string;
}

export interface StrategyGeneratePayload {
  prompt: string;
  buy_condition: string;
  profit_target: number;
  stop_loss: number;
  holding_period: number;
}

// ---- Agent Types ----
export interface Agent {
  id: number;
  name: string;
  status: "running" | "stopped" | "paused";
  agent_type?: string;
  strategy_config?: string;
  total_return?: number;
  created_at?: string;
}

export interface AgentPerformance {
  date: string;
  total_assets: number;
  daily_return: number;
}

// ---- Risk Types ----
export interface RiskTrendPoint {
  date: string;
  value: number;
}

export interface RiskEvent {
  time: string;
  title: string;
  desc: string;
  level: "info" | "warning" | "error";
  tags: string[];
}

export interface RiskFundFlow {
  nodes: Array<{ name: string }>;
  links: Array<{ source: string; target: string; value: number }>;
}

// ---- Stock Types ----
export interface StockQuote {
  code: string;
  asset_type?: string;
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export interface StockSearchResult {
  code: string;
  name: string;
  asset_type?: string;
}

// ---- LLM Config Types ----
export interface LLMConfig {
  provider: string;
  model: string;
  api_key?: string;
  base_url?: string;
}

// ---- Notification Types ----
export interface Notification {
  id: number;
  title: string;
  content: string;
  read: boolean;
  created_at?: string;
}

// ---- User Profile Types ----
export interface UserProfile {
  username: string;
  email?: string;
  avatar_url?: string;
}

export interface ProfileUpdatePayload {
  username?: string;
  email?: string;
  avatar_url?: string;
  old_password?: string;
  new_password?: string;
}

// ---- Generic API Response ----
export interface ApiResponse<T = any> {
  data: T;
  status: string;
  message?: string;
}
