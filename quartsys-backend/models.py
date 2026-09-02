from database import Base
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String)
    role = Column(String, default="normal")  # normal | vip | svip | admin
    permission_overrides_json = Column(Text, nullable=True)
    avatar_url = Column(Text, nullable=True)
    phone_country_code = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    phone_e164 = Column(String, unique=True, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuthIdentity(Base):
    __tablename__ = "auth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="uix_auth_provider_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String, nullable=False, index=True)
    provider_user_id = Column(String, nullable=False, index=True)
    email = Column(String, nullable=True)
    display_name = Column(String, nullable=True)
    avatar_url = Column(Text, nullable=True)
    raw_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PasskeyCredential(Base):
    __tablename__ = "passkey_credentials"
    __table_args__ = (
        UniqueConstraint("credential_id", name="uix_passkey_credential_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    credential_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=True)
    public_key = Column(Text, nullable=True)
    sign_count = Column(Integer, default=0)
    transports_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)


class UserCheckin(Base):
    __tablename__ = "user_checkins"
    __table_args__ = (
        UniqueConstraint("user_id", "checkin_date", name="uix_user_checkin_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    checkin_date = Column(Date, nullable=False, index=True)
    credits_awarded = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Agent(Base):
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)
    group_name = Column(String)
    icon = Column(String, nullable=True)
    agent_type = Column(String, default="simulation")  # 'backtest' or 'simulation'
    strategy_config = Column(Text)  # JSON string
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="stopped")  # stopped, pending, running, stopping, failed, completed
    status_reason = Column(String, nullable=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    account = relationship(
        "AgentSimulationAccount", back_populates="agent", uselist=False
    )


class AgentSimulationAccount(Base):
    __tablename__ = "agent_simulation_accounts"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"))
    balance = Column(Float, default=1000000.0)
    frozen_balance = Column(Float, default=0.0)
    total_assets = Column(Float, default=1000000.0)

    agent = relationship("Agent", back_populates="account")


class AgentPosition(Base):
    __tablename__ = "agent_positions"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("agent_simulation_accounts.id"))
    stock_code = Column(String)
    stock_name = Column(String)
    quantity = Column(Integer, default=0)
    avg_price = Column(Float, default=0.0)
    current_price = Column(Float, default=0.0)
    market_value = Column(Float, default=0.0)


class AgentTradeRecord(Base):
    __tablename__ = "agent_trade_records"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("agent_simulation_accounts.id"))
    stock_code = Column(String)
    stock_name = Column(String)
    trade_type = Column(String)  # buy/sell
    price = Column(Float)
    quantity = Column(Integer)
    amount = Column(Float)
    fee = Column(Float, default=0.0)
    trade_time = Column(DateTime(timezone=True), server_default=func.now())


class AgentDailyPerformance(Base):
    __tablename__ = "agent_daily_performance"

    id = Column(Integer, primary_key=True)
    agent_id = Column(Integer, ForeignKey("agents.id"))
    date = Column(Date)
    total_assets = Column(Float)
    daily_return = Column(Float)  # Percent
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FailedStock(Base):
    __tablename__ = "failed_stock_list"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    reason = Column(String, nullable=True)
    failed_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Stock(Base):
    __tablename__ = "stocks"

    code = Column(String, primary_key=True, index=True)  # 股票代码
    name = Column(String)  # 股票名称
    asset_type = Column(String, default="stock", index=True)  # stock/etf/fund/reit/trust/bond/convertible_bond/derivative
    market = Column(String, default="CN", index=True)  # CN | HK | US
    exchange = Column(String, nullable=True)  # SSE/SZSE/BSE/HKEX/NASDAQ/NYSE/AMEX
    currency = Column(String, nullable=True)  # CNY/HKD/USD
    industry = Column(String, nullable=True)  # 行业
    sector = Column(String, nullable=True)  # 市场板块/一级分类
    concepts_json = Column(Text, nullable=True)  # JSON array, especially HK/US themes
    board = Column(String, nullable=True)  # 上市板块
    area = Column(String, nullable=True)  # 地区
    pe_ratio = Column(Float, nullable=True)  # 市盈率
    pb_ratio = Column(Float, nullable=True)  # 市净率
    market_cap = Column(Float, nullable=True)  # 总市值（亿元）
    circulating_market_cap = Column(Float, nullable=True)  # 流通市值（亿元）
    roe = Column(Float, nullable=True)  # 净资产收益率
    data_status = Column(String, default="active", index=True)  # active/no_rows/error/delisted/skipped
    data_status_reason = Column(Text, nullable=True)  # 最近一次不可更新/不可检索原因
    data_status_at = Column(DateTime(timezone=True), nullable=True)
    delisted_at = Column(Date, nullable=True)  # 退市或最后可用交易日期

    # 关联日线数据
    daily_prices = relationship("DailyPrice", back_populates="stock")


class DailyPrice(Base):
    __tablename__ = "daily_prices"

    id = Column(Integer, primary_key=True, index=True)
    stock_code = Column(String, ForeignKey("stocks.code"), index=True)
    date = Column(Date, index=True)

    open = Column(Float)
    close = Column(Float)
    high = Column(Float)
    low = Column(Float)
    volume = Column(Float)  # 成交量
    amount = Column(Float, nullable=True)  # 成交额
    amplitude = Column(Float, nullable=True)  # 振幅
    change_pct = Column(Float, nullable=True)  # 涨跌幅
    change_amount = Column(Float, nullable=True)  # 涨跌额
    turnover_rate = Column(Float, nullable=True)  # 换手率

    # 均线数据 (可选，或实时计算)
    ma60 = Column(Float, nullable=True)

    stock = relationship("Stock", back_populates="daily_prices")

    # 联合唯一索引
    __table_args__ = (UniqueConstraint("stock_code", "date", name="uix_stock_date"),)


class StrategyParams(Base):
    __tablename__ = "strategy_params_sql"

    id = Column(Integer, primary_key=True)
    params_json = Column(Text)


class FactorPreset(Base):
    __tablename__ = "factor_filter_presets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    config_json = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ScreeningResult(Base):
    __tablename__ = "screening_results_sql"

    id = Column(Integer, primary_key=True)
    date = Column(Date, index=True)
    code = Column(String)
    name = Column(String)
    price = Column(Float)
    ma60 = Column(Float)


class ScreenerTask(Base):
    """User-isolated background screening request and its persisted result."""

    __tablename__ = "screener_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    market = Column(String, default="CN", nullable=False, index=True)
    status = Column(String, default="pending", nullable=False, index=True)
    request_json = Column(Text, nullable=False)
    result_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    requested_date = Column(String, nullable=True, index=True)
    effective_date = Column(String, nullable=True, index=True)
    # Durable queue metadata. Legacy inline tasks keep queue_status=inline.
    queue_task_id = Column(String, nullable=True, index=True)
    queue_payload_json = Column(Text, nullable=True)
    queue_status = Column(String, default="inline", nullable=False, index=True)
    queue_priority = Column(Integer, default=10, nullable=False, index=True)
    attempt_count = Column(Integer, default=0, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    heartbeat_at = Column(DateTime(timezone=True), nullable=True, index=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    failure_class = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Watchlist(Base):
    __tablename__ = "watchlist_sql"

    id = Column(Integer, primary_key=True)
    group_name = Column(String)
    code = Column(String)
    name = Column(String)
    added_at = Column(String)
    # 新增颜色字段，存储 RGB 字符串，例如 "rgb(255, 0, 0)"
    color = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)


class SimulationAccount(Base):
    __tablename__ = "simulation_account"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Linked to User
    market = Column(String, default="CN", nullable=False, index=True)
    currency = Column(String, default="CNY", nullable=False)
    balance = Column(Float, default=10000000.0)  # 初始资金 1000 万
    frozen_balance = Column(Float, default=0.0)  # 冻结资金 (挂单未成交部分)
    total_assets = Column(Float, default=10000000.0)  # 总资产 (余额 + 持仓市值)


class SimulationPosition(Base):
    __tablename__ = "simulation_positions"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("simulation_account.id"))
    stock_code = Column(String)
    stock_name = Column(String)
    quantity = Column(Integer, default=0)  # 持仓数量
    avg_price = Column(Float, default=0.0)  # 持仓均价
    current_price = Column(Float, default=0.0)  # 最新价 (需定期更新)
    market_value = Column(Float, default=0.0)  # 市值


class SimulationTradeRecord(Base):
    __tablename__ = "simulation_trade_records"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("simulation_account.id"))
    stock_code = Column(String)
    stock_name = Column(String)
    trade_type = Column(String)  # "buy" or "sell"
    price = Column(Float)
    quantity = Column(Integer)
    amount = Column(Float)  # 交易金额
    fee = Column(Float, default=0.0)  # 手续费
    trade_time = Column(DateTime(timezone=True), server_default=func.now())


class StrategyAutomation(Base):
    __tablename__ = "strategy_automations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    strategy_id = Column(Integer, ForeignKey("strategies.id"), nullable=False, index=True)
    market = Column(String, default="CN", nullable=False, index=True)
    name = Column(String, nullable=False)
    status = Column(String, default="stopped", index=True)  # stopped/running/failed
    stock_pool_json = Column(Text, nullable=True)
    factor_specs_json = Column(Text, nullable=True)
    max_positions = Column(Integer, default=5)
    per_trade_amount = Column(Float, default=100000.0)
    max_position_pct = Column(Float, default=20.0)
    run_interval_minutes = Column(Integer, default=5)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    last_result_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class LLMConfig(Base):
    __tablename__ = "llm_config"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    provider = Column(String, default="openai")  # openai/anthropic/google/custom
    model = Column(String, default="gpt-4o-mini")
    api_key = Column(String, nullable=True)
    base_url = Column(String, nullable=True)  # custom provider only
    module_models_json = Column(Text, nullable=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class UserSetting(Base):
    __tablename__ = "user_settings"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uix_user_setting_key"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    key = Column(String, nullable=False, index=True)
    value_json = Column(Text, nullable=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value_json = Column(Text, nullable=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    role = Column(String, default="normal")
    price_cents = Column(Integer, default=0)
    currency = Column(String, default="CNY")
    interval = Column(String, default="month")
    credits = Column(Integer, default=0)
    enabled = Column(Integer, default=1)
    sort_order = Column(Integer, default=100)
    features_json = Column(Text, nullable=True)
    stripe_price_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SubscriptionOrder(Base):
    __tablename__ = "subscription_orders"

    id = Column(Integer, primary_key=True)
    trade_no = Column(String, unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=False)
    provider = Column(String, nullable=False)
    amount_cents = Column(Integer, default=0)
    currency = Column(String, default="CNY")
    status = Column(String, default="pending", index=True)
    provider_trade_no = Column(String, nullable=True)
    provider_payload = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    paid_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    plan = relationship("SubscriptionPlan")


class CreditRechargeOrder(Base):
    __tablename__ = "credit_recharge_orders"

    id = Column(Integer, primary_key=True)
    trade_no = Column(String, unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String, nullable=False)
    amount_cents = Column(Integer, default=0)
    credits = Column(Integer, default=0)
    currency = Column(String, default="CNY")
    status = Column(String, default="pending", index=True)
    provider_trade_no = Column(String, nullable=True)
    provider_payload = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    paid_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AdRewardSession(Base):
    __tablename__ = "ad_reward_sessions"
    __table_args__ = (
        UniqueConstraint("provider", "provider_event_id", name="uix_ad_reward_provider_event"),
    )

    id = Column(Integer, primary_key=True)
    session_token = Column(String, unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String, nullable=False, index=True)
    reward_credits = Column(Integer, default=0)
    status = Column(String, default="pending", index=True)
    provider_event_id = Column(String, nullable=True, index=True)
    meta_json = Column(Text, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    granted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AdEvent(Base):
    __tablename__ = "ad_events"

    id = Column(Integer, primary_key=True)
    placement_key = Column(String, nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    ad_name = Column(String, nullable=True)
    platform = Column(String, nullable=True, index=True)
    sponsor_index = Column(Integer, nullable=True)
    href = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_key = Column(String, nullable=True, index=True)
    user_agent = Column(Text, nullable=True)
    ip_hash = Column(String, nullable=True, index=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class RedeemCode(Base):
    __tablename__ = "redeem_codes"

    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=False, index=True)
    plan_key = Column(String, nullable=True, index=True)
    plan_name = Column(String, nullable=True)
    credits = Column(Integer, default=0)
    duration_days = Column(Integer, nullable=True)
    max_uses = Column(Integer, default=1)
    used_count = Column(Integer, default=0)
    per_user_limit = Column(Integer, default=1)
    enabled = Column(Integer, default=1, index=True)
    description = Column(Text, nullable=True)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    plan = relationship("SubscriptionPlan")


class RedeemCodeUse(Base):
    __tablename__ = "redeem_code_uses"

    id = Column(Integer, primary_key=True)
    code_id = Column(Integer, ForeignKey("redeem_codes.id"), nullable=False, index=True)
    code = Column(String, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subscription_id = Column(Integer, ForeignKey("user_subscriptions.id"), nullable=True, index=True)
    ip_hash = Column(String, nullable=True, index=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    redeem_code = relationship("RedeemCode")
    subscription = relationship("UserSubscription")


class AnalyticsSession(Base):
    __tablename__ = "analytics_sessions"
    __table_args__ = (
        UniqueConstraint("session_key", name="uix_analytics_session_key"),
    )

    id = Column(Integer, primary_key=True)
    session_key = Column(String, nullable=False, unique=True, index=True)
    visitor_key = Column(String, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    duration_seconds = Column(Float, default=0.0)
    page_count = Column(Integer, default=0)
    is_returning = Column(Boolean, default=False)
    source_type = Column(String, nullable=True, index=True)
    source = Column(String, nullable=True)
    device_type = Column(String, nullable=True, index=True)
    browser = Column(String, nullable=True, index=True)
    os = Column(String, nullable=True, index=True)
    region = Column(String, nullable=True, index=True)
    ip_hash = Column(String, nullable=True, index=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AnalyticsPageView(Base):
    __tablename__ = "analytics_page_views"

    id = Column(Integer, primary_key=True)
    session_key = Column(String, nullable=False, index=True)
    visitor_key = Column(String, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    path = Column(Text, nullable=False)
    title = Column(String, nullable=True)
    referrer = Column(Text, nullable=True)
    source_type = Column(String, nullable=True, index=True)
    source = Column(String, nullable=True)
    device_type = Column(String, nullable=True, index=True)
    browser = Column(String, nullable=True, index=True)
    os = Column(String, nullable=True, index=True)
    region = Column(String, nullable=True, index=True)
    duration_seconds = Column(Float, default=0.0)
    is_entry = Column(Boolean, default=False)
    is_exit = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class AnalyticsDailyStats(Base):
    __tablename__ = "analytics_daily_stats"
    __table_args__ = (
        UniqueConstraint("stat_date", name="uix_analytics_daily_stat_date"),
    )

    id = Column(Integer, primary_key=True)
    stat_date = Column(Date, nullable=False, unique=True, index=True)
    pv = Column(Integer, default=0)
    uv = Column(Integer, default=0)
    dau = Column(Integer, default=0)
    new_users = Column(Integer, default=0)
    avg_visit_seconds = Column(Float, default=0.0)
    bounce_rate = Column(Float, default=0.0)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AnalyticsModuleUsage(Base):
    __tablename__ = "analytics_module_usage"

    id = Column(Integer, primary_key=True)
    module_key = Column(String, nullable=False, index=True)
    module_label = Column(String, nullable=True)
    action = Column(String, nullable=True, index=True)
    path = Column(Text, nullable=True)
    success = Column(Boolean, default=True, index=True)
    result_count = Column(Integer, nullable=True)
    duration_ms = Column(Float, nullable=True)
    session_key = Column(String, nullable=True, index=True)
    visitor_key = Column(String, nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class AnalyticsApiLog(Base):
    __tablename__ = "analytics_api_logs"

    id = Column(Integer, primary_key=True)
    method = Column(String, nullable=False, index=True)
    path = Column(Text, nullable=False)
    status_code = Column(Integer, nullable=False, index=True)
    duration_ms = Column(Float, default=0.0, index=True)
    success = Column(Boolean, default=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_key = Column(String, nullable=True, index=True)
    visitor_key = Column(String, nullable=True, index=True)
    ip_hash = Column(String, nullable=True, index=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class CustomerServiceTicket(Base):
    __tablename__ = "customer_service_tickets"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=True)
    contact = Column(String, nullable=True, index=True)
    topic = Column(String, nullable=True, index=True)
    message = Column(Text, nullable=False)
    status = Column(String, default="open", index=True)
    user_agent = Column(Text, nullable=True)
    ip_hash = Column(String, nullable=True, index=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category = Column(String, default="product", nullable=False, index=True)
    subject = Column(String, nullable=False, index=True)
    message = Column(Text, nullable=False)
    status = Column(String, default="open", nullable=False, index=True)
    priority = Column(String, default="normal", nullable=False, index=True)
    admin_reply = Column(Text, nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    email_status = Column(String, default="not_sent", nullable=False, index=True)
    email_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=False)
    plan_key = Column(String, nullable=False, index=True)
    plan_name = Column(String, nullable=False)
    role = Column(String, default="normal")
    credits_total = Column(Integer, default=0)
    credits_used = Column(Integer, default=0)
    status = Column(String, default="active", index=True)
    source_order_no = Column(String, nullable=True, index=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    plan = relationship("SubscriptionPlan")


class CreditLedger(Base):
    __tablename__ = "credit_ledger"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subscription_id = Column(
        Integer, ForeignKey("user_subscriptions.id"), nullable=True, index=True
    )
    action = Column(String, nullable=False, index=True)
    amount = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=True)
    reference_id = Column(String, nullable=True, index=True)
    status = Column(String, default="consumed")
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    subscription = relationship("UserSubscription")


class LLMUsageRecord(Base):
    __tablename__ = "llm_usage_records"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    module_key = Column(String, nullable=False, index=True)
    provider = Column(String, nullable=False, index=True)
    model = Column(String, nullable=False, index=True)
    request_id = Column(String, nullable=False, index=True)
    input_tokens = Column(BigInteger, default=0)
    output_tokens = Column(BigInteger, default=0)
    cache_read_tokens = Column(BigInteger, default=0)
    cache_write_tokens = Column(BigInteger, default=0)
    total_tokens = Column(BigInteger, default=0)
    credits_charged = Column(Integer, default=0)
    input_cost_micros = Column(BigInteger, default=0)
    output_cost_micros = Column(BigInteger, default=0)
    cache_read_cost_micros = Column(BigInteger, default=0)
    cache_write_cost_micros = Column(BigInteger, default=0)
    total_cost_micros = Column(BigInteger, default=0)
    usage_source = Column(String, default="estimated")
    status = Column(String, default="success", index=True)
    latency_ms = Column(Integer, default=0)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User")


class AIOutputAudit(Base):
    __tablename__ = "ai_output_audit"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    module_key = Column(String, nullable=False, index=True)
    provider = Column(String, nullable=True, index=True)
    model = Column(String, nullable=True, index=True)
    request_id = Column(String, nullable=False, index=True)
    data_source = Column(String, nullable=True)
    output_text = Column(Text, nullable=True)
    disclaimer_version = Column(String, nullable=False, default="research-only-v1")
    status = Column(String, default="success", index=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User")


class AIInsightTask(Base):
    __tablename__ = "ai_insight_tasks"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    market = Column(String, default="CN", index=True)
    status = Column(String, default="pending")  # pending/running/done/failed
    dimensions = Column(
        Text, nullable=True
    )  # JSON: {policy, liquidity, sentiment, global, economy}
    summary = Column(Text, nullable=True)
    analysis_list = Column(Text, nullable=True)  # JSON array
    data_context_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    # Durable queue metadata. Legacy inline tasks keep queue_status=inline.
    queue_task_id = Column(String, nullable=True, index=True)
    queue_payload_json = Column(Text, nullable=True)
    queue_status = Column(String, default="inline", nullable=False, index=True)
    queue_priority = Column(Integer, default=10, nullable=False, index=True)
    attempt_count = Column(Integer, default=0, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    heartbeat_at = Column(DateTime(timezone=True), nullable=True, index=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    failure_class = Column(String, nullable=True)
    charged_credits = Column(Integer, default=0, nullable=False)
    refunded_credits = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SmartResearchTask(Base):
    __tablename__ = "smart_research_tasks"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status = Column(String, default="pending", index=True)
    symbols_json = Column(Text, nullable=True)
    progress_json = Column(Text, nullable=True)
    results_json = Column(Text, nullable=True)
    markdown_report = Column(Text, nullable=True)
    charts_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    # Durable queue metadata. The report fields above remain the public payload.
    queue_task_id = Column(String, nullable=True, index=True)
    queue_payload_json = Column(Text, nullable=True)
    queue_status = Column(String, default="inline", nullable=False, index=True)
    queue_priority = Column(Integer, default=10, nullable=False, index=True)
    attempt_count = Column(Integer, default=0, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    heartbeat_at = Column(DateTime(timezone=True), nullable=True, index=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    failure_class = Column(String, nullable=True)
    charged_credits = Column(Integer, default=0, nullable=False)
    refunded_credits = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RiskAssessmentTask(Base):
    """Background systemic-risk refresh owned by one user."""

    __tablename__ = "risk_assessment_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    market = Column(String, default="CN", nullable=False, index=True)
    status = Column(String, default="pending", nullable=False, index=True)
    model = Column(String, nullable=True)
    use_llm = Column(Boolean, default=True)
    result_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    # Durable queue metadata. Legacy inline tasks keep queue_status=inline.
    queue_task_id = Column(String, nullable=True, index=True)
    queue_payload_json = Column(Text, nullable=True)
    queue_status = Column(String, default="inline", nullable=False, index=True)
    queue_priority = Column(Integer, default=10, nullable=False, index=True)
    attempt_count = Column(Integer, default=0, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    heartbeat_at = Column(DateTime(timezone=True), nullable=True, index=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    failure_class = Column(String, nullable=True)
    charged_credits = Column(Integer, default=0, nullable=False)
    refunded_credits = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FinancialAgentProfile(Base):
    __tablename__ = "financial_agent_profiles"

    id = Column(Integer, primary_key=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String, nullable=False, index=True)
    category = Column(String, default="general", index=True)
    icon = Column(String, nullable=True)
    color = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    system_prompt = Column(Text, nullable=False)
    model = Column(String, nullable=True)
    tools_json = Column(Text, nullable=True)
    skills_json = Column(Text, nullable=True)
    mcp_servers_json = Column(Text, nullable=True)
    visibility = Column(String, default="private", index=True)
    is_builtin = Column(Boolean, default=False, index=True)
    enabled = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AgentAnalysisSession(Base):
    __tablename__ = "agent_analysis_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    subject_type = Column(String, default="stock", index=True)
    subject = Column(Text, nullable=False)
    symbol = Column(String, nullable=True, index=True)
    selected_agent_ids_json = Column(Text, nullable=False)
    model = Column(String, nullable=True)
    max_rounds = Column(Integer, default=1)
    current_round = Column(Integer, default=0)
    status = Column(String, default="pending", index=True)
    progress_json = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)
    memory_summary = Column(Text, nullable=True)
    report_markdown = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AgentAnalysisMessage(Base):
    __tablename__ = "agent_analysis_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(
        Integer, ForeignKey("agent_analysis_sessions.id"), nullable=False, index=True
    )
    agent_id = Column(Integer, ForeignKey("financial_agent_profiles.id"), nullable=True)
    sender_type = Column(String, nullable=False, index=True)
    sender_name = Column(String, nullable=False)
    round_no = Column(Integer, default=0, index=True)
    content_markdown = Column(Text, nullable=True)
    blocks_json = Column(Text, nullable=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class MarketTemperature(Base):
    __tablename__ = "market_temperature"

    id = Column(Integer, primary_key=True)
    market = Column(String, default="CN", index=True)
    calc_time = Column(DateTime(timezone=True), server_default=func.now())
    data_date = Column(Date, nullable=True, index=True)
    source = Column(String, default="database.daily_prices")
    rise_count = Column(Integer, default=0)
    fall_count = Column(Integer, default=0)
    flat_count = Column(Integer, default=0)
    total_count = Column(Integer, default=0)
    avg_change = Column(Float, default=0.0)
    avg_rise = Column(Float, default=0.0)
    avg_fall = Column(Float, default=0.0)
    market_volume = Column(Float, nullable=True)
    market_volume_prev = Column(Float, nullable=True)
    market_volume_change = Column(Float, nullable=True)
    market_volume_change_pct = Column(Float, nullable=True)
    market_volume_direction = Column(String, nullable=True)
    market_volume_source = Column(String, nullable=True)
    market_volume_date = Column(Date, nullable=True)
    market_volume_prev_date = Column(Date, nullable=True)
    heatmap_data = Column(Text, nullable=True)  # JSON: 板块热力图涨跌幅
    heatmap_stats = Column(Text, nullable=True)  # JSON: 板块内上涨/下跌/平盘统计


class ConceptBoard(Base):
    __tablename__ = "concept_boards"

    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True)
    detail_code = Column(String, nullable=True, index=True)
    name = Column(String, index=True)
    change_pct = Column(Float, default=0.0)
    stock_count = Column(Integer, default=0)
    lead_stock = Column(String, nullable=True)
    source = Column(String, default="ths.concept")
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ConceptBoardMember(Base):
    __tablename__ = "concept_board_members"

    id = Column(Integer, primary_key=True)
    concept_code = Column(String, index=True)
    stock_code = Column(String, index=True)
    stock_name = Column(String)
    change_pct = Column(Float, default=0.0)
    source = Column(String, default="ths.concept.detail")
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "concept_code", "stock_code", name="uix_concept_member_code_stock"
        ),
    )


class AlphaRecommendation(Base):
    __tablename__ = "alpha_recommendations"

    id = Column(Integer, primary_key=True)
    market = Column(String, default="CN", index=True)
    strategy_name = Column(String)
    stock_code = Column(String)
    stock_name = Column(String)
    stars = Column(Integer, default=3)
    ai_logic = Column(Text, nullable=True)
    buy_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    target_price = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PositionAdvice(Base):
    __tablename__ = "position_advice"

    id = Column(Integer, primary_key=True)
    market = Column(String, default="CN", index=True)
    position_ratio = Column(Float, default=0.5)  # 建议仓位 0-1
    attack_industries = Column(Text, nullable=True)  # JSON array
    defense_industries = Column(Text, nullable=True)  # JSON array
    neutral_assessment = Column(Text, nullable=True)
    attack_reason = Column(Text, nullable=True)
    defense_reason = Column(Text, nullable=True)
    analysis_source = Column(String, nullable=True)
    market_context_json = Column(Text, nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, default="system")
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    read = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RiskTrendSnapshot(Base):
    __tablename__ = "risk_trend_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, index=True)
    value = Column(Float, nullable=False, default=0.0)
    source = Column(String, default="computed")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uix_risk_trend_user_date"),
    )


class Strategy(Base):
    __tablename__ = "strategies"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String, unique=True, index=True)
    params_json = Column(Text, nullable=True)
    factor_ids_json = Column(Text, nullable=True)
    code = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CustomFactor(Base):
    __tablename__ = "custom_factors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String, unique=True, index=True)
    display_name = Column(String, nullable=True)
    category = Column(
        String, default="custom"
    )  # technical/fundamental/statistical/composite/custom
    expression = Column(Text)  # 因子表达式, e.g. "ROC(close, 20)"
    description = Column(Text, nullable=True)
    params_json = Column(
        Text, nullable=True
    )  # JSON: [{"name":"window","label":"窗口期","default":20,"min":5,"max":120,"step":1,"type":"int"}]
    output_type = Column(String, default="scalar")  # scalar/boolean
    default_filter = Column(Text, nullable=True)  # JSON: {"min":-5,"max":5}
    group_name = Column(String, default="default")
    is_builtin = Column(Integer, default=0)  # 0=user created, 1=system builtin
    usage_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
