# -*- coding: utf-8 -*-
"""Market data providers with akshare-free quote/K-line/fundamental paths."""

from __future__ import annotations

import re
import json
import html
import time
import math
from datetime import date
from typing import Iterable

import pandas as pd
import requests

TENCENT_QUOTE_URL = "https://qt.gtimg.cn/q={symbols}"
TENCENT_KLINE_URL = "https://web.ifzq.gtimg.cn/appstock/app/kline/kline"
TENCENT_MINUTE_URL = "https://web.ifzq.gtimg.cn/appstock/app/minute/query"
EASTMONEY_STOCK_PROFILE_URLS = (
    "https://push2delay.eastmoney.com/api/qt/stock/get",
    "https://push2.eastmoney.com/api/qt/stock/get",
)
EASTMONEY_STOCK_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
SINA_US_MINUTE_URL = (
    "https://stock.finance.sina.com.cn/usstock/api/jsonp.php/"
    "var%20_quartsys_us_min=/US_MinKService.getMinK"
)
SINA_US_DAILY_URL = (
    "https://stock.finance.sina.com.cn/usstock/api/jsonp.php/"
    "var%20_quartsys_us_daily=/US_MinKService.getDailyK"
)
REQUEST_TIMEOUT = 8
A_SHARE_PREFIXES = (
    "000",
    "001",
    "002",
    "003",
    "300",
    "301",
    "600",
    "601",
    "603",
    "605",
    "688",
    "689",
    "430",
    "830",
    "831",
    "832",
    "833",
    "834",
    "835",
    "836",
    "837",
    "838",
    "839",
    "870",
    "871",
    "872",
    "873",
    "920",
)

# Exchange-traded mainland instruments. Keep this distinct from A-share stocks:
# market breadth, stock screeners and stock-only fundamentals must not include ETFs.
CN_ETF_PREFIXES = ("159", "510", "511", "512", "513", "515", "516", "517", "518", "519", "560", "561", "562", "563", "588", "589")
CN_FUND_PREFIXES = ("160", "161", "162", "163", "164", "165", "166", "167", "168", "169", "184", "501", "502", "503", "504", "505", "506", "507")
CN_REIT_PREFIXES = ("508",)
CN_CONVERTIBLE_BOND_PREFIXES = ("110", "111", "113", "118", "123", "125", "126", "127", "128")
CN_BOND_PREFIXES = ("010", "019", "020", "021", "022", "023", "024", "030", "031", "040", "050", "090")
CN_DERIVATIVE_PREFIXES = ("100", "101", "102", "103", "104", "105", "106", "107", "108", "109")
ASSET_TYPES = {
    "stock",
    "etf",
    "fund",
    "reit",
    "trust",
    "bond",
    "convertible_bond",
    "derivative",
}
ASSET_TYPE_ALIASES = {
    "stock": "stock", "股票": "stock", "equity": "stock",
    "etf": "etf", "基金etf": "etf", "交易型开放式指数基金": "etf",
    "fund": "fund", "基金": "fund", "mutual_fund": "fund", "open_fund": "fund",
    "reit": "reit", "reits": "reit", "公募reits": "reit",
    "trust": "trust", "信托": "trust",
    "bond": "bond", "债券": "bond",
    "convertible_bond": "convertible_bond", "convertible bond": "convertible_bond", "可转债": "convertible_bond", "转债": "convertible_bond",
    "derivative": "derivative", "衍生品": "derivative", "option": "derivative", "期权": "derivative",
}


def safe_float(value) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).replace(",", "").replace("%", "").strip()
    if not text or text.lower() in {"nan", "none", "--"}:
        return None
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def sanitize_text(value) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    return text if text and text.lower() not in {"nan", "none"} else None


def normalize_stock_code(value) -> str:
    text = str(value or "").strip()
    upper = text.upper()
    compact = re.sub(r"[\s_\-]", "", text)
    custom = re.fullmatch(r"(?i)(fund|trust)[:.]?([A-Za-z0-9._-]{1,32})", text)
    if custom:
        return f"{custom.group(1).lower()}:{custom.group(2).upper()}"
    if re.fullmatch(r"(?i)hk\.?\d{1,5}", compact):
        digits = "".join(ch for ch in compact if ch.isdigit())
        return f"hk{digits.zfill(5)}"
    if re.fullmatch(r"(?i)\d{1,5}\.HK", upper):
        digits = "".join(ch for ch in upper if ch.isdigit())
        return f"hk{digits.zfill(5)}"
    if re.fullmatch(r"(?i)us\.?[A-Z.]{1,10}", compact):
        symbol = re.sub(r"(?i)^us\.?", "", compact).upper()
        if symbol.endswith(".US"):
            symbol = symbol[:-3]
        return f"us{symbol}"
    if upper.endswith(".US") and re.fullmatch(r"[A-Z.]{1,10}", upper[:-3] or ""):
        return f"us{upper[:-3]}"
    if re.fullmatch(r"[A-Z.]{1,10}", upper):
        return f"us{upper}"
    digits = "".join(ch for ch in text if ch.isdigit())
    if digits and len(digits) <= 6:
        return digits.zfill(6)
    return text


def is_a_share_code(code: str) -> bool:
    code = normalize_stock_code(code)
    return bool(re.fullmatch(r"\d{6}", code or "")) and code.startswith(
        A_SHARE_PREFIXES
    )


def is_cn_listed_security_code(code: str) -> bool:
    """Whether a code is a mainland exchange-traded instrument, not just stock."""
    normalized = normalize_stock_code(code)
    return bool(re.fullmatch(r"\d{6}", normalized or "")) and normalized.startswith(
        A_SHARE_PREFIXES
        + CN_ETF_PREFIXES
        + CN_FUND_PREFIXES
        + CN_REIT_PREFIXES
        + CN_CONVERTIBLE_BOND_PREFIXES
        + CN_BOND_PREFIXES
        + CN_DERIVATIVE_PREFIXES
    )


def normalize_asset_type(value: object, default: str = "stock") -> str:
    normalized = ASSET_TYPE_ALIASES.get(str(value or "").strip().lower())
    return normalized if normalized in ASSET_TYPES else default


def infer_asset_type(
    code: object,
    name: object = None,
    board: object = None,
    explicit: object = None,
) -> str:
    """Infer a stable instrument class while preserving a non-stock imported type."""
    explicit_type = normalize_asset_type(explicit, default="")
    # Legacy imports stored every mainland instrument as ``stock``. Keep a
    # meaningful explicit classification, but let known code/name rules repair
    # that generic legacy value for ETFs and other instruments.
    if explicit_type and explicit_type != "stock":
        return explicit_type
    normalized = normalize_stock_code(code)
    if normalized.startswith("fund:"):
        return "fund"
    if normalized.startswith("trust:"):
        return "trust"
    label = " ".join(str(part or "") for part in (name, board)).lower()
    if normalized.startswith(CN_REIT_PREFIXES) or "reit" in label or "基础设施基金" in label:
        return "reit"
    if normalized.startswith(CN_ETF_PREFIXES) or "etf" in label:
        return "etf"
    if normalized.startswith(CN_CONVERTIBLE_BOND_PREFIXES) or "可转债" in label or "转债" in label:
        return "convertible_bond"
    if normalized.startswith(CN_BOND_PREFIXES) or "债券" in label:
        return "bond"
    if normalized.startswith(CN_DERIVATIVE_PREFIXES) or "期权" in label or "衍生" in label:
        return "derivative"
    if normalized.startswith(CN_FUND_PREFIXES) or "基金" in label:
        return "fund"
    if "信托" in label or "trust" in label:
        return "trust"
    return explicit_type or "stock"


def is_hk_stock_code(code: str) -> bool:
    return bool(re.fullmatch(r"hk\d{5}", normalize_stock_code(code) or ""))


def is_us_stock_code(code: str) -> bool:
    return bool(re.fullmatch(r"us[A-Z.]{1,10}", normalize_stock_code(code) or ""))


def is_supported_equity_code(code: str) -> bool:
    normalized = normalize_stock_code(code)
    return is_a_share_code(normalized) or is_hk_stock_code(normalized) or is_us_stock_code(normalized)


def is_supported_security_code(code: str) -> bool:
    """Accept stocks plus supported exchange and database-backed instrument codes."""
    normalized = normalize_stock_code(code)
    return (
        is_cn_listed_security_code(normalized)
        or is_hk_stock_code(normalized)
        or is_us_stock_code(normalized)
        or bool(re.fullmatch(r"(?:fund|trust):[A-Z0-9._-]{1,32}", normalized))
    )


def is_fetchable_security_code(code: str) -> bool:
    """Whether the configured public quote/K-line providers can request this code."""
    normalized = normalize_stock_code(code)
    return (
        is_cn_listed_security_code(normalized)
        or is_hk_stock_code(normalized)
        or is_us_stock_code(normalized)
    )


def normalize_market_code(value: object) -> str:
    text = str(value or "CN").strip().upper()
    aliases = {
        "A": "CN",
        "A股": "CN",
        "ASHARE": "CN",
        "A-SHARE": "CN",
        "CHINA": "CN",
        "MAINLAND": "CN",
        "港股": "HK",
        "HKEX": "HK",
        "HONG KONG": "HK",
        "HONGKONG": "HK",
        "美股": "US",
        "NYSE": "US",
        "NASDAQ": "US",
        "AMEX": "US",
        "UNITED STATES": "US",
    }
    normalized = aliases.get(text, text)
    return normalized if normalized in {"CN", "HK", "US"} else "CN"


def market_currency(market: object) -> str:
    return {"CN": "CNY", "HK": "HKD", "US": "USD"}[normalize_market_code(market)]


def market_currency_symbol(market: object) -> str:
    return {"CN": "¥", "HK": "HK$", "US": "$"}[normalize_market_code(market)]


def infer_equity_market(
    code: str = "",
    *,
    market: object = None,
    exchange: object = None,
    board: object = None,
    area: object = None,
) -> str:
    explicit = str(market or "").strip()
    if explicit:
        normalized = normalize_market_code(explicit)
        if normalized != "CN" or explicit.upper() in {
            "CN",
            "A",
            "A股",
            "ASHARE",
            "A-SHARE",
            "CHINA",
            "MAINLAND",
        }:
            return normalized
    metadata = " ".join(
        str(item or "").strip().lower() for item in (exchange, board, area)
    )
    if any(token in metadata for token in ("hkex", "hong kong", "hongkong", "港股", "香港")):
        return "HK"
    if any(
        token in metadata
        for token in ("nasdaq", "nyse", "amex", "united states", "美股", "美国")
    ):
        return "US"
    normalized_code = normalize_stock_code(code)
    if is_hk_stock_code(normalized_code):
        return "HK"
    if is_us_stock_code(normalized_code):
        return "US"
    return "CN"


def equity_market(code: str) -> str:
    return infer_equity_market(code)


def infer_exchange(code: str, market: object = None, exchange: object = None) -> str:
    explicit = str(exchange or "").strip().upper()
    if explicit:
        return explicit
    normalized_market = normalize_market_code(market or equity_market(code))
    normalized_code = normalize_stock_code(code)
    if normalized_market == "HK":
        return "HKEX"
    if normalized_market == "US":
        return "US"
    if normalized_code.startswith(("5", "6", "9")):
        return "SSE"
    if normalized_code.startswith(("0", "1", "2", "3")):
        return "SZSE"
    if normalized_code.startswith(("4", "8")):
        return "BSE"
    return "CN"


def infer_listing_board(code: str) -> str:
    code = normalize_stock_code(code)
    if is_hk_stock_code(code):
        return "港股"
    if is_us_stock_code(code):
        return "美股"
    asset_type = infer_asset_type(code)
    if asset_type == "reit":
        return "公募REITs"
    if asset_type == "etf":
        return "ETF"
    if asset_type == "fund":
        return "基金"
    if asset_type == "convertible_bond":
        return "可转债"
    if asset_type == "bond":
        return "债券"
    if asset_type == "derivative":
        return "衍生品"
    if asset_type == "trust":
        return "信托"
    if code.startswith(("688", "689")):
        return "科创板"
    if code.startswith(("300", "301")):
        return "创业板"
    if code.startswith(("430", "8", "920")):
        return "北交所"
    if code.startswith("6"):
        return "沪市主板"
    if code.startswith(("000", "001", "002", "003")):
        return "深市主板"
    return "A股"


def yfinance_symbol(code: str) -> str:
    """Convert a normalized QuartSys code to the symbol expected by yfinance."""
    normalized = normalize_stock_code(code)
    if is_hk_stock_code(normalized):
        digits = normalized[2:]
        yahoo_digits = digits.lstrip("0") or "0"
        return f"{yahoo_digits.zfill(4)}.HK"
    if is_us_stock_code(normalized):
        return normalized[2:].upper().replace(".", "-")
    if is_cn_listed_security_code(normalized):
        suffix = "SS" if normalized.startswith(("5", "6", "9")) else "SZ"
        return f"{normalized}.{suffix}"
    return normalized


_YAHOO_SECTOR_ZH = {
    "Basic Materials": "基础材料",
    "Communication Services": "通信服务",
    "Consumer Cyclical": "可选消费",
    "Consumer Defensive": "必选消费",
    "Energy": "能源",
    "Financial Services": "金融服务",
    "Healthcare": "医疗保健",
    "Industrials": "工业",
    "Real Estate": "房地产",
    "Technology": "信息技术",
    "Utilities": "公用事业",
}


def _eastmoney_profile_secids(code: str) -> list[tuple[str, str]]:
    normalized = normalize_stock_code(code)
    if is_hk_stock_code(normalized):
        return [(f"116.{normalized[2:]}", "HKEX")]
    if is_us_stock_code(normalized):
        symbol = normalized[2:].upper()
        symbols = [symbol]
        alternate = symbol.replace(".", "-")
        if alternate not in symbols:
            symbols.append(alternate)
        exchanges = (("105", "NASDAQ"), ("106", "NYSE"), ("107", "AMEX"))
        return [(f"{prefix}.{item}", exchange) for item in symbols for prefix, exchange in exchanges]
    return []


def _eastmoney_a_share_secid(code: str) -> str:
    normalized = normalize_stock_code(code)
    plain = normalized[2:] if normalized[:2] in {"SH", "SZ", "BJ"} else normalized
    if normalized.startswith("SH") or plain.startswith(("5", "6", "9")):
        return f"1.{plain}"
    return f"0.{plain}"


def fetch_eastmoney_daily_df(
    code: str,
    start_date: date,
    end_date: date,
    adjust: str = "none",
) -> pd.DataFrame:
    """Fetch daily K-lines from Eastmoney. fqt=1 qfq, fqt=2 hfq."""
    normalized = normalize_stock_code(code)
    if not is_cn_listed_security_code(normalized):
        return pd.DataFrame()
    adjust_mode = str(adjust or "none").strip().lower()
    fqt = {"qfq": "1", "hfq": "2"}.get(adjust_mode, "0")
    response = requests.get(
        EASTMONEY_STOCK_KLINE_URL,
        params={
            "secid": _eastmoney_a_share_secid(normalized),
            "fields1": "f1,f2,f3,f4,f5,f6",
            "fields2": "f51,f52,f53,f54,f55,f56,f57",
            "klt": "101",
            "fqt": fqt,
            "beg": start_date.strftime("%Y%m%d"),
            "end": end_date.strftime("%Y%m%d"),
        },
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://quote.eastmoney.com/",
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    klines = ((response.json() or {}).get("data") or {}).get("klines") or []
    data = []
    for line in klines if isinstance(klines, list) else []:
        parts = str(line or "").split(",")
        if len(parts) < 7:
            continue
        dt = pd.to_datetime(parts[0], errors="coerce")
        if pd.isna(dt):
            continue
        dt_date = dt.date()
        if dt_date < start_date or dt_date > end_date:
            continue
        data.append(
            {
                "日期": dt,
                "开盘": safe_float(parts[1]),
                "收盘": safe_float(parts[2]),
                "最高": safe_float(parts[3]),
                "最低": safe_float(parts[4]),
                "成交量": safe_float(parts[5]),
                "成交额": safe_float(parts[6]),
            }
        )
    return pd.DataFrame(data)


def fetch_akshare_a_daily_df(
    code: str,
    start_date: date,
    end_date: date,
    adjust: str = "none",
) -> pd.DataFrame:
    """Fetch A-share daily K-lines from akshare as a low-priority adjusted-data fallback."""
    normalized = normalize_stock_code(code)
    if not is_cn_listed_security_code(normalized):
        return pd.DataFrame()
    adjust_mode = str(adjust or "none").strip().lower()
    if adjust_mode not in {"none", "qfq", "hfq"}:
        adjust_mode = "none"
    import akshare as ak

    df = ak.stock_zh_a_hist(
        symbol=normalized,
        period="daily",
        start_date=start_date.strftime("%Y%m%d"),
        end_date=end_date.strftime("%Y%m%d"),
        adjust="" if adjust_mode == "none" else adjust_mode,
    )
    if df is None or df.empty:
        return pd.DataFrame()

    column_map = {
        "日期": "日期",
        "开盘": "开盘",
        "收盘": "收盘",
        "最高": "最高",
        "最低": "最低",
        "成交量": "成交量",
        "成交额": "成交额",
        "date": "日期",
        "open": "开盘",
        "close": "收盘",
        "high": "最高",
        "low": "最低",
        "volume": "成交量",
        "amount": "成交额",
    }
    normalized_df = df.rename(columns={key: value for key, value in column_map.items() if key in df.columns})
    required = ["日期", "开盘", "收盘", "最高", "最低", "成交量"]
    if any(column not in normalized_df.columns for column in required):
        return pd.DataFrame()
    if "成交额" not in normalized_df.columns:
        normalized_df["成交额"] = None

    result = normalized_df[["日期", "开盘", "收盘", "最高", "最低", "成交量", "成交额"]].copy()
    result["日期"] = pd.to_datetime(result["日期"], errors="coerce")
    result = result.dropna(subset=["日期"])
    return result


def build_adjusted_daily_df_from_change_pct(
    raw_df: pd.DataFrame,
    adjust: str = "none",
) -> pd.DataFrame:
    """Build qfq/hfq OHLC from raw database K-lines and exchange-reported change pct.

    For an ex-right day, the exchange change percentage is calculated against an
    adjusted previous close. Comparing that implied previous close with the raw
    previous close gives the adjustment bridge that removes the artificial gap.
    """
    adjust_mode = str(adjust or "none").strip().lower()
    if adjust_mode not in {"qfq", "hfq"} or raw_df is None or raw_df.empty:
        return pd.DataFrame()
    pct_col = "涨跌幅" if "涨跌幅" in raw_df.columns else "change_pct" if "change_pct" in raw_df.columns else ""
    required = ["日期", "开盘", "收盘", "最高", "最低"]
    if not pct_col or any(column not in raw_df.columns for column in required):
        return pd.DataFrame()

    df = raw_df.copy()
    df["日期"] = pd.to_datetime(df["日期"], errors="coerce")
    df = df.dropna(subset=["日期"]).sort_values("日期").reset_index(drop=True)
    if len(df) < 2:
        return pd.DataFrame()

    for column in ["开盘", "收盘", "最高", "最低", "成交量", "成交额", pct_col]:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    df = df.dropna(subset=["开盘", "收盘", "最高", "最低"])
    if len(df) < 2:
        return pd.DataFrame()

    bridges = [1.0] * len(df)
    for idx in range(1, len(df)):
        close_value = safe_float(df.at[idx, "收盘"])
        prev_close = safe_float(df.at[idx - 1, "收盘"])
        change_pct = safe_float(df.at[idx, pct_col])
        if (
            close_value is None
            or prev_close is None
            or change_pct is None
            or close_value <= 0
            or prev_close <= 0
            or change_pct <= -99.9
        ):
            continue
        implied_prev_close = close_value / (1 + change_pct / 100)
        bridge = implied_prev_close / prev_close if prev_close else 1.0
        if not math.isfinite(bridge) or bridge <= 0 or bridge < 0.05 or bridge > 20:
            continue
        if abs(bridge - 1.0) >= 0.003:
            bridges[idx] = bridge

    factors = [1.0] * len(df)
    if adjust_mode == "qfq":
        for idx in range(len(df) - 1, 0, -1):
            factors[idx - 1] = factors[idx] * bridges[idx]
    else:
        for idx in range(1, len(df)):
            factors[idx] = factors[idx - 1] / bridges[idx]

    result = df.copy()
    for column in ["开盘", "收盘", "最高", "最低"]:
        result[column] = result[column].astype(float) * pd.Series(factors, index=result.index)
    result = result[(result["开盘"] > 0) & (result["收盘"] > 0) & (result["最高"] > 0) & (result["最低"] > 0)]
    return result[["日期", "开盘", "收盘", "最高", "最低", "成交量", "成交额"]]


def overlay_live_adjusted_daily_df(
    adjusted_df: pd.DataFrame,
    raw_df: pd.DataFrame,
) -> pd.DataFrame:
    """Overlay the latest raw intraday bar on an adjusted daily frame.

    External adjusted feeds can lag during market hours even when the raw
    database row has already been refreshed. Derive the adjustment factor from
    the latest *completed* common day, then apply it to today's raw OHLC. This
    keeps qfq/hfq prices continuous without letting a stale adjusted close hide
    the current market price.
    """
    if adjusted_df is None or adjusted_df.empty or raw_df is None or raw_df.empty:
        return adjusted_df
    required = {"日期", "开盘", "收盘", "最高", "最低"}
    if not required.issubset(adjusted_df.columns) or not required.issubset(raw_df.columns):
        return adjusted_df

    adjusted = adjusted_df.copy()
    raw = raw_df.copy()
    adjusted["日期"] = pd.to_datetime(adjusted["日期"], errors="coerce")
    raw["日期"] = pd.to_datetime(raw["日期"], errors="coerce")
    adjusted = adjusted.dropna(subset=["日期"]).sort_values("日期").reset_index(drop=True)
    raw = raw.dropna(subset=["日期"]).sort_values("日期").reset_index(drop=True)
    if adjusted.empty or raw.empty:
        return adjusted_df

    for frame in (adjusted, raw):
        for column in ["开盘", "收盘", "最高", "最低"]:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")

    raw_latest = raw.iloc[-1]
    raw_date = raw_latest["日期"]
    raw_close = safe_float(raw_latest.get("收盘"))
    if raw_close is None or raw_close <= 0:
        return adjusted

    adjusted_by_date = adjusted.set_index(adjusted["日期"].dt.date)
    raw_by_date = raw.set_index(raw["日期"].dt.date)
    common_dates = sorted(set(adjusted_by_date.index) & set(raw_by_date.index))
    reference_factor = None
    for common_date in reversed(common_dates):
        if common_date >= raw_date.date():
            continue
        reference_raw = safe_float(raw_by_date.loc[common_date].get("收盘"))
        reference_adjusted = safe_float(adjusted_by_date.loc[common_date].get("收盘"))
        if reference_raw and reference_adjusted and reference_raw > 0:
            candidate = reference_adjusted / reference_raw
            if math.isfinite(candidate) and 0.05 <= candidate <= 20:
                reference_factor = candidate
                break
    if reference_factor is None:
        try:
            exact = adjusted_by_date.loc[raw_date.date()]
        except KeyError:
            exact = None
        if exact is not None:
            exact_close = safe_float(exact.get("收盘"))
            if exact_close and exact_close > 0:
                reference_factor = exact_close / raw_close
    if reference_factor is None or not math.isfinite(reference_factor):
        return adjusted

    live_values = {}
    for column in ["开盘", "收盘", "最高", "最低"]:
        raw_value = safe_float(raw_latest.get(column))
        if raw_value is None or raw_value <= 0:
            return adjusted
        live_values[column] = raw_value * reference_factor
    live_values["最高"] = max(live_values["最高"], live_values["开盘"], live_values["收盘"])
    live_values["最低"] = min(live_values["最低"], live_values["开盘"], live_values["收盘"])

    current_mask = adjusted["日期"].dt.date == raw_date.date()
    if current_mask.any():
        for column, value in live_values.items():
            adjusted.loc[current_mask, column] = value
        for column in ["成交量", "成交额"]:
            if column in raw_latest.index:
                raw_value = raw_latest.get(column)
                if safe_float(raw_value) is not None:
                    adjusted.loc[current_mask, column] = raw_value
        return adjusted

    new_row = {"日期": raw_date, **live_values}
    for column in ["成交量", "成交额"]:
        if column in raw_latest.index:
            new_row[column] = raw_latest.get(column)
    return pd.concat([adjusted, pd.DataFrame([new_row])], ignore_index=True).sort_values("日期").reset_index(drop=True)


def fetch_eastmoney_equity_profile(code: str) -> dict:
    """Fetch a fast HK/US profile from Eastmoney's public quote endpoint."""
    normalized = normalize_stock_code(code)
    market = equity_market(normalized)
    if market not in {"HK", "US"}:
        return {}
    fields = "f43,f57,f58,f59,f60,f116,f117,f127,f128,f162,f167,f173"
    for secid, exchange in _eastmoney_profile_secids(normalized):
        for endpoint in EASTMONEY_STOCK_PROFILE_URLS:
            try:
                response = requests.get(
                    endpoint,
                    params={"secid": secid, "fields": fields},
                    headers={
                        "User-Agent": "Mozilla/5.0",
                        "Referer": "https://quote.eastmoney.com/",
                    },
                    timeout=5,
                )
                response.raise_for_status()
                node = (response.json() or {}).get("data") or {}
            except Exception:
                continue
            if not isinstance(node, dict) or not sanitize_text(node.get("f57")):
                continue
            decimals = int(safe_float(node.get("f59")) or 2)
            divisor = 10 ** max(0, min(decimals, 6))
            current_price_raw = safe_float(node.get("f43"))
            prev_close_raw = safe_float(node.get("f60"))
            pb_raw = safe_float(node.get("f167"))
            pe_raw = safe_float(node.get("f162"))
            industry = sanitize_text(node.get("f127")) or ""
            sector = sanitize_text(node.get("f128")) or industry
            market_cap = safe_float(node.get("f116"))
            circulating_market_cap = safe_float(node.get("f117"))
            return {
                "code": normalized,
                "name": sanitize_text(node.get("f58")),
                "market": market,
                "exchange": exchange,
                "currency": market_currency(market),
                "industry": industry,
                "sector": sector,
                "price": current_price_raw / divisor if current_price_raw is not None else None,
                "prev_close": prev_close_raw / divisor if prev_close_raw is not None else None,
                "market_cap": market_cap / 100_000_000 if market_cap and market_cap > 0 else None,
                "circulating_market_cap": (
                    circulating_market_cap / 100_000_000
                    if circulating_market_cap and circulating_market_cap > 0
                    else None
                ),
                "pe_ratio": pe_raw / 100 if pe_raw and pe_raw > 0 else None,
                "pb_ratio": pb_raw / 100 if pb_raw and pb_raw > 0 else None,
                "roe": safe_float(node.get("f173")),
                "source": "eastmoney.stock_profile",
            }
    return {}


def fetch_yfinance_equity_profile(code: str) -> dict:
    """Fetch a market-aware company profile without making yfinance mandatory at import time."""
    normalized = normalize_stock_code(code)
    if not is_fetchable_security_code(normalized):
        return {}
    try:
        import yfinance as yf
    except ImportError:
        return {}

    try:
        from curl_cffi import requests as curl_requests

        session = curl_requests.Session(timeout=6, impersonate="chrome")
        info = yf.Ticker(yfinance_symbol(normalized), session=session).get_info() or {}
    except Exception:
        return {}
    if not isinstance(info, dict):
        return {}
    sector_raw = sanitize_text(info.get("sector")) or ""
    industry_raw = sanitize_text(info.get("industry")) or ""
    market = equity_market(normalized)
    roe = safe_float(info.get("returnOnEquity"))
    if roe is not None and abs(roe) <= 5:
        roe *= 100
    market_cap = safe_float(info.get("marketCap"))
    float_shares = safe_float(info.get("floatShares"))
    current_price = safe_float(
        info.get("currentPrice")
        or info.get("regularMarketPrice")
        or info.get("previousClose")
    )
    return {
        "code": normalized,
        "name": sanitize_text(info.get("longName") or info.get("shortName")),
        "market": market,
        "exchange": sanitize_text(info.get("exchange")) or infer_exchange(normalized, market),
        "currency": sanitize_text(info.get("currency")) or market_currency(market),
        "industry": industry_raw,
        "sector": _YAHOO_SECTOR_ZH.get(sector_raw, sector_raw),
        "industry_en": industry_raw,
        "sector_en": sector_raw,
        "price": current_price,
        "prev_close": safe_float(info.get("previousClose")),
        "market_cap": market_cap / 100_000_000 if market_cap and market_cap > 0 else None,
        "circulating_market_cap": (
            float_shares * current_price / 100_000_000
            if float_shares and current_price
            else None
        ),
        "pe_ratio": safe_float(info.get("trailingPE") or info.get("forwardPE")),
        "pb_ratio": safe_float(info.get("priceToBook")),
        "roe": roe,
        "source": "yfinance.quoteSummary",
    }


def fetch_equity_profile(code: str) -> dict:
    """Use a fast public profile first, with yfinance as the optional fallback."""
    profile = fetch_eastmoney_equity_profile(code)
    if profile:
        return profile
    return fetch_yfinance_equity_profile(code)


def tencent_symbol(code: str) -> str:
    code = normalize_stock_code(code)
    if is_hk_stock_code(code):
        return code
    if is_us_stock_code(code):
        return code
    if code.startswith(("5", "6", "9")):
        return f"sh{code}"
    if code.startswith(("0", "1", "2", "3")):
        return f"sz{code}"
    if code.startswith(("4", "8")):
        return f"bj{code}"
    return code


def _chunks(items: list[str], size: int) -> Iterable[list[str]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _field(fields: list[str], index: int):
    return fields[index] if len(fields) > index else None


def _normalize_tencent_symbol_code(symbol: str, raw_code: str | None) -> str:
    symbol = str(symbol or "").strip()
    raw_code = sanitize_text(raw_code) or symbol
    if symbol.lower().startswith("hk"):
        digits = "".join(ch for ch in raw_code if ch.isdigit()) or symbol[2:]
        return f"hk{digits.zfill(5)}"
    if symbol.lower().startswith("us"):
        raw_symbol = re.sub(r"(?i)^us", "", raw_code or symbol)
        if not raw_symbol or raw_symbol == raw_code:
            raw_symbol = symbol[2:]
        return f"us{raw_symbol.upper()}"
    digits = "".join(ch for ch in raw_code if ch.isdigit())
    return digits.zfill(6) if digits and len(digits) <= 6 else str(raw_code or symbol)


def _parse_tencent_quote_fields(fields: list[str], symbol: str = "") -> dict:
    code = _normalize_tencent_symbol_code(symbol, sanitize_text(_field(fields, 2)))
    board = infer_listing_board(code)
    market = equity_market(code)
    currency_candidate = sanitize_text(
        _field(fields, 82)
        if market == "CN"
        else _field(fields, 75)
        if market == "HK"
        else _field(fields, 35)
    )
    currency = (
        currency_candidate.upper()
        if currency_candidate and currency_candidate.upper() in {"CNY", "HKD", "USD"}
        else market_currency(market)
    )
    raw_amount = safe_float(_field(fields, 37))
    amount = (
        raw_amount * 10000
        if raw_amount is not None and market == "CN"
        else raw_amount
    )
    return {
        "code": code,
        "name": sanitize_text(_field(fields, 1)),
        "market": market,
        "exchange": infer_exchange(code, market=market),
        "currency": currency,
        "price": safe_float(_field(fields, 3)),
        "prev_close": safe_float(_field(fields, 4)),
        "open": safe_float(_field(fields, 5)),
        "volume": safe_float(_field(fields, 36) or _field(fields, 6)),
        "amount": amount,
        "change_amount": safe_float(_field(fields, 31)),
        "change_pct": safe_float(_field(fields, 32)),
        "turnover_rate": safe_float(_field(fields, 38)),
        "pe_ratio": safe_float(_field(fields, 39)),
        "high": safe_float(_field(fields, 33)),
        "low": safe_float(_field(fields, 34)),
        "amplitude": safe_float(_field(fields, 43)),
        "trade_time": sanitize_text(_field(fields, 30)),
        "circulating_market_cap": safe_float(_field(fields, 44)),
        "market_cap": safe_float(_field(fields, 45)),
        "pb_ratio": safe_float(_field(fields, 46 if market == "CN" else 58)),
        "market_label": sanitize_text(
            _field(fields, 61 if market == "CN" else 63 if market == "HK" else 56)
        ),
        "board": board,
    }


def fetch_tencent_fundamentals(codes: list[str], batch_size: int = 200) -> dict[str, dict]:
    """Fetch quote and fundamental snapshot fields from Tencent public API.

    Market cap values are returned in 100M CNY units by Tencent and stored as-is.
    """
    result: dict[str, dict] = {}
    symbols = []
    seen: set[str] = set()
    for code in codes:
        if not is_fetchable_security_code(code):
            continue
        symbol = tencent_symbol(code)
        if symbol in seen:
            continue
        seen.add(symbol)
        symbols.append(symbol)
    session = requests.Session()
    for part in _chunks(symbols, batch_size):
        response = session.get(
            TENCENT_QUOTE_URL.format(symbols=",".join(part)),
            timeout=REQUEST_TIMEOUT,
        )
        response.encoding = "gbk"
        for match in re.finditer(r'v_([A-Za-z]{2}[A-Za-z0-9.]+)="([^"]*)"', response.text):
            symbol = match.group(1)
            fields = match.group(2).split("~")
            item = _parse_tencent_quote_fields(fields, symbol)
            code = item.get("code") or _normalize_tencent_symbol_code(symbol, None)
            if code:
                result[code] = item
    return result


_ths_cookie_cache: tuple[float, str] | None = None


def _ths_headers() -> dict:
    """Build Tonghuashun request headers with the dynamic v cookie."""
    global _ths_cookie_cache
    now = time.time()
    if _ths_cookie_cache and _ths_cookie_cache[0] > now:
        v_code = _ths_cookie_cache[1]
    else:
        from py_mini_racer import py_mini_racer
        from akshare.datasets import get_ths_js

        with open(get_ths_js("ths.js"), encoding="utf-8") as f:
            js_content = f.read()
        js_code = py_mini_racer.MiniRacer()
        js_code.eval(js_content)
        v_code = js_code.call("v")
        _ths_cookie_cache = (now + 3600, v_code)
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 Chrome/120 Safari/537.36"
        ),
        "Cookie": f"v={v_code}",
        "Referer": "http://q.10jqka.com.cn/gn/",
    }


def fetch_ths_concept_boards(limit: int = 80) -> list[dict]:
    """Fetch concept board ranking from Tonghuashun.

    The response embeds current concept-board data in a hidden gnSection JSON
    payload. Field ``199112`` is the current change percentage used by THS.
    """
    url = "http://q.10jqka.com.cn/gn/index/field/199112/order/desc/page/1/ajax/1/"
    response = requests.get(url, headers=_ths_headers(), timeout=REQUEST_TIMEOUT)
    response.encoding = "gbk"
    match = re.search(r'id=["\']gnSection["\']\s+value=\'([^\']*)\'', response.text)
    if not match:
        match = re.search(r'id=["\']gnSection["\']\s+value="([^"]*)"', response.text)
    if not match:
        return []
    payload_text = html.unescape(match.group(1))
    payload = json.loads(payload_text)
    rows = []
    for item in payload.values():
        name = sanitize_text(item.get("platename"))
        code = sanitize_text(item.get("platecode"))
        detail_code = sanitize_text(item.get("cid"))
        if not name or not code:
            continue
        rows.append(
            {
                "code": code,
                "detail_code": detail_code or code,
                "name": name,
                "change_pct": safe_float(item.get("199112")) or 0.0,
                "stock_count": int(safe_float(item.get("zfl")) or 0),
                "lead_stock": sanitize_text(item.get("leader")) or "",
                "source": "ths.concept.gnSection",
            }
        )
    rows.sort(key=lambda x: float(x.get("change_pct") or 0), reverse=True)
    return rows[: max(1, int(limit or 80))]


def fetch_ths_concept_members(detail_code: str, limit: int = 120) -> list[dict]:
    """Fetch current constituent stocks for a THS concept board detail code."""
    code = str(detail_code or "").strip()
    if not code:
        return []
    from bs4 import BeautifulSoup

    headers = _ths_headers()
    max_rows = max(1, int(limit or 120))

    def parse_table(html_text: str) -> list[dict]:
        soup = BeautifulSoup(html_text, features="lxml")
        tables = soup.find_all("table")
        if not tables:
            return []
        table = tables[-1]
        parsed = []
        for tr in table.find_all("tr"):
            cells = [td.get_text(strip=True) for td in tr.find_all("td")]
            if len(cells) < 5:
                continue
            stock_code = normalize_stock_code(cells[1])
            stock_name = sanitize_text(cells[2])
            if not is_a_share_code(stock_code) or not stock_name:
                continue
            parsed.append(
                {
                    "code": stock_code,
                    "name": stock_name,
                    "change_pct": safe_float(cells[4]) or 0.0,
                }
            )
        return parsed

    url = f"http://q.10jqka.com.cn/gn/detail/code/{code}/"
    response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    response.encoding = "gbk"
    soup = BeautifulSoup(response.text, features="lxml")
    page_count = 1
    page_info = soup.find(attrs={"class": "page_info"})
    if page_info:
        match = re.search(r"/(\d+)", page_info.get_text(strip=True))
        if match:
            page_count = max(1, int(match.group(1)))
    rows = []
    seen: set[str] = set()
    first_page_items = parse_table(response.text)
    for item in first_page_items:
        if item["code"] in seen:
            continue
        seen.add(item["code"])
        rows.append(item)
        if len(rows) >= max_rows:
            break
    if page_count <= 1 and len(first_page_items) >= 10 and max_rows > len(rows):
        page_count = min(20, max(2, math.ceil(max_rows / max(len(first_page_items), 1))))
    for page in range(2, page_count + 1):
        if len(rows) >= max_rows:
            break
        page_url = (
            f"http://q.10jqka.com.cn/gn/detail/code/{code}/"
            f"field/199112/order/desc/page/{page}/ajax/1/"
        )
        page_response = requests.get(page_url, headers=headers, timeout=REQUEST_TIMEOUT)
        page_response.encoding = "gbk"
        for item in parse_table(page_response.text):
            if item["code"] in seen:
                continue
            seen.add(item["code"])
            rows.append(item)
            if len(rows) >= max_rows:
                break
    rows.sort(key=lambda x: float(x.get("change_pct") or 0), reverse=True)
    return rows


def fetch_tencent_intraday_points(code: str) -> dict:
    """Fetch today's minute-level price/volume points from Tencent."""
    symbol = tencent_symbol(code)
    response = requests.get(
        TENCENT_MINUTE_URL,
        params={"code": symbol},
        headers={"User-Agent": "Mozilla/5.0", "Referer": "https://stockapp.finance.qq.com/"},
        timeout=REQUEST_TIMEOUT,
    )
    payload = response.json()
    data = (payload.get("data") or {}) if isinstance(payload, dict) else {}
    node = None
    if isinstance(data, dict):
        for key in _tencent_payload_keys(symbol):
            candidate = data.get(key)
            if candidate is not None:
                node = candidate
                break
    if not isinstance(node, dict):
        return {"code": normalize_stock_code(code), "symbol": symbol, "date": None, "data": []}
    data_node = node.get("data") or {}
    rows = data_node.get("data") if isinstance(data_node, dict) else []
    trade_date = sanitize_text(data_node.get("date") if isinstance(data_node, dict) else None)
    qt = node.get("qt") if isinstance(node.get("qt"), dict) else {}
    quote_fields = []
    if isinstance(qt, dict):
        for key in _tencent_payload_keys(symbol):
            candidate = qt.get(key)
            if isinstance(candidate, list):
                quote_fields = candidate
                break
    prev_close = safe_float(quote_fields[4]) if isinstance(quote_fields, list) and len(quote_fields) > 4 else None
    stock_name = sanitize_text(quote_fields[1]) if isinstance(quote_fields, list) and len(quote_fields) > 1 else None
    points = []
    source_cum_volume = 0.0
    source_cum_amount = 0.0
    session_cum_volume = 0.0
    session_cum_amount = 0.0
    for row in rows or []:
        parts = str(row).split()
        if len(parts) < 4:
            continue
        hhmm = parts[0].zfill(4)
        price = safe_float(parts[1])
        cum_volume = safe_float(parts[2]) or 0.0
        cum_amount = safe_float(parts[3]) or 0.0
        if price is None:
            continue
        # Tencent may reset cumulative values after the lunch break. Treat a
        # backwards jump as a new session instead of zeroing the whole
        # afternoon until it exceeds the morning total.
        volume_reset = cum_volume + 1e-9 < source_cum_volume
        amount_reset = cum_amount + 1e-9 < source_cum_amount
        minute_volume = max(0.0, cum_volume if volume_reset else cum_volume - source_cum_volume)
        minute_amount = max(0.0, cum_amount if amount_reset else cum_amount - source_cum_amount)
        source_cum_volume = cum_volume
        source_cum_amount = cum_amount
        session_cum_volume += minute_volume
        session_cum_amount += minute_amount
        change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0.0
        points.append(
            {
                "time": f"{hhmm[:2]}:{hhmm[2:]}",
                "price": price,
                "change_pct": round(change_pct, 4),
                "volume": minute_volume,
                "amount": minute_amount,
                "cum_volume": session_cum_volume,
                "cum_amount": session_cum_amount,
            }
        )
    return {
        "code": normalize_stock_code(code),
        "name": stock_name,
        "market": equity_market(code),
        "currency": market_currency(equity_market(code)),
        "symbol": symbol,
        "date": trade_date,
        "prev_close": prev_close,
        "source": "tencent.minute",
        "data": points,
    }


def parse_sina_us_intraday_text(response_text: str, code: str) -> dict:
    """Parse Sina US minute K-lines and keep the latest complete trading date."""
    text = str(response_text or "")
    match = re.search(r"=\s*\((\[.*\])\)\s*;?\s*$", text, re.S)
    if not match:
        return {"code": normalize_stock_code(code), "market": "US", "data": []}
    try:
        rows = json.loads(match.group(1))
    except (TypeError, ValueError, json.JSONDecodeError):
        return {"code": normalize_stock_code(code), "market": "US", "data": []}
    parsed_rows = []
    for item in rows if isinstance(rows, list) else []:
        if not isinstance(item, dict):
            continue
        dt = pd.to_datetime(item.get("d"), errors="coerce")
        price = safe_float(item.get("c"))
        if pd.isna(dt) or price is None or price <= 0:
            continue
        parsed_rows.append((dt, item, price))
    if not parsed_rows:
        return {"code": normalize_stock_code(code), "market": "US", "data": []}
    trade_date = max(item[0].date() for item in parsed_rows)
    latest_rows = sorted(
        (item for item in parsed_rows if item[0].date() == trade_date),
        key=lambda item: item[0],
    )
    points = []
    cum_volume = 0.0
    cum_amount = 0.0
    for dt, item, price in latest_rows:
        volume = max(0.0, safe_float(item.get("v")) or 0.0)
        amount = max(0.0, safe_float(item.get("a")) or price * volume)
        cum_volume += volume
        cum_amount += amount
        points.append(
            {
                "time": dt.strftime("%H:%M"),
                "price": price,
                "volume": volume,
                "amount": amount,
                "cum_volume": cum_volume,
                "cum_amount": cum_amount,
            }
        )
    return {
        "code": normalize_stock_code(code),
        "market": "US",
        "currency": "USD",
        "date": trade_date.isoformat(),
        "source": "sina.us.minute",
        "data": points,
    }


def fetch_sina_us_intraday_points(code: str) -> dict:
    normalized = normalize_stock_code(code)
    if not is_us_stock_code(normalized):
        return {"code": normalized, "market": equity_market(normalized), "data": []}
    symbol = normalized[2:].upper().replace("-", ".")
    response = requests.get(
        SINA_US_MINUTE_URL,
        params={"symbol": symbol, "type": 1, "___qn": 3},
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": f"https://stock.finance.sina.com.cn/usstock/quotes/{symbol}.html",
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return parse_sina_us_intraday_text(response.text, normalized)


def fetch_stock_intraday_points(code: str) -> dict:
    """Market-aware intraday source chain with a full-session US fallback."""
    normalized = normalize_stock_code(code)
    market = equity_market(normalized)
    primary = fetch_tencent_intraday_points(normalized)
    if market != "US" or len(primary.get("data") or []) >= 300:
        return primary
    try:
        fallback = fetch_sina_us_intraday_points(normalized)
    except Exception:
        fallback = None

    def payload_date(payload: dict | None):
        raw_value = sanitize_text((payload or {}).get("date"))
        if not raw_value:
            return None
        parsed = pd.to_datetime(raw_value, errors="coerce")
        return None if pd.isna(parsed) else parsed.date()

    primary_date = payload_date(primary)
    fallback_date = payload_date(fallback)
    should_use_fallback = bool(fallback and fallback.get("data")) and (
        (fallback_date and primary_date and fallback_date > primary_date)
        or (
            not (fallback_date and primary_date and fallback_date < primary_date)
            and len(fallback.get("data") or []) > len(primary.get("data") or [])
        )
    )
    if should_use_fallback:
        quote = fetch_tencent_fundamentals([normalized]).get(normalized) or {}
        fallback["name"] = quote.get("name") or primary.get("name")
        fallback["prev_close"] = quote.get("prev_close") or primary.get("prev_close")
        previous = safe_float(fallback.get("prev_close"))
        if previous:
            for point in fallback.get("data") or []:
                point["change_pct"] = round(
                    (float(point["price"]) - previous) / previous * 100,
                    4,
                )
        return fallback
    return primary


def fetch_stock_universe() -> pd.DataFrame:
    """Fetch A-share code/name list from mootdx."""
    from mootdx.quotes import Quotes

    client = Quotes.factory(market="std")
    frames = []
    for market in (0, 1):
        df = client.stocks(market=market)
        if df is not None and not df.empty:
            frames.append(df)
    if not frames:
        return pd.DataFrame(columns=["code", "name", "board"])
    df_all = pd.concat(frames, ignore_index=True)
    rows = []
    seen: set[str] = set()
    for _, row in df_all.iterrows():
        code = normalize_stock_code(row.get("code"))
        name = sanitize_text(row.get("name"))
        if not code or not name or code in seen or not is_a_share_code(code):
            continue
        seen.add(code)
        rows.append({"code": code, "name": name, "board": infer_listing_board(code)})
    return pd.DataFrame(rows, columns=["code", "name", "board"])


def fetch_mootdx_quote(code: str) -> dict | None:
    from mootdx.quotes import Quotes

    client = Quotes.factory(market="std")
    df = client.quotes(symbol=[code])
    if df is None or df.empty:
        return None
    row = df.iloc[0]
    return {
        "code": str(row.get("code") or code),
        "price": safe_float(row.get("price")),
        "prev_close": safe_float(row.get("last_close")),
        "open": safe_float(row.get("open")),
        "high": safe_float(row.get("high")),
        "low": safe_float(row.get("low")),
        "volume": safe_float(row.get("volume") or row.get("vol")),
        "amount": safe_float(row.get("amount")),
        "bid1": safe_float(row.get("bid1")),
        "ask1": safe_float(row.get("ask1")),
        "bid_vol1": safe_float(row.get("bid_vol1")),
        "ask_vol1": safe_float(row.get("ask_vol1")),
    }


def fetch_mootdx_daily_df(code: str, start_date: date, end_date: date) -> pd.DataFrame:
    from mootdx.quotes import Quotes

    client = Quotes.factory(market="std")
    day_span = max(1, (end_date - start_date).days)
    offset = min(max(day_span * 2 + 120, 120), 3200)
    df = client.bars(symbol=code, frequency=9, start=0, offset=offset)
    if df is None or df.empty:
        return pd.DataFrame()
    df = df.reset_index(drop=True).copy()
    if "datetime" in df.columns:
        df["日期"] = pd.to_datetime(df["datetime"], errors="coerce")
    else:
        df["日期"] = pd.to_datetime(
            df[["year", "month", "day"]].astype(str).agg("-".join, axis=1),
            errors="coerce",
        )
    df = df[df["日期"].notna()]
    df = df[(df["日期"].dt.date >= start_date) & (df["日期"].dt.date <= end_date)]
    if df.empty:
        return pd.DataFrame()
    return pd.DataFrame(
        {
            "日期": df["日期"],
            "开盘": df["open"],
            "收盘": df["close"],
            "最高": df["high"],
            "最低": df["low"],
            "成交量": df.get("vol", df.get("volume")),
            "成交额": df.get("amount"),
        }
    )


def fetch_tencent_daily_df(
    code: str,
    start_date: date,
    end_date: date,
    adjust: str = "none",
) -> pd.DataFrame:
    symbol = tencent_symbol(code)
    day_span = max(1, (end_date - start_date).days)
    market = equity_market(code)
    max_count = 800 if market in {"HK", "US"} else 3200
    count = min(max(day_span * 2 + 30, 30), max_count)
    adjust_mode = str(adjust or "none").strip().lower()
    kline_kind = {"qfq": "qfqday", "hfq": "hfqday"}.get(adjust_mode, "day")
    response = requests.get(
        TENCENT_KLINE_URL,
        params={"param": f"{symbol},{kline_kind},,,{count}"},
        timeout=REQUEST_TIMEOUT,
    )
    payload = response.json()
    # Never label raw ``day`` data as qfq/hfq when Tencent omitted the
    # requested adjusted series. The caller still has Eastmoney/AkShare/local
    # adjustment fallbacks, so returning an empty frame is safer than silently
    # returning data with the wrong price basis.
    rows = extract_tencent_kline_rows(
        payload,
        symbol,
        kline_kind,
        strict=adjust_mode in {"qfq", "hfq"},
    )
    data = []
    for item in rows:
        if len(item) < 6:
            continue
        dt = pd.to_datetime(item[0], errors="coerce")
        if pd.isna(dt):
            continue
        dt_date = dt.date()
        if dt_date < start_date or dt_date > end_date:
            continue
        data.append(
            {
                "日期": dt,
                "开盘": safe_float(item[1]),
                "收盘": safe_float(item[2]),
                "最高": safe_float(item[3]),
                "最低": safe_float(item[4]),
                "成交量": safe_float(item[5]),
                "成交额": safe_float(item[6]) if len(item) > 6 else None,
            }
        )
    return pd.DataFrame(data)


def parse_sina_us_daily_text(
    response_text: str,
    start_date: date,
    end_date: date,
) -> pd.DataFrame:
    """Parse Sina's US daily JSONP response into the shared daily frame schema."""
    text = str(response_text or "")
    match = re.search(r"=\s*\((\[.*\])\)\s*;?\s*$", text, re.S)
    if not match:
        return pd.DataFrame()
    try:
        rows = json.loads(match.group(1))
    except (TypeError, ValueError, json.JSONDecodeError):
        return pd.DataFrame()
    data = []
    for item in rows if isinstance(rows, list) else []:
        if not isinstance(item, dict):
            continue
        dt = pd.to_datetime(item.get("d"), errors="coerce")
        if pd.isna(dt) or dt.date() < start_date or dt.date() > end_date:
            continue
        open_value = safe_float(item.get("o"))
        close_value = safe_float(item.get("c"))
        high_value = safe_float(item.get("h"))
        low_value = safe_float(item.get("l"))
        if any(
            value is None or value <= 0
            for value in (open_value, close_value, high_value, low_value)
        ):
            continue
        data.append(
            {
                "日期": dt,
                "开盘": open_value,
                "收盘": close_value,
                "最高": high_value,
                "最低": low_value,
                "成交量": safe_float(item.get("v")) or 0.0,
                "成交额": safe_float(item.get("a")),
            }
        )
    return pd.DataFrame(data)


def fetch_sina_us_daily_df(code: str, start_date: date, end_date: date) -> pd.DataFrame:
    """Fetch US daily K-lines from Sina when Tencent returns sparse history."""
    normalized = normalize_stock_code(code)
    if not is_us_stock_code(normalized):
        return pd.DataFrame()
    symbol = normalized[2:].upper()
    response = requests.get(
        SINA_US_DAILY_URL,
        params={"symbol": symbol, "___qn": 3},
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": f"https://stock.finance.sina.com.cn/usstock/quotes/{symbol}.html",
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return parse_sina_us_daily_text(response.text, start_date, end_date)


def _daily_frame_is_sufficient(
    df: pd.DataFrame | None,
    start_date: date,
    end_date: date,
) -> bool:
    if df is None or df.empty:
        return False
    date_column = "日期" if "日期" in df.columns else "date" if "date" in df.columns else None
    if not date_column:
        return False
    dates = pd.to_datetime(df[date_column], errors="coerce").dropna()
    if dates.empty:
        return False
    requested_days = max(1, (end_date - start_date).days)
    if requested_days >= 120 and len(dates) < 30:
        return False
    latest_date = dates.max().date()
    return (end_date - latest_date).days <= 14


def extract_tencent_kline_rows(
    payload: object,
    symbol: str,
    preferred_kind: str = "day",
    *,
    strict: bool = False,
) -> list:
    """Return Tencent K-line rows from known response shapes.

    Tencent normally returns {"data": {symbol: {"day": [...]}}}. During source
    hiccups it may return partial list-like nodes. Keep the parser defensive so
    update jobs skip bad payloads instead of failing with attribute errors.
    """
    if not isinstance(payload, dict):
        return []
    data = payload.get("data")
    if isinstance(data, dict):
        node = None
        for key in _tencent_payload_keys(symbol):
            candidate = data.get(key)
            if candidate is not None:
                node = candidate
                break
        if isinstance(node, dict):
            kind = str(preferred_kind or "day").strip().lower()
            preferred_rows = node.get(kind) if kind in {"day", "qfqday", "hfqday"} else None
            if strict:
                return preferred_rows if isinstance(preferred_rows, list) else []
            rows = preferred_rows or node.get("day") or node.get("qfqday") or node.get("hfqday") or []
            return rows if isinstance(rows, list) else []
        if isinstance(node, list):
            return [] if strict else node
    if isinstance(data, list):
        return [] if strict else data
    return []


def _tencent_payload_keys(symbol: str) -> list[str]:
    """Return known Tencent response-key variants for one request symbol."""
    raw = str(symbol or "").strip()
    keys = [raw, raw.lower(), raw.upper()]
    if raw.lower().startswith("us"):
        ticker = raw[2:].lstrip(".")
        keys.extend([f"us.{ticker}", f"us.{ticker.upper()}", f"us.{ticker.lower()}"])
    result: list[str] = []
    for key in keys:
        if key and key not in result:
            result.append(key)
    return result


def fetch_daily_price_df(code: str, start_date: date, end_date: date) -> pd.DataFrame:
    """Fetch daily K-lines through a market-aware provider chain."""
    normalized = normalize_stock_code(code)
    if not is_fetchable_security_code(normalized):
        return pd.DataFrame()
    market = equity_market(normalized)
    if market == "CN":
        fetchers = (fetch_mootdx_daily_df, fetch_tencent_daily_df)
    elif market == "US":
        fetchers = (fetch_tencent_daily_df, fetch_sina_us_daily_df)
    else:
        fetchers = (fetch_tencent_daily_df,)
    errors = []
    best_df = pd.DataFrame()
    for fetcher in fetchers:
        try:
            df = fetcher(normalized, start_date, end_date)
            if df is not None and not df.empty:
                if len(df) > len(best_df):
                    best_df = df
                if _daily_frame_is_sufficient(df, start_date, end_date):
                    return df
        except Exception as err:
            errors.append(f"{fetcher.__name__}: {err}")
    if not best_df.empty:
        return best_df
    if errors:
        raise RuntimeError("; ".join(errors))
    return pd.DataFrame()
