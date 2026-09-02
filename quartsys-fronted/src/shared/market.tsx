import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

export type MarketCode = "CN" | "HK" | "US";

export type MarketDefinition = {
  code: MarketCode;
  labelZh: string;
  labelEn: string;
  shortLabel: string;
  timeZone: string;
  currency: "CNY" | "HKD" | "USD";
  currencySymbol: string;
  marketCapUnitZh: string;
  marketCapUnitEn: string;
  turnoverLabelZh: string;
  turnoverLabelEn: string;
  defaultSymbol: string;
  primaryIndexCodes: string[];
};

export const MARKET_ORDER: MarketCode[] = ["CN", "HK", "US"];

export const MARKET_DEFINITIONS: Record<MarketCode, MarketDefinition> = {
  CN: {
    code: "CN",
    labelZh: "A股",
    labelEn: "A-Shares",
    shortLabel: "CN",
    timeZone: "Asia/Shanghai",
    currency: "CNY",
    currencySymbol: "¥",
    marketCapUnitZh: "亿元",
    marketCapUnitEn: "CNY 100M",
    turnoverLabelZh: "沪深两市成交额",
    turnoverLabelEn: "Shanghai / Shenzhen Turnover",
    defaultSymbol: "000001",
    primaryIndexCodes: [
      "sh000001",
      "sz399001",
      "sz399006",
      "bj899050",
      "sh000688",
    ],
  },
  HK: {
    code: "HK",
    labelZh: "港股",
    labelEn: "Hong Kong",
    shortLabel: "HK",
    timeZone: "Asia/Hong_Kong",
    currency: "HKD",
    currencySymbol: "HK$",
    marketCapUnitZh: "亿港元",
    marketCapUnitEn: "HKD 100M",
    turnoverLabelZh: "港股市场成交额",
    turnoverLabelEn: "Hong Kong Market Turnover",
    defaultSymbol: "hk00700",
    primaryIndexCodes: ["hkHSI", "hkHSCEI", "hkHSTECH", "hkHSCCI"],
  },
  US: {
    code: "US",
    labelZh: "美股",
    labelEn: "United States",
    shortLabel: "US",
    timeZone: "America/New_York",
    currency: "USD",
    currencySymbol: "$",
    marketCapUnitZh: "亿美元",
    marketCapUnitEn: "USD 100M",
    turnoverLabelZh: "美股市场成交额",
    turnoverLabelEn: "U.S. Market Turnover",
    defaultSymbol: "usAAPL",
    primaryIndexCodes: ["usINX", "usIXIC", "usDJI", "usNDX"],
  },
};

const MARKET_STORAGE_KEY = "quartsys_market";
const PREFS_STORAGE_KEY = "quartsys_prefs";
export const MARKET_CHANGE_EVENT = "quartsys:market-changed";

type MarketContextValue = {
  market: MarketCode;
  definition: MarketDefinition;
  setMarket: (market: MarketCode) => void;
};

const MarketContext = createContext<MarketContextValue | null>(null);

declare global {
  interface Window {
    __QUARTSYS_INITIAL_MARKET__?: MarketCode;
  }
}

export function normalizeMarket(value: unknown): MarketCode {
  const text = String(value || "").trim().toUpperCase();
  if (text === "HK" || text === "港股" || text === "HONG KONG") return "HK";
  if (text === "US" || text === "美股" || text === "UNITED STATES") return "US";
  return "CN";
}

function readStoredMarket(): MarketCode {
  if (window.__QUARTSYS_INITIAL_MARKET__) {
    return normalizeMarket(window.__QUARTSYS_INITIAL_MARKET__);
  }
  try {
    const direct = localStorage.getItem(MARKET_STORAGE_KEY);
    if (direct) return normalizeMarket(direct);
    const prefs = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) || "{}");
    return normalizeMarket(prefs?.defaultMarket);
  } catch {
    return "CN";
  }
}

function persistMarket(market: MarketCode) {
  try {
    localStorage.setItem(MARKET_STORAGE_KEY, market);
    const prefs = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) || "{}");
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({
        ...prefs,
        defaultMarket: MARKET_DEFINITIONS[market].labelZh,
      }),
    );
  } catch {
    // The active in-memory selection still works when storage is unavailable.
  }
  document.documentElement.setAttribute("data-market", market.toLowerCase());
}

export function detectMarketFromCode(value: unknown): MarketCode {
  const code = String(value || "").trim().toUpperCase();
  if (code.startsWith("HK") || code.endsWith(".HK")) return "HK";
  if (code.startsWith("US") || code.endsWith(".US") || /^[A-Z.]{1,10}$/.test(code)) {
    return "US";
  }
  return "CN";
}

export function isCodeInMarket(value: unknown, market: MarketCode) {
  return detectMarketFromCode(value) === market;
}

export function normalizeSecurityInput(value: string, market: MarketCode) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (market === "HK") {
    const digits = raw.replace(/\D/g, "");
    return digits ? `hk${digits.slice(-5).padStart(5, "0")}` : raw;
  }
  if (market === "US") {
    return `us${raw.replace(/^(us\.?)/i, "").replace(/\.us$/i, "").toUpperCase()}`;
  }
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.slice(-6).padStart(6, "0") : raw;
}

function timeParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "0";
  return {
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
  };
}

export function isMarketTradingSession(market: MarketCode, now = new Date()) {
  const definition = MARKET_DEFINITIONS[market];
  const parts = timeParts(now, definition.timeZone);
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const minutes = parts.hour * 60 + parts.minute;
  if (market === "CN") {
    return (
      (minutes >= 9 * 60 + 30 && minutes < 11 * 60 + 30) ||
      (minutes >= 13 * 60 && minutes < 15 * 60)
    );
  }
  if (market === "HK") {
    return (
      (minutes >= 9 * 60 + 30 && minutes < 12 * 60) ||
      (minutes >= 13 * 60 && minutes < 16 * 60)
    );
  }
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

export function formatMarketTime(market: MarketCode, now = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: MARKET_DEFINITIONS[market].timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
}

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [market, setMarketState] = useState<MarketCode>(readStoredMarket);

  useLayoutEffect(() => {
    persistMarket(market);
  }, [market]);

  const value = useMemo<MarketContextValue>(
    () => ({
      market,
      definition: MARKET_DEFINITIONS[market],
      setMarket: (nextMarket) => {
        const normalized = normalizeMarket(nextMarket);
        persistMarket(normalized);
        setMarketState(normalized);
        window.dispatchEvent(
          new CustomEvent(MARKET_CHANGE_EVENT, { detail: normalized }),
        );
      },
    }),
    [market],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) throw new Error("useMarket must be used within MarketProvider");
  return context;
}
