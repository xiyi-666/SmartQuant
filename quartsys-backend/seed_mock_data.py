#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QuartSys Mock 数据注入脚本 (快速版)
"""

import os
import sys
import json
import random
from datetime import datetime, timedelta, date

from database import SessionLocal, engine, Base
from models import (
    User, Agent, AgentSimulationAccount, AgentPosition, AgentTradeRecord,
    AgentDailyPerformance, Stock, DailyPrice, StrategyParams, FactorPreset,
    ScreeningResult, Watchlist, SimulationAccount, SimulationPosition,
    SimulationTradeRecord, LLMConfig, AIInsightTask, MarketTemperature,
    AlphaRecommendation, PositionAdvice, Strategy
)
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def init_mock_data():
    db = SessionLocal()
    try:
        print("=" * 60)
        print("🚀 QuartSys Mock 数据注入 (快速版)")
        print("=" * 60)
        print()

        # 1. 创建用户
        print("📝 [1/9] 创建用户...")
        user = db.query(User).filter(User.username == "admin").first()
        if not user:
            user = User(
                username="admin", email="admin@quartsys.io", password_hash=pwd_context.hash("admin")
            )
            db.add(user)
            db.flush()
        print(f"   ✅ 用户: {user.username}")

        # 2. 创建股票数据
        print()
        print("📝 [2/9] 创建股票数据...")
        stock_list = [
            ("600519", "贵州茅台", "白酒", "贵州"),
            ("000001", "平安银行", "银行", "广东"),
            ("601318", "中国平安", "保险", "广东"),
            ("300750", "宁德时代", "新能源", "福建"),
            ("000858", "五粮液", "白酒", "四川"),
            ("002594", "比亚迪", "新能源", "广东"),
        ]
        for code, name, industry, area in stock_list:
            existing = db.query(Stock).filter(Stock.code == code).first()
            if not existing:
                stock = Stock(code=code, name=name, industry=industry, area=area)
                db.add(stock)
                print(f"   ✅ {code} {name}")
        db.commit()

        # 3. 少量日线数据 (只30天，足够展示)
        print()
        print("📝 [3/9] 创建日线数据 (快速版: 30天)...")
        stocks = db.query(Stock).all()
        base_date = date.today() - timedelta(days=60)
        count = 0
        for stock in stocks:
            price = random.uniform(10, 800)
            for days in range(30):
                curr_date = base_date + timedelta(days=days)
                existing = db.query(DailyPrice).filter(
                    DailyPrice.stock_code == stock.code,
                    DailyPrice.date == curr_date
                ).first()
                if existing:
                    continue

                change = random.uniform(-0.05, 0.05)
                open_p = price
                close_p = price * (1 + change)
                high_p = max(open_p, close_p) * 1.02
                low_p = min(open_p, close_p) * 0.98
                volume = random.randint(100000, 10000000)
                ma60 = price * random.uniform(0.97, 1.03)
                dp = DailyPrice(
                    stock_code=stock.code, date=curr_date, open=open_p,
                    close=close_p, high=high_p, low=low_p, volume=volume, ma60=ma60
                )
                db.add(dp)
                price = close_p
                count += 1
        db.commit()
        print(f"   ✅ 新增 {count} 条日线数据 (30天/只)")

        # 4. 创建模拟账户与持仓
        print()
        print("📝 [4/9] 创建模拟账户与持仓...")
        account = db.query(SimulationAccount).filter(SimulationAccount.user_id == user.id).first()
        if not account:
            account = SimulationAccount(
                user_id=user.id, balance=6234567.89, frozen_balance=0, total_assets=9876543.21
            )
            db.add(account)
            db.flush()

        db.query(SimulationPosition).filter(SimulationPosition.account_id == account.id).delete()
        positions = [
            ("600519", "贵州茅台", 200, 1850, 1920),
            ("000001", "平安银行", 15000, 12.5, 13.25),
            ("300750", "宁德时代", 600, 180, 175.8),
        ]
        for code, name, qty, avg, curr in positions:
            pos = SimulationPosition(
                account_id=account.id, stock_code=code, stock_name=name,
                quantity=qty, avg_price=avg, current_price=curr,
                market_value=qty * curr
            )
            db.add(pos)
        db.commit()
        print(f"   ✅ {len(positions)} 个持仓")

        # 5. 创建交易记录
        print()
        print("📝 [5/9] 创建交易记录...")
        db.query(SimulationTradeRecord).filter(SimulationTradeRecord.account_id == account.id).delete()
        for i, (code, name, typ, price, qty, amount) in enumerate([
            ("600519", "贵州茅台", "buy", 1800, 100, 180000),
            ("000001", "平安银行", "buy", 12, 10000, 120000),
        ]):
            record = SimulationTradeRecord(
                account_id=account.id, stock_code=code, stock_name=name, trade_type=typ,
                price=price, quantity=qty, amount=amount, fee=max(5, amount*0.0001),
                trade_time=datetime.now() - timedelta(days=10-i)
            )
            db.add(record)
        db.commit()
        print("   ✅ 交易记录")

        # 6. 创建自选分组
        print()
        print("📝 [6/9] 创建自选分组...")
        watch_list = [
            ("价值股", "rgb(66,153,225)", [("600519","贵州茅台"), ("000001","平安银行")]),
            ("成长股", "rgb(255,159,64)", [("300750","宁德时代"), ("002594","比亚迪")]),
        ]
        for group_name, color, items in watch_list:
            db.query(Watchlist).filter(Watchlist.group_name == group_name).delete()
            for code, name in items:
                wl = Watchlist(
                    group_name=group_name, code=code, name=name,
                    added_at=(datetime.now() - timedelta(days=random.randint(1,10))).isoformat(),
                    color=color
                )
                db.add(wl)
        db.commit()
        print("   ✅ 自选分组")

        # 7. 创建因子预设
        print()
        print("📝 [7/9] 创建因子预设...")
        for name, config in [
            ("低估值选股", [{"factor":"pe_ratio", "params":{"min":0, "max":30}}, {"factor":"pb_ratio", "params":{"min":0, "max":2.5}}]),
            ("成长优先", [{"factor":"roe", "params":{"min":15, "max":100}}]),
        ]:
            existing = db.query(FactorPreset).filter(FactorPreset.name == name).first()
            if existing:
                existing.config_json = json.dumps(config)
            else:
                existing = FactorPreset(name=name, config_json=json.dumps(config))
                db.add(existing)
        db.commit()
        print("   ✅ 因子预设")

        # 8. 创建 Agents 和绩效
        print()
        print("📝 [8/9] 创建 Agents...")
        for name, typ in [("量化王者", "trend"), ("AI交易员", "ai"), ("网格大师", "grid")]:
            agent = db.query(Agent).filter(Agent.name == name).first()
            if not agent:
                agent = Agent(user_id=user.id, name=name, agent_type=typ, status="stopped")
                db.add(agent)
                db.flush()

            # 绩效数据
            db.query(AgentDailyPerformance).filter(AgentDailyPerformance.agent_id == agent.id).delete()
            base_assets = 1000000.0
            curr_assets = base_assets
            for i in range(90):
                daily_return_pct = random.uniform(-3, 4)
                curr_assets = curr_assets * (1 + daily_return_pct / 100)
                perf = AgentDailyPerformance(
                    agent_id=agent.id,
                    date=date.today() - timedelta(days=89 - i),
                    total_assets=curr_assets, daily_return=daily_return_pct
                )
                db.add(perf)

            agent.status = "running" if random.random() > 0.3 else "stopped"
        db.commit()
        print("   ✅ Agents")

        # 9. 创建策略、市场温度、AI洞察、Alpha推荐
        print()
        print("📝 [9/9] 创建策略、市场数据...")
        # 市场温度
        db.query(MarketTemperature).delete()
        db.add(MarketTemperature(
            rise_count=1856, fall_count=2145, avg_change=-0.45, avg_rise=2.18, avg_fall=-2.35,
            heatmap_data=json.dumps({"科技":-0.8, "金融":-0.2, "消费":0.3, "周期":-1.2})
        ))
        # AI洞察
        db.query(AIInsightTask).delete()
        db.add(AIInsightTask(
            status="done", summary="当前市场整体处于震荡磨底阶段，建议控制仓位、均衡配置。",
            dimensions=json.dumps({"policy":7.2, "liquidity":5.8, "sentiment":4.5, "global":6.3, "economy":5.2}),
            analysis_list=json.dumps([{"dimension":"policy","score":7.2,"text":"政策面积极"}])
        ))
        # Alpha推荐
        db.query(AlphaRecommendation).delete()
        for data in [
            ("成长精选", "600519", "贵州茅台", 5, "业绩稳健", 1800, 1700, 2000),
            ("低吸策略", "000001", "平安银行", 4, "估值低位", 12.5, 11, 15),
        ]:
            db.add(AlphaRecommendation(
                strategy_name=data[0], stock_code=data[1], stock_name=data[2], stars=data[3],
                ai_logic=data[4], buy_price=data[5], stop_loss=data[6], target_price=data[7]
            ))
        # 仓位建议
        db.query(PositionAdvice).delete()
        db.add(PositionAdvice(
            position_ratio=0.65, status="done",
            attack_industries=json.dumps(["科技", "新能源"]),
            defense_industries=json.dumps(["金融", "公用事业"]),
            neutral_assessment="当前整体处于可接受风险水平，建议中等仓位。"
        ))
        # 策略
        for name in ["MA60策略", "RSI策略"]:
            if not db.query(Strategy).filter(Strategy.name == name).first():
                db.add(Strategy(name=name, code=f"# {name}\n"))
        # LLM配置
        if not db.query(LLMConfig).first():
            db.add(LLMConfig(provider="openai", model="deepseek-v4-flash", api_key="", base_url=""))
        # 策略参数
        if not db.query(StrategyParams).filter(StrategyParams.id == 1).first():
            db.add(StrategyParams(
                id=1, params_json=json.dumps({"ma_days":60, "enabled_conditions":["ma60", "volume"]})
            ))
        db.commit()
        print("   ✅ 其他数据")

        print()
        print("=" * 60)
        print("🎉 Mock 数据注入完成！")
        print("=" * 60)
        print()
        print("📌 启动:")
        print("   1. python main.py")
        print("   2. cd ../quartsys-fronted && npm run dev")
        print("   3. http://127.0.0.1:15473")
        print("   4. 账号: admin / admin")
        print()
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    init_mock_data()
