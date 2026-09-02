# -*- coding: utf-8 -*-
"""
因子表达式引擎
- 安全地执行因子表达式 (基于 pandas DataFrame)
- 内置技术分析函数库
- 支持参数替换 ($param_name 语法)
- 支持验证表达式语法
- 支持在单只股票数据上计算因子值
- 支持批量遍历全市场计算
"""

import concurrent.futures
import math
import re
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import data_sources
from database import SessionLocal
from models import DailyPrice, Stock
from sqlalchemy.orm import Session

# ===========================================================================
# 内置技术分析函数库
# ===========================================================================


def MA(series, window):
    """简单移动平均"""
    window = int(window)
    return series.rolling(window=window, min_periods=1).mean()


def EMA(series, window):
    """指数移动平均"""
    window = int(window)
    return series.ewm(span=window, adjust=False, min_periods=1).mean()


def ROC(series, window):
    """变动率: (close/Ref(close,N) - 1) * 100"""
    window = int(window)
    ref = series.shift(window)
    return (series / ref - 1) * 100


def MOM(series, window):
    """动量: close - Ref(close, N)"""
    window = int(window)
    return series - series.shift(window)


def RSI(series, window=14):
    """相对强弱指标"""
    window = int(window)
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(alpha=1 / window, min_periods=window, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / window, min_periods=window, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def STD(series, window):
    """滚动标准差"""
    window = int(window)
    return series.rolling(window=window, min_periods=2).std()


def ATR(high, low, close, window=14):
    """真实波幅均值"""
    window = int(window)
    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / window, min_periods=window, adjust=False).mean()


def BOLL_WIDTH(series, window=20, k=2):
    """布林带宽度: (upper - lower) / middle * 100"""
    window = int(window)
    middle = series.rolling(window=window, min_periods=1).mean()
    std_val = series.rolling(window=window, min_periods=2).std()
    upper = middle + k * std_val
    lower = middle - k * std_val
    return (upper - lower) / middle.replace(0, np.nan) * 100


def VOL_RATIO(volume, short_w, long_w):
    """量能比: MA(vol,short) / MA(vol,long)"""
    short_w = int(short_w)
    long_w = int(long_w)
    return MA(volume, short_w) / MA(volume, long_w).replace(0, np.nan)


def OBV(close, volume):
    """能量潮"""
    direction = (close.diff() > 0).astype(float)
    direction.iloc[0] = 0
    direction = direction * 2 - 1
    unchanged = close.diff() == 0
    direction[unchanged] = 0
    return (direction * volume).cumsum()


def VWAP(close, volume, window):
    """成交量加权平均价"""
    window = int(window)
    vol = volume.rolling(window=window, min_periods=1).sum()
    amount = (close * volume).rolling(window=window, min_periods=1).sum()
    return amount / vol.replace(0, np.nan)


def Ref(series, n):
    """n周期前的值"""
    n = int(n)
    return series.shift(n)


def HHV(series, window):
    """window周期最高值"""
    window = int(window)
    return series.rolling(window=window, min_periods=1).max()


def LLV(series, window):
    """window周期最低值"""
    window = int(window)
    return series.rolling(window=window, min_periods=1).min()


def CROSS(a, b):
    """金叉: a上穿b (返回布尔序列, 1=上穿, 0=未上穿)"""
    prev_a = a.shift(1)
    prev_b = b.shift(1)
    cross = (prev_a <= prev_b) & (a > b)
    return cross.astype(float)


def IF(cond, true_val, false_val):
    """条件选择"""
    cond = cond.astype(bool)
    return pd.Series(np.where(cond, true_val, false_val), index=cond.index)


def ABS(x):
    """绝对值"""
    if isinstance(x, pd.Series):
        return x.abs()
    return abs(x)


def MAX(a, b):
    """取大值"""
    if isinstance(a, pd.Series) or isinstance(b, pd.Series):
        a = pd.Series(a) if not isinstance(a, pd.Series) else a
        b = pd.Series(b) if not isinstance(b, pd.Series) else b
        return pd.concat([a, b], axis=1).max(axis=1)
    return max(a, b)


def MIN(a, b):
    """取小值"""
    if isinstance(a, pd.Series) or isinstance(b, pd.Series):
        a = pd.Series(a) if not isinstance(a, pd.Series) else a
        b = pd.Series(b) if not isinstance(b, pd.Series) else b
        return pd.concat([a, b], axis=1).min(axis=1)
    return min(a, b)


def SUM(series, window):
    """滚动求和"""
    window = int(window)
    return series.rolling(window=window, min_periods=1).sum()


def ATAN(x):
    """反正切(度数)"""
    if isinstance(x, pd.Series):
        return np.degrees(np.arctan(x))
    return math.degrees(math.atan(x))


def DEGREES(x):
    """弧度转角度"""
    if isinstance(x, pd.Series):
        return np.degrees(x)
    return math.degrees(x)


def SLOPE(series, n):
    """N日斜率: (current - n_days_ago) / n"""
    n = int(n)
    return (series - series.shift(n)) / n


# ===========================================================================
# 安全的执行环境
# ===========================================================================

_SAFE_BUILTINS = {
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "len": len,
    "int": int,
    "float": float,
    "True": True,
    "False": False,
    "None": None,
}

FACTOR_FUNCTIONS = {
    "MA": MA,
    "EMA": EMA,
    "ROC": ROC,
    "MOM": MOM,
    "RSI": RSI,
    "STD": STD,
    "ATR": ATR,
    "BOLL_WIDTH": BOLL_WIDTH,
    "VOL_RATIO": VOL_RATIO,
    "OBV": OBV,
    "VWAP": VWAP,
    "Ref": Ref,
    "HHV": HHV,
    "LLV": LLV,
    "CROSS": CROSS,
    "IF": IF,
    "ABS": ABS,
    "MAX": MAX,
    "MIN": MIN,
    "SUM": SUM,
    "ATAN": ATAN,
    "DEGREES": DEGREES,
    "SLOPE": SLOPE,
}

_DANGEROUS_KEYWORDS = [
    "__import__",
    "import",
    "exec",
    "eval",
    "compile",
    "open",
    "input",
    "raw_input",
    "globals",
    "locals",
    "getattr",
    "setattr",
    "delattr",
    "hasattr",
    "__builtins__",
    "__class__",
    "__bases__",
    "__subclasses__",
    "os",
    "sys",
    "subprocess",
    "shutil",
    "pathlib",
    "socket",
    "http",
    "urllib",
    "requests",
]


def _check_dangerous(expression: str):
    """检查表达式中是否包含危险关键字"""
    expr_lower = expression.lower()
    for kw in _DANGEROUS_KEYWORDS:
        kw_lower = kw.lower()
        if kw_lower.startswith("__") or kw_lower.endswith("__"):
            matched = kw_lower in expr_lower
        else:
            matched = re.search(
                r"(?<![a-zA-Z0-9_])" + re.escape(kw_lower) + r"(?![a-zA-Z0-9_])",
                expr_lower,
            )
        if matched:
            raise ValueError(f"表达式包含不允许的关键字: {kw}")


def _replace_params(expression: str, params: dict) -> str:
    """将表达式中的 $param_name 替换为实际参数值"""
    result = expression
    for key, value in params.items():
        pattern = r"\$" + re.escape(key) + r"(?!\w)"
        if isinstance(value, float) and value != int(value):
            replacement = str(value)
        else:
            replacement = (
                str(int(value)) if isinstance(value, (int, float)) else str(value)
            )
        result = re.sub(pattern, replacement, result)
    return result


def _build_eval_context(df: pd.DataFrame) -> dict:
    """构建安全的 eval 上下文"""
    column_map = {
        "open": "open",
        "close": "close",
        "high": "high",
        "low": "low",
        "volume": "volume",
        "amount": "amount",
        "ma60": "ma60",
    }
    local_vars = {}
    for col, var_name in column_map.items():
        if col in df.columns:
            local_vars[var_name] = df[col].astype(float)
    local_vars.update(FACTOR_FUNCTIONS)
    local_vars["np"] = np
    local_vars["pd"] = pd
    return local_vars


def validate_expression(expression: str, params: dict = None) -> dict:
    """验证因子表达式语法是否合法"""
    if not expression or not expression.strip():
        return {"valid": False, "error": "表达式不能为空"}
    try:
        _check_dangerous(expression)
    except ValueError as e:
        return {"valid": False, "error": str(e)}
    if params:
        try:
            expression = _replace_params(expression, params)
        except Exception as e:
            return {"valid": False, "error": f"参数替换失败: {e}"}
    remaining = re.findall(r"\$(\w+)", expression)
    if remaining:
        return {"valid": False, "error": f"存在未替换的参数: {', '.join(remaining)}"}
    try:
        compile(expression, "<factor_expression>", "eval")
    except SyntaxError as e:
        return {"valid": False, "error": f"语法错误: {e}"}
    try:
        dummy_df = pd.DataFrame(
            {
                "open": [10.0, 10.5, 11.0],
                "close": [10.5, 11.0, 10.8],
                "high": [11.0, 11.5, 11.2],
                "low": [10.0, 10.2, 10.5],
                "volume": [100000.0, 120000.0, 110000.0],
                "amount": [1050000.0, 1320000.0, 1188000.0],
                "ma60": [10.2, 10.3, 10.4],
            }
        )
        context = _build_eval_context(dummy_df)
        eval(expression, {"__builtins__": _SAFE_BUILTINS}, context)
    except NameError as e:
        return {"valid": False, "error": f"未定义的变量或函数: {e}"}
    except Exception as e:
        error_msg = str(e)
        if any(
            k in error_msg.lower() for k in ("window", "min_periods", "nan", "division")
        ):
            return {"valid": True, "error": None}
        return {"valid": False, "error": f"执行错误: {error_msg}"}
    return {"valid": True, "error": None}


def evaluate_factor(
    expression: str, df: pd.DataFrame, params: dict = None, output_type: str = "scalar"
) -> pd.Series:
    """在单只股票的 DataFrame 上计算因子值"""
    if params is None:
        params = {}
    _check_dangerous(expression)
    expression = _replace_params(expression, params)
    context = _build_eval_context(df)
    result = eval(expression, {"__builtins__": _SAFE_BUILTINS}, context)
    if isinstance(result, (int, float)):
        result = pd.Series([result] * len(df), index=df.index)
    elif isinstance(result, np.ndarray):
        result = pd.Series(result, index=df.index)
    elif not isinstance(result, pd.Series):
        result = pd.Series(result, index=df.index)
    return result


def _get_stock_data_from_db(code: str, db: Session, days: int = 365) -> pd.DataFrame:
    """从数据库读取单只股票的日线数据"""
    cutoff_date = (datetime.now() - timedelta(days=days)).date()
    records = (
        db.query(DailyPrice)
        .filter(DailyPrice.stock_code == code, DailyPrice.date >= cutoff_date)
        .order_by(DailyPrice.date.asc())
        .all()
    )
    if not records:
        return pd.DataFrame()
    data = [
        {
            "date": r.date,
            "open": float(r.open or 0),
            "close": float(r.close or 0),
            "high": float(r.high or 0),
            "low": float(r.low or 0),
            "volume": float(r.volume or 0),
            "amount": float(r.amount or 0),
            "ma60": float(r.ma60 or 0),
        }
        for r in records
    ]
    return pd.DataFrame(data)


def _evaluate_one_stock(
    stock_info, expression, params, output_type, filter_min, filter_max, days=365
):
    """单只股票因子计算任务 (用于并发)"""
    code, name = stock_info
    if "ST" in (name or "") or "退" in (name or "") or code.startswith("8"):
        return None
    db = SessionLocal()
    try:
        df = _get_stock_data_from_db(code, db, days=days)
        if df.empty or len(df) < 10:
            return None
        factor_series = evaluate_factor(expression, df, params, output_type)
        if factor_series is None or len(factor_series) == 0:
            return None
        latest_value = factor_series.iloc[-1]
        if pd.isna(latest_value):
            return None
        latest_value = float(latest_value)
        if output_type == "boolean":
            if latest_value <= 0.5:
                return None
        else:
            if filter_min is not None and latest_value < filter_min:
                return None
            if filter_max is not None and latest_value > filter_max:
                return None
        return {"code": code, "name": name, "value": round(latest_value, 4)}
    except Exception:
        return None
    finally:
        db.close()


def _stock_market_matches(stock: Stock, market_code: str) -> bool:
    status = str(getattr(stock, "data_status", None) or "active").strip().lower()
    if status in {"no_rows", "error", "delisted", "skipped"}:
        return False
    market = str(market_code or "CN").strip().upper()
    code_market = data_sources.equity_market(stock.code or "")
    board = str(stock.board or "").lower()
    area = str(stock.area or "").lower()
    meta_hk = any(token in board or token in area for token in ["港", "hk", "hong kong"])
    meta_us = any(
        token in board or token in area
        for token in ["美股", "美国", "us", "united states"]
    )
    if market == "HK":
        return code_market == "HK" or meta_hk
    if market == "US":
        return code_market == "US" or meta_us
    return code_market == "CN" and not meta_hk and not meta_us


def evaluate_factor_for_all(
    expression: str,
    params: dict = None,
    output_type: str = "scalar",
    filter_min: float = None,
    filter_max: float = None,
    limit: int = None,
    market: str = "CN",
) -> list:
    """批量遍历指定市场计算因子值。"""
    if params is None:
        params = {}
    db = SessionLocal()
    try:
        market_code = str(market or "CN").strip().upper()
        stocks = [
            stock for stock in db.query(Stock).all()
            if _stock_market_matches(stock, market_code)
        ]
        stock_infos = [(s.code, s.name) for s in stocks]
    finally:
        db.close()
    results = []
    max_workers = 8
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                _evaluate_one_stock,
                info,
                expression,
                params,
                output_type,
                filter_min,
                filter_max,
            ): info
            for info in stock_infos
        }
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            if res is not None:
                results.append(res)
    results.sort(key=lambda x: x["value"], reverse=True)
    if limit:
        results = results[:limit]
    return results
