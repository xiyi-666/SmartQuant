import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models import Stock, DailyPrice
from database import SessionLocal
import concurrent.futures
from tqdm import tqdm

# --- 核心选股逻辑 ---
UNAVAILABLE_STOCK_DATA_STATUSES = {"no_rows", "error", "delisted", "skipped"}


def stock_data_available(stock: Stock) -> bool:
    status = str(getattr(stock, "data_status", None) or "active").strip().lower()
    return status not in UNAVAILABLE_STOCK_DATA_STATUSES

def get_stock_data_from_db(code: str, db: Session, days: int | None = 365) -> pd.DataFrame:
    """
    仅从数据库读取数据，不进行任何 API 调用
    """
    query = db.query(DailyPrice).filter(DailyPrice.stock_code == code)
    if days is not None and days > 0:
        cutoff_date = (datetime.now() - timedelta(days=days)).date()
        query = query.filter(DailyPrice.date >= cutoff_date)
    records = query.order_by(DailyPrice.date.asc()).all()
    
    if not records:
        return pd.DataFrame()
        
    data = [{
        '日期': r.date, # 保持为 date 对象方便后续比较，或者统一转字符串
        '开盘': r.open,
        '收盘': r.close,
        '最高': r.high,
        '最低': r.low,
        '成交量': r.volume,
        '成交额': r.amount,
        '振幅': r.amplitude,
        '涨跌幅': r.change_pct,
        '涨跌额': r.change_amount,
        '换手率': r.turnover_rate,
    } for r in records]
    
    return pd.DataFrame(data)

def check_condition_1_ma60(df: pd.DataFrame, params: dict) -> bool:
    """条件1: 60日线附近，上下10-15%，优先考虑压线附近的需保持上涨通道"""
    ma_days = params.get("ma_days", 60)
    # 避免 SettingWithCopyWarning
    df = df.copy()
    df[f'MA{ma_days}'] = df['收盘'].rolling(window=ma_days).mean()

    if len(df) < ma_days: return False

    last_close = df['收盘'].iloc[-1]
    last_ma = df[f'MA{ma_days}'].iloc[-1]

    if last_ma == 0 or pd.isna(last_ma): return False

    proximity = abs(last_close - last_ma) / last_ma
    if proximity > params.get("ma_proximity_threshold", 0.15):
        return False

    ma_trend_days = params.get("ma_trend_days", 5)
    if len(df) < ma_days + ma_trend_days: return False

    ma_n_days_ago = df[f'MA{ma_days}'].iloc[-ma_trend_days]
    if last_ma <= ma_n_days_ago:
        return False

    return True

def check_condition_2_volume_spike(df: pd.DataFrame, params: dict) -> bool:
    """条件2: 短期放量"""
    check_days = params.get("volume_check_days", 30)
    spike_ratio = params.get("volume_spike_ratio", 2.0)
    required_valid_days = params.get("post_spike_days_count", 5)

    if len(df) < check_days + 1: return False

    window_df = df.tail(check_days + 1).copy().reset_index(drop=True)

    for i in range(1, len(window_df)):
        current_vol = window_df['成交量'].iloc[i]
        prev_vol = window_df['成交量'].iloc[i-1]

        if prev_vol == 0: continue

        if current_vol >= prev_vol * spike_ratio:
            post_spike_df = window_df.iloc[i+1:]
            valid_days_count = (post_spike_df['成交量'] > prev_vol).sum()

            if valid_days_count >= required_valid_days:
                return True

    return False

def check_condition_3_yin_no_fall(df: pd.DataFrame, params: dict) -> bool:
    """条件3: 连阴不跌"""
    check_days = params.get("yin_yang_check_days", 20)
    if len(df) < check_days: return False

    recent_df = df.tail(check_days).copy()

    start_price = recent_df['收盘'].iloc[0]
    end_price = recent_df['收盘'].iloc[-1]
    if end_price <= start_price: return False

    yin_candles = (recent_df['收盘'] < recent_df['开盘']).sum()
    yang_candles = (recent_df['收盘'] > recent_df['开盘']).sum()

    if yin_candles <= yang_candles: return False

    return True

def check_condition_4_deviation_strategy(df: pd.DataFrame, params: dict) -> bool:
    """条件4: 偏离值策略"""
    # 股价符合在20日线与60日线之间
    # 20日线的斜率大于15% (角度)
    
    ma_short_days = params.get("ma_short_days", 20)
    ma_long_days = params.get("ma_long_days", 60)
    
    if len(df) < ma_long_days: return False
    
    # Calculate MA20 and MA60
    # Avoid SettingWithCopyWarning
    df = df.copy()
    df[f'MA{ma_short_days}'] = df['收盘'].rolling(window=ma_short_days).mean()
    df[f'MA{ma_long_days}'] = df['收盘'].rolling(window=ma_long_days).mean()
    
    current_price = df['收盘'].iloc[-1]
    ma_short = df[f'MA{ma_short_days}'].iloc[-1]
    ma_long = df[f'MA{ma_long_days}'].iloc[-1]
    prev_ma_short = df[f'MA{ma_short_days}'].iloc[-2]
    
    if pd.isna(ma_short) or pd.isna(ma_long) or pd.isna(prev_ma_short):
        return False
        
    # Condition 1: Price between MA20 and MA60
    min_ma = min(ma_short, ma_long)
    max_ma = max(ma_short, ma_long)
    
    if not (min_ma < current_price < max_ma):
        return False
        
    # Condition 2: MA20 Slope > 15 (degrees)
    # Using Angle formula: atan((current/prev - 1) * 100) * (180/PI)
    if prev_ma_short == 0: return False
    
    slope_angle = np.degrees(np.arctan((ma_short / prev_ma_short - 1) * 100))
    
    slope_threshold = params.get("slope_threshold", 15)
    if slope_angle <= slope_threshold:
        return False
        
    return True

def check_stock(df: pd.DataFrame, params: dict) -> dict:
    """
    检查股票是否符合选定的条件
    返回结果字典: {'passed': bool, 'details': list of passed conditions}
    """
    # 获取需要启用的条件列表，默认为全部启用
    enabled_conditions = params.get("enabled_conditions", ["ma60", "volume", "yin_yang"])
    # 匹配模式：'all' (满足所有启用条件) 或 'any' (满足任一启用条件)
    match_mode = params.get("match_mode", "all") 

    results = {}
    
    if "ma60" in enabled_conditions:
        results["ma60"] = check_condition_1_ma60(df, params)
    
    if "volume" in enabled_conditions:
        results["volume"] = check_condition_2_volume_spike(df, params)
        
    if "yin_yang" in enabled_conditions:
        results["yin_yang"] = check_condition_3_yin_no_fall(df, params)

    if "deviation" in enabled_conditions:
        results["deviation"] = check_condition_4_deviation_strategy(df, params)

    # 综合判断
    passed = False
    if not results:
        passed = False # 未选择任何条件
    elif match_mode == "all":
        passed = all(results.values())
    elif match_mode == "any":
        passed = any(results.values())
        
    return {
        "passed": passed,
        "results": results
    }

def process_one_stock_screen(stock_info, params):
    """
    单只股票筛选任务
    """
    code, name = stock_info
    
    if 'ST' in name or '退' in name or code.startswith('8'):
        return None

    db = SessionLocal()
    try:
        # 读取最近180天数据足够判断
        hist_df = get_stock_data_from_db(code, db, days=180)

        if hist_df.empty:
            return None

        check_res = check_stock(hist_df, params)
        
        if check_res['passed']:
            # 计算一些辅助展示数据
            last_close = hist_df['收盘'].iloc[-1]
            ma60_val = 0
            if "ma60" in params.get("enabled_conditions", []):
                # 重新计算一下MA60用于展示
                # 也可以在 check_condition 中返回，这里为了解耦简单重算
                ma_days = params.get("ma_days", 60)
                if len(hist_df) >= ma_days:
                   ma60_val = hist_df['收盘'].rolling(window=ma_days).mean().iloc[-1]

            return {
                "代码": code,
                "名称": name,
                "最新价": last_close,
                "MA60": ma60_val,
                "匹配条件": [k for k, v in check_res['results'].items() if v]
            }
            
    except Exception as e:
        # print(f"Error screening {code}: {e}")
        pass
    finally:
        db.close()
    
    return None

def run_screener_task(params: dict = None):
    """
    执行筛选的主入口
    """
    if params is None:
        params = {}
    
    # 设置默认参数
    default_params = {
        "ma_days": 60,
        "ma_proximity_threshold": 0.15,
        "ma_trend_days": 20,
        "volume_check_days": 30,
        "volume_spike_ratio": 2.0,
        "post_spike_days_count": 5,
        "yin_yang_check_days": 30,
        "ma_short_days": 20,
        "ma_long_days": 60,
        "slope_threshold": 15,
        "enabled_conditions": ["ma60", "volume", "yin_yang"],
        "match_mode": "all"
    }
    
    # 合并参数
    final_params = {**default_params, **params}
    
    print(f"开始筛选... 模式: {final_params['match_mode']}, 条件: {final_params['enabled_conditions']}")

    db = SessionLocal()
    stocks = [stock for stock in db.query(Stock).all() if stock_data_available(stock)]
    db.close()
    
    stock_infos = [(s.code, s.name) for s in stocks]
    selected_stocks = []
    
    # CPU密集型任务，线程数可以多一点，因为主要是DB IO
    # 但由于SQLite的并发限制，还是保持适中
    max_workers = 8 
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(process_one_stock_screen, info, final_params) for info in stock_infos]
        
        for future in tqdm(concurrent.futures.as_completed(futures), total=len(futures), desc="筛选进度"):
            res = future.result()
            if res:
                selected_stocks.append(res)
                print(f" [命中] {res['名称']}({res['代码']}) - {res['匹配条件']}")

    return selected_stocks

if __name__ == "__main__":
    # 测试运行
    results = run_screener_task({
        "enabled_conditions": ["volume"], # 只测试放量
        "match_mode": "any"
    })
    print(f"\n共找到 {len(results)} 只股票")
