# -*- coding: utf-8 -*-
"""
预置因子定义
提供一批常用因子, 每个包含 name, display_name, category, expression, params_json,
output_type, default_filter, description, group_name
"""

import json


def get_builtin_factors() -> list:
    """返回所有预置因子定义列表"""
    return [
        # ===================================================================
        # 均线偏离类
        # ===================================================================
        {
            "name": "ma_deviation",
            "display_name": "均线偏离度",
            "category": "technical",
            "expression": "(close / MA(close, $ma_period) - 1) * 100",
            "params_json": json.dumps(
                [
                    {
                        "name": "ma_period",
                        "label": "均线周期",
                        "default": 60,
                        "min": 5,
                        "max": 250,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": -15, "max": 15}),
            "description": "股价相对于均线的偏离百分比。正值表示高于均线,负值表示低于均线。",
            "group_name": "均线偏离",
        },
        {
            "name": "ma60_gap",
            "display_name": "60日线偏离幅度",
            "category": "technical",
            "expression": "ABS((close - MA(close, 60)) / MA(close, 60)) * 100",
            "params_json": None,
            "output_type": "scalar",
            "default_filter": json.dumps({"min": 0, "max": 10}),
            "description": "股价与60日均线偏离的绝对值百分比,值越小越贴近均线。",
            "group_name": "均线偏离",
        },
        {
            "name": "ma_cross_signal",
            "display_name": "均线金叉信号",
            "category": "technical",
            "expression": "CROSS(MA(close, $short_period), MA(close, $long_period))",
            "params_json": json.dumps(
                [
                    {
                        "name": "short_period",
                        "label": "短周期",
                        "default": 5,
                        "min": 2,
                        "max": 30,
                        "step": 1,
                        "type": "int",
                    },
                    {
                        "name": "long_period",
                        "label": "长周期",
                        "default": 20,
                        "min": 10,
                        "max": 120,
                        "step": 1,
                        "type": "int",
                    },
                ]
            ),
            "output_type": "boolean",
            "default_filter": None,
            "description": "短期均线上穿长期均线形成金叉信号。值为1表示当日发生金叉。",
            "group_name": "均线偏离",
        },
        # ===================================================================
        # 量能类
        # ===================================================================
        {
            "name": "vol_ratio",
            "display_name": "量能比",
            "category": "technical",
            "expression": "MA(volume, $short_window) / MA(volume, $long_window)",
            "params_json": json.dumps(
                [
                    {
                        "name": "short_window",
                        "label": "短期窗口",
                        "default": 5,
                        "min": 2,
                        "max": 30,
                        "step": 1,
                        "type": "int",
                    },
                    {
                        "name": "long_window",
                        "label": "长期窗口",
                        "default": 20,
                        "min": 10,
                        "max": 120,
                        "step": 1,
                        "type": "int",
                    },
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": 1.5, "max": 10}),
            "description": "短期均量与长期均量之比,大于1表示近期放量,小于1表示缩量。",
            "group_name": "量能",
        },
        {
            "name": "volume_spike",
            "display_name": "成交量异动",
            "category": "technical",
            "expression": "volume / Ref(volume, $compare_days)",
            "params_json": json.dumps(
                [
                    {
                        "name": "compare_days",
                        "label": "对比天数",
                        "default": 1,
                        "min": 1,
                        "max": 10,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": 2, "max": 20}),
            "description": "当日成交量与N天前成交量的比值,大于2表示明显放量。",
            "group_name": "量能",
        },
        {
            "name": "obv_trend",
            "display_name": "OBV趋势",
            "category": "technical",
            "expression": "SUM(IF(close > Ref(close, 1), volume, -volume), $window)",
            "params_json": json.dumps(
                [
                    {
                        "name": "window",
                        "label": "窗口期",
                        "default": 20,
                        "min": 5,
                        "max": 60,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": 0}),
            "description": "N日内OBV(能量潮)累计值。正值表示期间买方力量占优。",
            "group_name": "量能",
        },
        # ===================================================================
        # 动量类
        # ===================================================================
        {
            "name": "momentum",
            "display_name": "动量指标",
            "category": "technical",
            "expression": "ROC(close, $window)",
            "params_json": json.dumps(
                [
                    {
                        "name": "window",
                        "label": "窗口期",
                        "default": 20,
                        "min": 5,
                        "max": 120,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": -5, "max": 20}),
            "description": "N日变动率,衡量价格变化的速度。正值表示上涨,负值表示下跌。",
            "group_name": "动量",
        },
        {
            "name": "rsi",
            "display_name": "RSI相对强弱",
            "category": "technical",
            "expression": "RSI(close, $window)",
            "params_json": json.dumps(
                [
                    {
                        "name": "window",
                        "label": "窗口期",
                        "default": 14,
                        "min": 5,
                        "max": 60,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": 20, "max": 80}),
            "description": "RSI相对强弱指标。低于30为超卖,高于70为超买。",
            "group_name": "动量",
        },
        {
            "name": "price_position",
            "display_name": "价格位置",
            "category": "technical",
            "expression": "(close - LLV(close, $window)) / (HHV(close, $window) - LLV(close, $window)) * 100",
            "params_json": json.dumps(
                [
                    {
                        "name": "window",
                        "label": "窗口期",
                        "default": 20,
                        "min": 5,
                        "max": 120,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": 0, "max": 100}),
            "description": "当前价格在N日高低点区间中的位置百分比。0=最低点,100=最高点。",
            "group_name": "动量",
        },
        # ===================================================================
        # 波动类
        # ===================================================================
        {
            "name": "volatility",
            "display_name": "波动率",
            "category": "statistical",
            "expression": "STD(close / Ref(close, 1) - 1, $window) * 100",
            "params_json": json.dumps(
                [
                    {
                        "name": "window",
                        "label": "窗口期",
                        "default": 20,
                        "min": 5,
                        "max": 120,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": 0, "max": 5}),
            "description": "N日收益率标准差(波动率)。值越大表示波动越剧烈。",
            "group_name": "波动",
        },
        {
            "name": "atr_pct",
            "display_name": "ATR占比",
            "category": "statistical",
            "expression": "ATR(high, low, close, $window) / close * 100",
            "params_json": json.dumps(
                [
                    {
                        "name": "window",
                        "label": "窗口期",
                        "default": 14,
                        "min": 5,
                        "max": 60,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": 0, "max": 5}),
            "description": "ATR占股价的百分比,衡量日内波幅相对于价格的水平。",
            "group_name": "波动",
        },
        {
            "name": "boll_width",
            "display_name": "布林带宽度",
            "category": "statistical",
            "expression": "BOLL_WIDTH(close, $window, $k)",
            "params_json": json.dumps(
                [
                    {
                        "name": "window",
                        "label": "窗口期",
                        "default": 20,
                        "min": 5,
                        "max": 60,
                        "step": 1,
                        "type": "int",
                    },
                    {
                        "name": "k",
                        "label": "标准差倍数",
                        "default": 2,
                        "min": 1,
                        "max": 4,
                        "step": 0.5,
                        "type": "float",
                    },
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": 0, "max": 20}),
            "description": "布林带宽度(上下轨差/中轨*100)。收窄可能预示变盘。",
            "group_name": "波动",
        },
        # ===================================================================
        # 复合类
        # ===================================================================
        {
            "name": "ma_proximity_uptrend",
            "display_name": "均线附近上涨通道",
            "category": "composite",
            "expression": "IF(ABS((close - MA(close, 60)) / MA(close, 60) * 100) < $proximity, 1, 0) * IF(MA(close, 5) > Ref(MA(close, 5), 5), 1, 0)",
            "params_json": json.dumps(
                [
                    {
                        "name": "proximity",
                        "label": "偏离阈值(%)",
                        "default": 10,
                        "min": 1,
                        "max": 30,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "boolean",
            "default_filter": None,
            "description": "同时满足:股价在60日均线附近(偏离<阈值%)且5日均线处于上升趋势。",
            "group_name": "复合",
        },
        {
            "name": "vol_breakout_momentum",
            "display_name": "放量突破动量",
            "category": "composite",
            "expression": "IF(MA(volume, 5) / MA(volume, 20) > $vol_threshold, 1, 0) * IF(ROC(close, 10) > $roc_threshold, 1, 0)",
            "params_json": json.dumps(
                [
                    {
                        "name": "vol_threshold",
                        "label": "量比阈值",
                        "default": 1.5,
                        "min": 1.0,
                        "max": 5.0,
                        "step": 0.1,
                        "type": "float",
                    },
                    {
                        "name": "roc_threshold",
                        "label": "动量阈值(%)",
                        "default": 3,
                        "min": 0,
                        "max": 20,
                        "step": 0.5,
                        "type": "float",
                    },
                ]
            ),
            "output_type": "boolean",
            "default_filter": None,
            "description": "同时满足:短期放量(5日均量/20日均量>阈值)且10日动量为正(>阈值%)。",
            "group_name": "复合",
        },
    ]


def get_factor_templates() -> list:
    """返回6个原子因子模板的参数定义"""
    return [
        {
            "name": "ma_deviation_template",
            "display_name": "均线偏离",
            "category": "technical",
            "expression": "(close / MA(close, $ma_period) - 1) * 100",
            "params_json": json.dumps(
                [
                    {
                        "name": "ma_period",
                        "label": "均线周期",
                        "default": 60,
                        "min": 5,
                        "max": 250,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": -15, "max": 15}),
            "description": "股价与均线的偏离百分比",
            "group_name": "模板",
        },
        {
            "name": "volume_ratio_template",
            "display_name": "量能比",
            "category": "technical",
            "expression": "MA(volume, $short_window) / MA(volume, $long_window)",
            "params_json": json.dumps(
                [
                    {
                        "name": "short_window",
                        "label": "短期窗口",
                        "default": 5,
                        "min": 2,
                        "max": 30,
                        "step": 1,
                        "type": "int",
                    },
                    {
                        "name": "long_window",
                        "label": "长期窗口",
                        "default": 20,
                        "min": 10,
                        "max": 120,
                        "step": 1,
                        "type": "int",
                    },
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": 1.5, "max": 10}),
            "description": "短期均量与长期均量之比",
            "group_name": "模板",
        },
        {
            "name": "momentum_template",
            "display_name": "动量指标",
            "category": "technical",
            "expression": "ROC(close, $window)",
            "params_json": json.dumps(
                [
                    {
                        "name": "window",
                        "label": "窗口期",
                        "default": 20,
                        "min": 5,
                        "max": 120,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": -5, "max": 20}),
            "description": "N日变动率",
            "group_name": "模板",
        },
        {
            "name": "volatility_template",
            "display_name": "波动率",
            "category": "statistical",
            "expression": "STD(close / Ref(close, 1) - 1, $window) * 100",
            "params_json": json.dumps(
                [
                    {
                        "name": "window",
                        "label": "窗口期",
                        "default": 20,
                        "min": 5,
                        "max": 120,
                        "step": 1,
                        "type": "int",
                    }
                ]
            ),
            "output_type": "scalar",
            "default_filter": json.dumps({"min": 0, "max": 5}),
            "description": "N日收益率标准差",
            "group_name": "模板",
        },
        {
            "name": "cross_signal_template",
            "display_name": "金叉信号",
            "category": "technical",
            "expression": "CROSS(MA(close, $short_period), MA(close, $long_period))",
            "params_json": json.dumps(
                [
                    {
                        "name": "short_period",
                        "label": "短周期",
                        "default": 5,
                        "min": 2,
                        "max": 30,
                        "step": 1,
                        "type": "int",
                    },
                    {
                        "name": "long_period",
                        "label": "长周期",
                        "default": 20,
                        "min": 10,
                        "max": 120,
                        "step": 1,
                        "type": "int",
                    },
                ]
            ),
            "output_type": "boolean",
            "default_filter": None,
            "description": "短期均线上穿长期均线",
            "group_name": "模板",
        },
        {
            "name": "composite_template",
            "display_name": "复合条件",
            "category": "composite",
            "expression": "IF(条件A, 1, 0) * IF(条件B, 1, 0)",
            "params_json": None,
            "output_type": "boolean",
            "default_filter": None,
            "description": "多条件组合: 两个条件同时满足时为1 (请替换条件A和条件B)",
            "group_name": "模板",
        },
    ]
