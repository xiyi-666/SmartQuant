import os
import sys
import hashlib
import hmac
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import HTTPException
from starlette.requests import Request


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/quartsys-subscription-test.db")

import main  # noqa: E402
from models import (  # noqa: E402
    AdEvent,
    AdRewardSession,
    ConceptBoard,
    CreditLedger,
    CreditRechargeOrder,
    FactorPreset,
    LLMConfig,
    LLMUsageRecord,
    Stock,
    SubscriptionOrder,
    SubscriptionPlan,
    SystemSetting,
    UserSetting,
    UserSubscription,
)
from models import User as UserModel  # noqa: E402


class SubscriptionCreditWebhookTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        try:
            main.scheduler.shutdown(wait=False)
        except Exception:
            pass

    def setUp(self):
        self.db = main.SessionLocal()
        self.username = f"billing_user_{id(self)}"
        self.user = UserModel(
            username=self.username,
            email=f"{self.username}@example.com",
            password_hash="x",
            role="normal",
        )
        self.plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "free").first()
        if not self.plan:
            self.plan = SubscriptionPlan(
                key="free",
                name="免费版",
                role="normal",
                price_cents=0,
                credits=500,
                enabled=1,
                features_json="[]",
            )
            self.db.add(self.plan)
        self.plan.role = "normal"
        self.plan.enabled = 1
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)
        self.db.refresh(self.plan)
        self.subscription = UserSubscription(
            user_id=self.user.id,
            plan_id=self.plan.id,
            plan_key=self.plan.key,
            plan_name=self.plan.name,
            role="normal",
            credits_total=80,
            credits_used=0,
            status="active",
        )
        self.db.add(self.subscription)
        self.db.commit()
        self.db.refresh(self.subscription)

    def tearDown(self):
        try:
            self.db.query(AdEvent).filter(AdEvent.user_id == self.user.id).delete()
            self.db.query(AdRewardSession).filter(AdRewardSession.user_id == self.user.id).delete()
            self.db.query(LLMUsageRecord).filter(LLMUsageRecord.user_id == self.user.id).delete()
            self.db.query(CreditLedger).filter(CreditLedger.user_id == self.user.id).delete()
            self.db.query(UserSetting).filter(UserSetting.user_id == self.user.id).delete()
            self.db.query(UserSubscription).filter(UserSubscription.user_id == self.user.id).delete()
            self.db.query(SubscriptionOrder).filter(SubscriptionOrder.user_id == self.user.id).delete()
            self.db.query(CreditRechargeOrder).filter(CreditRechargeOrder.user_id == self.user.id).delete()
            self.db.query(LLMConfig).filter(LLMConfig.user_id == self.user.id).delete()
            self.db.query(UserModel).filter(UserModel.id == self.user.id).delete()
            self.db.query(SystemSetting).filter(SystemSetting.key == main.PAYMENT_SETTINGS_KEY).delete()
            self.db.query(SystemSetting).filter(SystemSetting.key == main.BILLING_SETTINGS_KEY).delete()
            self.db.query(SystemSetting).filter(SystemSetting.key == main.LLM_PRICING_SETTINGS_KEY).delete()
            self.db.query(SystemSetting).filter(SystemSetting.key == main.LLM_MODEL_OPTIONS_KEY).delete()
            self.db.commit()
        finally:
            self.db.close()

    def test_credit_consume_exact_and_insufficient(self):
        summary = main._consume_user_credits(
            self.db,
            self.user,
            "ai_insights",
            main.AI_CREDIT_COSTS["ai_insights"],
            reference_id="test-credit-1",
        )
        self.assertEqual(summary["credits_remaining"], 30)
        ledger = self.db.query(CreditLedger).filter(CreditLedger.reference_id == "test-credit-1").first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.amount, 50)

        with self.assertRaises(HTTPException) as ctx:
            main._consume_user_credits(
                self.db,
                self.user,
                "strategy_generation",
                main.AI_CREDIT_COSTS["strategy_generation"],
                reference_id="test-credit-2",
            )
        self.assertEqual(ctx.exception.status_code, 402)
        self.assertEqual(ctx.exception.detail["code"], "INSUFFICIENT_CREDITS")

    def test_default_plan_seed_preserves_admin_pricing(self):
        vip_plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip").first()
        if not vip_plan:
            vip_plan = SubscriptionPlan(
                key="vip",
                name="专业版",
                role="vip",
                enabled=1,
                features_json="[]",
            )
            self.db.add(vip_plan)
        original = {
            "price_cents": vip_plan.price_cents,
            "credits": vip_plan.credits,
            "stripe_price_id": vip_plan.stripe_price_id,
        }
        try:
            vip_plan.price_cents = 4900
            vip_plan.credits = 5000
            vip_plan.stripe_price_id = "price_admin_vip"
            self.db.commit()

            main.ensure_default_subscription_plans()
            self.db.expire_all()
            persisted = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip").first()
            self.assertEqual((persisted.price_cents, persisted.credits), (4900, 5000))
            self.assertEqual(persisted.stripe_price_id, "price_admin_vip")
        finally:
            persisted = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip").first()
            persisted.price_cents = original["price_cents"]
            persisted.credits = original["credits"]
            persisted.stripe_price_id = original["stripe_price_id"]
            self.db.commit()

    def test_default_plan_seed_updates_pricing_and_monthly_quota(self):
        main.ensure_default_subscription_plans()
        self.db.expire_all()
        legacy_values = {
            "vip-trial": {"price_cents": 1990},
            "vip": {"price_cents": 14900},
            "vip-year": {"price_cents": 149000, "credits": 120000},
            "svip": {"price_cents": 59900, "credits": 70000},
            "svip-year": {"price_cents": 599000, "credits": 840000},
        }
        for key, values in legacy_values.items():
            plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == key).first()
            self.assertIsNotNone(plan)
            for field, value in values.items():
                setattr(plan, field, value)
        self.db.commit()

        main.ensure_default_subscription_plans()
        self.db.expire_all()

        vip_trial = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip-trial").first()
        vip = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip").first()
        vip_quarter = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip-quarter").first()
        vip_year = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip-year").first()
        svip = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "svip").first()
        svip_quarter = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "svip-quarter").first()
        svip_year = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "svip-year").first()

        self.assertEqual(vip_trial.price_cents, 2990)
        self.assertEqual((vip.price_cents, vip.credits), (19900, 10000))
        expected_quarter_price = main._quarter_plan_price_cents(
            19900,
            main._default_billing_settings()["quarter_discount_pct"],
        )
        self.assertEqual((vip_quarter.price_cents, vip_quarter.credits), (expected_quarter_price, 10000))
        self.assertEqual((vip_year.price_cents, vip_year.credits), (199000, 10000))
        self.assertEqual((svip.price_cents, svip.credits), (99900, 50000))
        self.assertEqual(svip_quarter.credits, 50000)
        self.assertEqual((svip_year.price_cents, svip_year.credits), (999000, 50000))

    def test_billing_settings_drive_ai_cost_and_mask_meta_secret(self):
        config = main._default_billing_settings()
        config["module_credit_costs"]["ai_insights"] = 77
        config["rewarded_ads"].update({"enabled": True, "reward_credits": 25})
        config["rewarded_ads"]["meta"].update(
            {
                "enabled": True,
                "app_id": "meta-app",
                "placement_id": "meta-placement",
                "launch_url": "https://ads.example.com/reward",
                "callback_secret": "meta-callback-secret",
            }
        )
        saved = main._sanitize_billing_settings(config, current=main._default_billing_settings())
        main._save_system_setting_json(self.db, main.BILLING_SETTINGS_KEY, saved)

        self.assertEqual(main._ai_credit_cost(self.db, "ai_insights"), 77)
        self.assertEqual(main._billing_settings(self.db)["rewarded_ads"]["reward_credits"], 25)
        masked_secret = main._billing_settings(self.db, masked=True)["rewarded_ads"]["meta"]["callback_secret"]
        self.assertIn("****", masked_secret)
        self.assertNotEqual(masked_secret, "meta-callback-secret")

    def test_credit_recharge_quote_uses_configured_rate_and_limits(self):
        config = main._default_billing_settings()
        config.update(
            {
                "credits_per_cny": 250,
                "recharge_min_cents": 500,
                "recharge_max_cents": 5000,
                "recharge_presets_cents": [500, 1000, 5000],
            }
        )
        config["credit_recharge"]["enabled"] = True
        main._save_system_setting_json(
            self.db,
            main.BILLING_SETTINGS_KEY,
            main._sanitize_billing_settings(config, current=main._default_billing_settings()),
        )

        quote = main._credit_recharge_quote(self.db, 1000)
        self.assertEqual(quote["credits"], 2500)
        self.assertEqual(quote["credits_per_cny"], 250)

        with self.assertRaises(HTTPException) as ctx:
            main._credit_recharge_quote(self.db, 499)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_enabled_reward_ads_require_a_ready_provider(self):
        config = main._default_billing_settings()
        config["rewarded_ads"]["enabled"] = True

        with self.assertRaises(HTTPException) as ctx:
            main._sanitize_billing_settings(config, current=main._default_billing_settings())
        self.assertEqual(ctx.exception.status_code, 400)

    def test_trial_is_available_once_for_a_new_free_user(self):
        trial_plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip-trial").first()
        self.assertIsNotNone(trial_plan)

        fresh_quote = main._subscription_checkout_quote(self.db, self.user, trial_plan)
        self.assertTrue(fresh_quote["eligible"])
        self.assertTrue(fresh_quote["is_trial"])

        self.db.add(
            UserSubscription(
                user_id=self.user.id,
                plan_id=trial_plan.id,
                plan_key=trial_plan.key,
                plan_name=trial_plan.name,
                role="vip",
                credits_total=trial_plan.credits,
                credits_used=0,
                status="expired",
                source_order_no=f"prior-trial:{self.user.id}",
            )
        )
        self.db.commit()

        repeat_quote = main._subscription_checkout_quote(self.db, self.user, trial_plan)
        self.assertFalse(repeat_quote["eligible"])
        self.assertIn("仅可订阅一次", repeat_quote["reason"])

    def test_full_month_trial_seeded_once_with_pro_quota(self):
        main.ensure_default_subscription_plans()
        self.db.expire_all()
        trial_plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip-full-trial").first()

        self.assertIsNotNone(trial_plan)
        self.assertEqual(trial_plan.price_cents, 9900)
        self.assertEqual(trial_plan.credits, 10000)
        self.assertEqual(main._plan_duration_days(trial_plan), 30)

        quote = main._subscription_checkout_quote(self.db, self.user, trial_plan)
        self.assertTrue(quote["eligible"])
        self.assertTrue(quote["is_trial"])

    def test_multi_month_subscription_quota_is_issued_monthly(self):
        main.ensure_default_subscription_plans()
        self.db.expire_all()
        quarter_plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip-quarter").first()
        self.assertIsNotNone(quarter_plan)
        self.assertEqual(quarter_plan.credits, 10000)

        self.db.query(UserSubscription).filter(UserSubscription.user_id == self.user.id).delete()
        self.user.role = "vip"
        started_at = main._add_calendar_months(main._utcnow(), -2)
        current_time = main._add_calendar_months(started_at, 2) + timedelta(minutes=1)
        subscription = UserSubscription(
            user_id=self.user.id,
            plan_id=quarter_plan.id,
            plan_key=quarter_plan.key,
            plan_name=quarter_plan.name,
            role="vip",
            credits_total=quarter_plan.credits,
            credits_used=0,
            status="active",
            source_order_no=f"monthly-quota:{self.user.id}",
            started_at=started_at,
            expires_at=started_at + timedelta(days=90),
        )
        self.db.add(subscription)
        self.db.commit()
        self.db.refresh(subscription)

        granted = main._grant_due_subscription_monthly_credits(
            self.db,
            subscription,
            now=current_time,
        )
        self.db.commit()
        self.db.refresh(subscription)

        self.assertEqual(granted, quarter_plan.credits * 2)
        self.assertEqual(subscription.credits_total, quarter_plan.credits * 3)
        self.assertEqual(
            self.db.query(CreditLedger)
            .filter(
                CreditLedger.subscription_id == subscription.id,
                CreditLedger.action == "subscription_monthly_grant",
            )
            .count(),
            2,
        )

        granted_again = main._grant_due_subscription_monthly_credits(
            self.db,
            subscription,
            now=current_time,
        )
        self.db.commit()
        self.assertEqual(granted_again, 0)

    def test_dynamic_ai_estimate_applies_context_data_and_depth_multipliers(self):
        self.user.role = "vip"
        self.db.commit()
        estimate = main._dynamic_ai_credit_estimate(
            100,
            user=self.user,
            model_details={"model_tier": "advanced", "model_multiplier": 1.25},
            context_chars=18_000,
            data_sources=4,
            deep_units=2,
            quantity=2,
        )

        self.assertEqual(estimate["billing_mode"], "dynamic_estimated_prepaid")
        self.assertTrue(estimate["chargeable"])
        self.assertGreater(estimate["estimated_credits"], 200)
        self.assertGreater(estimate["multipliers"]["context"], 1)
        self.assertGreater(estimate["multipliers"]["data_retrieval"], 1)
        self.assertGreater(estimate["multipliers"]["deep_research"], 1)

    def test_trial_rejects_users_with_prior_paid_tier_history(self):
        trial_plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip-trial").first()
        vip_plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip").first()
        self.assertIsNotNone(trial_plan)
        self.assertIsNotNone(vip_plan)
        self.db.add(
            UserSubscription(
                user_id=self.user.id,
                plan_id=vip_plan.id,
                plan_key=vip_plan.key,
                plan_name=vip_plan.name,
                role="vip",
                credits_total=vip_plan.credits,
                credits_used=vip_plan.credits,
                status="expired",
                source_order_no=f"prior-paid:{self.user.id}",
            )
        )
        self.db.commit()

        quote = main._subscription_checkout_quote(self.db, self.user, trial_plan)
        self.assertFalse(quote["eligible"])
        self.assertIn("免费新用户", quote["reason"])

    def test_duplicate_trial_payment_does_not_create_second_subscription(self):
        trial_plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip-trial").first()
        self.assertIsNotNone(trial_plan)
        orders = []
        for suffix in ("a", "b"):
            order = SubscriptionOrder(
                trade_no=f"TRIAL{self.user.id}{suffix}",
                user_id=self.user.id,
                plan_id=trial_plan.id,
                provider="stripe",
                amount_cents=trial_plan.price_cents,
                currency="CNY",
                status="pending",
                provider_payload="{}",
            )
            self.db.add(order)
            orders.append(order)
        self.db.commit()

        first = main._complete_subscription_order(
            self.db,
            trade_no=orders[0].trade_no,
            provider="stripe",
            provider_trade_no="stripe-trial-a",
        )
        second = main._complete_subscription_order(
            self.db,
            trade_no=orders[1].trade_no,
            provider="stripe",
            provider_trade_no="stripe-trial-b",
        )

        self.assertTrue(first["completed"])
        self.assertFalse(second["completed"])
        self.assertTrue(second["refund_required"])
        self.assertEqual(second["order"].status, "refund_required")
        replayed = main._complete_subscription_order(
            self.db,
            trade_no=orders[1].trade_no,
            provider="stripe",
            provider_trade_no="stripe-trial-b",
        )
        self.assertTrue(replayed["refund_required"])
        trial_count = (
            self.db.query(UserSubscription)
            .filter(
                UserSubscription.user_id == self.user.id,
                UserSubscription.plan_id == trial_plan.id,
            )
            .count()
        )
        self.assertEqual(trial_count, 1)

    def test_assistant_conversation_quota_is_cycle_limited(self):
        quota = main._assistant_conversation_quota(self.db, self.user)
        self.assertEqual(quota["limit"], 20)
        self.assertEqual(quota["used"], 0)

        for index in range(20):
            consumed = main._consume_assistant_conversation(
                self.db,
                self.user,
                reference_id=f"assistant-test-{index}",
            )
        self.assertEqual(consumed["remaining"], 0)
        self.assertEqual(consumed["used"], 20)

        with self.assertRaises(HTTPException) as ctx:
            main._consume_assistant_conversation(
                self.db,
                self.user,
                reference_id="assistant-test-over",
            )
        self.assertEqual(ctx.exception.status_code, 402)
        self.assertEqual(ctx.exception.detail["code"], "ASSISTANT_QUOTA_EXCEEDED")

    def test_admin_credit_is_unlimited(self):
        admin = UserModel(username=f"admin_{id(self)}", password_hash="x", role="admin")
        self.db.add(admin)
        self.db.commit()
        try:
            summary = main._consume_user_credits(self.db, admin, "strategy_generation", 30)
            self.assertTrue(summary["unlimited"])
            self.assertFalse(summary["last_charge"]["charged"])
        finally:
            self.db.query(UserModel).filter(UserModel.id == admin.id).delete()
            self.db.commit()

    def test_llm_usage_persists_priced_cost_and_dashboard_totals(self):
        main._save_system_setting_json(
            self.db,
            main.LLM_PRICING_SETTINGS_KEY,
            {
                "currency": "USD",
                "models": [
                    {
                        "provider": "openai",
                        "model": "gpt-test",
                        "input_per_million": 2,
                        "output_per_million": 10,
                        "cache_read_per_million": 0.5,
                        "cache_write_per_million": 3,
                        "enabled": True,
                    }
                ],
            },
        )
        usage = {
            "input_tokens": 1_000,
            "output_tokens": 500,
            "cache_read_tokens": 200,
            "cache_write_tokens": 100,
            "total_tokens": 1_800,
            "source": "upstream",
        }

        row = main._persist_llm_usage(
            self.db,
            user_id=self.user.id,
            module_key="ai_insights",
            provider="openai",
            model="gpt-test",
            usage=usage,
            request_id=f"usage-test:{self.user.id}",
            credits_charged=50,
        )

        self.assertIsNotNone(row)
        self.assertEqual(row.credits_charged, 50)
        self.assertEqual(row.total_cost_micros, 7_400)
        dashboard = main.get_admin_token_cost_dashboard(
            days=30,
            user_id=self.user.id,
            module_key=None,
            model=None,
            limit=10,
            db=self.db,
        )
        self.assertEqual(dashboard["summary"]["request_count"], 1)
        self.assertEqual(dashboard["summary"]["total_tokens"], 1_800)
        self.assertEqual(dashboard["summary"]["credits_charged"], 50)
        self.assertEqual(dashboard["summary"]["total_cost_micros"], 7_400)
        self.assertEqual(dashboard["by_module"][0]["module_key"], "ai_insights")
        self.assertEqual(dashboard["by_user"][0]["username"], self.username)

    def test_revenue_dashboard_aggregates_paid_ads_and_ai_cost(self):
        now = main._utcnow()
        self.db.add(
            SubscriptionOrder(
                trade_no=f"SUBTEST{id(self)}",
                user_id=self.user.id,
                plan_id=self.plan.id,
                provider="epay",
                amount_cents=1234,
                currency="CNY",
                status="paid",
                paid_at=now,
            )
        )
        self.db.add(
            CreditRechargeOrder(
                trade_no=f"CRDTEST{id(self)}",
                user_id=self.user.id,
                provider="stripe",
                amount_cents=500,
                credits=1000,
                currency="CNY",
                status="paid",
                paid_at=now,
            )
        )
        self.db.add(
            AdEvent(
                placement_key="top_banner",
                event_type="impression",
                platform="direct",
                user_id=self.user.id,
                session_key=f"session:{id(self)}",
                created_at=now,
            )
        )
        self.db.add(
            AdEvent(
                placement_key="top_banner",
                event_type="click",
                platform="direct",
                user_id=self.user.id,
                session_key=f"session:{id(self)}",
                created_at=now,
            )
        )
        self.db.add(
            AdRewardSession(
                session_token=f"reward:{id(self)}",
                user_id=self.user.id,
                provider="meta",
                reward_credits=20,
                status="granted",
                expires_at=now + main.timedelta(minutes=10),
                granted_at=now,
                created_at=now,
            )
        )
        self.db.add(
            LLMUsageRecord(
                user_id=self.user.id,
                module_key="ai_insights",
                provider="openai",
                model="gpt-test",
                request_id=f"revenue-usage:{id(self)}",
                input_tokens=100,
                output_tokens=50,
                total_tokens=150,
                credits_charged=50,
                total_cost_micros=1_000_000,
                status="success",
                created_at=now,
            )
        )
        self.db.commit()

        dashboard = main.get_admin_revenue_dashboard(
            days=30,
            user_id=self.user.id,
            usd_cny=7.0,
            homepage_ecpm_cny=1000,
            rewarded_ecpm_cny=500,
            db=self.db,
        )

        self.assertEqual(dashboard["summary"]["subscription_revenue_cny"], 12.34)
        self.assertEqual(dashboard["summary"]["recharge_revenue_cny"], 5.0)
        self.assertEqual(dashboard["summary"]["estimated_ad_revenue_cny"], 1.5)
        self.assertEqual(dashboard["summary"]["ai_cost_cny"], 7.0)
        self.assertEqual(dashboard["summary"]["ad_ctr"], 1.0)
        self.assertEqual(dashboard["by_ad_placement"][0]["placement_key"], "top_banner")

    def test_admin_llm_usage_records_zero_charged_credits(self):
        admin = UserModel(username=f"usage_admin_{id(self)}", password_hash="x", role="admin")
        self.db.add(admin)
        self.db.commit()
        self.db.refresh(admin)
        try:
            row = main._persist_llm_usage(
                self.db,
                user_id=admin.id,
                module_key="strategy",
                provider="openai",
                model="gpt-test",
                usage={
                    "input_tokens": 100,
                    "output_tokens": 50,
                    "cache_read_tokens": 0,
                    "cache_write_tokens": 0,
                    "total_tokens": 150,
                    "source": "estimated",
                },
                credits_charged=50,
            )
            self.assertEqual(row.credits_charged, 0)
        finally:
            self.db.query(LLMUsageRecord).filter(LLMUsageRecord.user_id == admin.id).delete()
            self.db.query(UserModel).filter(UserModel.id == admin.id).delete()
            self.db.commit()

    def test_token_cost_filter_options_do_not_require_existing_usage(self):
        main._save_system_setting_json(
            self.db,
            main.LLM_MODEL_OPTIONS_KEY,
            {
                "default_model": "gpt-filter-a",
                "models": ["gpt-filter-a", "gpt-filter-b"],
                "module_models": {},
            },
        )

        dashboard = main.get_admin_token_cost_dashboard(
            days=30,
            user_id=self.user.id,
            module_key=None,
            model=None,
            limit=10,
            db=self.db,
        )

        self.assertIn(self.user.id, {item["id"] for item in dashboard["options"]["users"]})
        self.assertEqual(
            set(main.LLM_USAGE_MODULE_LABELS),
            {item["key"] for item in dashboard["options"]["modules"]},
        )
        self.assertTrue(
            {"gpt-filter-a", "gpt-filter-b"}.issubset(
                {item["model"] for item in dashboard["options"]["models"]}
            )
        )

    def test_payment_settings_mask_secrets(self):
        main._save_system_setting_json(
            self.db,
            main.PAYMENT_SETTINGS_KEY,
            {
                "epay": {"enabled": True, "gateway_url": "https://pay.example.com", "merchant_id": "m1", "secret_key": "epay-secret"},
                "stripe": {"enabled": True, "secret_key": "sk_test_secret", "webhook_secret": "whsec_test"},
            },
        )
        masked = main._payment_settings(self.db, masked=True)
        self.assertNotIn("epay-secret", str(masked))
        self.assertNotIn("sk_test_secret", str(masked))
        self.assertIn("****", masked["epay"]["secret_key"])

    def test_epay_public_site_url_drives_callback_and_return_urls(self):
        request = Request(
            {
                "type": "http",
                "scheme": "http",
                "server": ("127.0.0.1", 18427),
                "path": "/api/subscription/epay/pay",
                "headers": [(b"origin", b"https://example.com")],
            }
        )
        settings_value = {"public_site_url": "https://example.com/"}
        self.assertEqual(
            main._payment_callback_base_url(request, settings_value),
            "https://example.com",
        )
        self.assertEqual(
            main._payment_return_url(request, settings_value),
            "https://example.com/settings?tab=subscription",
        )
        self.assertFalse(main._payment_local_callback_notice(request, settings_value))

    def test_epay_local_browser_returns_locally_with_public_callback_configured(self):
        request = Request(
            {
                "type": "http",
                "scheme": "http",
                "server": ("127.0.0.1", 18427),
                "path": "/api/subscription/epay/pay",
                "headers": [(b"origin", b"http://127.0.0.1:15473")],
            }
        )
        settings_value = {"public_site_url": "https://example.com"}
        self.assertEqual(
            main._payment_callback_base_url(request, settings_value),
            "https://example.com",
        )
        self.assertEqual(
            main._payment_return_url(request, settings_value),
            "http://127.0.0.1:15473/settings?tab=subscription",
        )

    def test_epay_uses_separate_public_api_origin_for_notification(self):
        request = Request(
            {
                "type": "http",
                "scheme": "http",
                "server": ("127.0.0.1", 18427),
                "path": "/api/subscription/epay/pay",
                "headers": [(b"origin", b"https://example.com")],
            }
        )
        settings_value = {
            "public_site_url": "https://example.com",
            "public_api_url": "https://api.example.com",
        }
        self.assertEqual(
            main._payment_callback_base_url(request, settings_value),
            "https://api.example.com",
        )
        self.assertEqual(
            main._payment_return_url(request, settings_value),
            "https://example.com/settings?tab=subscription",
        )

    def test_epay_local_site_uses_browser_origin_and_marks_callback_limit(self):
        request = Request(
            {
                "type": "http",
                "scheme": "http",
                "server": ("localhost", 18427),
                "path": "/api/subscription/epay/pay",
                "headers": [(b"origin", b"http://127.0.0.1:15473")],
            }
        )
        self.assertEqual(
            main._payment_return_url(request, {}),
            "http://127.0.0.1:15473/settings?tab=subscription",
        )
        self.assertTrue(main._payment_local_callback_notice(request, {}))

    def test_epay_public_site_url_rejects_non_https_remote_address(self):
        settings_value = main._default_payment_settings()
        settings_value["epay"].update(
            {
                "enabled": True,
                "gateway_url": "https://pay.example.com/submit",
                "merchant_id": "merchant",
                "secret_key": "secret",
                "public_site_url": "http://example.com",
            }
        )
        with self.assertRaises(HTTPException):
            main._validate_payment_settings_for_save(settings_value)

    def test_subscription_self_exposes_ready_payment_channels(self):
        payload = main._subscription_self_payload(self.db, self.user)
        self.assertFalse(payload["payment_channels"]["any_enabled"])

        main._save_system_setting_json(
            self.db,
            main.PAYMENT_SETTINGS_KEY,
            {
                "epay": {
                    "enabled": True,
                    "gateway_url": "https://pay.example.com/submit",
                    "merchant_id": "m1",
                    "secret_key": "epay-secret",
                    "default_method": "wxpay",
                },
                "stripe": {
                    "enabled": True,
                    "secret_key": "sk_test_secret",
                    "webhook_secret": "whsec_test",
                },
            },
        )
        payload = main._subscription_self_payload(self.db, self.user)
        self.assertTrue(payload["payment_channels"]["any_enabled"])
        self.assertTrue(payload["payment_channels"]["epay"]["enabled"])
        self.assertTrue(payload["payment_channels"]["stripe"]["enabled"])
        self.assertEqual(payload["payment_channels"]["epay"]["default_method"], "wxpay")

    def test_admin_role_update_syncs_active_subscription_level(self):
        admin = UserModel(username=f"admin_sync_{id(self)}", password_hash="x", role="admin")
        vip_plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.key == "vip").first()
        if not vip_plan:
            vip_plan = SubscriptionPlan(
                key="vip",
                name="专业版",
                role="vip",
                price_cents=9900,
                credits=10000,
                enabled=1,
                features_json="[]",
            )
            self.db.add(vip_plan)
        vip_plan.role = "vip"
        vip_plan.enabled = 1
        self.db.add(admin)
        self.db.commit()
        self.db.refresh(admin)

        result = main.update_admin_user_role(
            self.user.id,
            main.UserRoleUpdate(role="vip"),
            db=self.db,
            current_user=admin,
        )

        self.assertEqual(result["role"], "vip")
        active = main._active_subscription_query(self.db, self.user.id).first()
        self.assertIsNotNone(active)
        self.assertEqual(active.plan_key, "vip")
        self.assertEqual(active.role, "vip")
        replaced = (
            self.db.query(UserSubscription)
            .filter(UserSubscription.user_id == self.user.id, UserSubscription.plan_key == "free")
            .first()
        )
        self.assertIsNotNone(replaced)
        self.assertEqual(replaced.status, "replaced")

        self.db.query(UserModel).filter(UserModel.id == admin.id).delete()
        self.db.commit()

    @patch("main.requests.post")
    def test_llm_config_test_pings_upstream(self, post):
        post.return_value.status_code = 200
        post.return_value.text = '{"ok":true}'
        post.return_value.json.return_value = {"choices": [{"message": {"content": "pong"}}]}

        result = main.test_llm_config_api(
            main.LLMConfigSchema(
                provider="openai",
                model="gpt-5.5",
                api_key="sk-test",
                base_url="https://llm.example.com/v1",
            ),
            db=self.db,
            current_user=self.user,
        )

        self.assertEqual(result["status"], "ok")
        self.assertIn("上游连通", result["message"])
        args, kwargs = post.call_args
        self.assertEqual(args[0], "https://llm.example.com/v1/chat/completions")
        self.assertEqual(kwargs["json"]["messages"][0]["content"], "ping")

    def test_llm_module_protocol_configs_keep_legacy_model_map(self):
        admin = UserModel(username=f"llm_admin_{id(self)}", password_hash="x", role="admin")
        self.db.add(admin)
        self.db.commit()
        self.db.refresh(admin)
        try:
            main.save_llm_config_api(
                main.LLMConfigSchema(
                    provider="openai",
                    model="gpt-5.5",
                    api_key="sk-test",
                    base_url="https://llm.example.com/v1",
                    module_models={
                        "assistant": {"provider": "anthropic", "model": "claude-sonnet-4"},
                        "risk": "gpt-5.5",
                    },
                ),
                db=self.db,
                current_user=admin,
            )

            payload = main.get_llm_config_api(db=self.db, current_user=admin)
            self.assertEqual(payload["module_models"]["assistant"], "claude-sonnet-4")
            self.assertEqual(
                payload["module_model_configs"]["assistant"]["provider"],
                "anthropic",
            )
            self.assertEqual(payload["module_models"]["risk"], "gpt-5.5")

            public_payload = main.get_llm_config_api(db=self.db, current_user=self.user)
            self.assertEqual(public_payload["scope"], "tier_selection")
            self.assertEqual(public_payload["module_model_configs"], {})
            self.assertNotIn("claude-sonnet-4", public_payload["models"])
        finally:
            self.db.query(UserModel).filter(UserModel.id == admin.id).delete()
            self.db.commit()

    def test_token_cost_recent_rows_use_numbered_ten_row_pages(self):
        for index in range(23):
            self.db.add(
                LLMUsageRecord(
                    user_id=self.user.id,
                    module_key="smart_research",
                    provider="openai",
                    model="gpt-page-test",
                    request_id=f"page-test:{self.user.id}:{index}",
                    input_tokens=index + 1,
                    output_tokens=1,
                    total_tokens=index + 2,
                    usage_source="upstream",
                )
            )
        self.db.commit()

        first = main.get_admin_token_cost_dashboard(
            days=30,
            user_id=self.user.id,
            module_key="smart_research",
            model="gpt-page-test",
            page=1,
            page_size=10,
            db=self.db,
        )
        third = main.get_admin_token_cost_dashboard(
            days=30,
            user_id=self.user.id,
            module_key="smart_research",
            model="gpt-page-test",
            page=3,
            page_size=10,
            db=self.db,
        )

        self.assertEqual(first["recent_pagination"]["pages"], 3)
        self.assertEqual(first["recent_pagination"]["total"], 23)
        self.assertEqual(len(first["recent"]), 10)
        self.assertEqual(len(third["recent"]), 3)
        self.assertTrue(
            {row["id"] for row in first["recent"]}.isdisjoint(
                {row["id"] for row in third["recent"]}
            )
        )

    def test_profile_phone_is_e164_normalized_and_duplicate_safe(self):
        country, number, e164 = main._normalize_profile_phone("+86", "138 0013 8000")
        self.assertEqual((country, number, e164), ("+86", "13800138000", "+8613800138000"))

        other = UserModel(
            username=f"phone_owner_{id(self)}",
            password_hash="x",
            role="normal",
            phone_country_code="+86",
            phone_number="13800138000",
            phone_e164="+8613800138000",
        )
        self.db.add(other)
        self.db.commit()
        self.db.refresh(other)
        try:
            with self.assertRaises(HTTPException) as raised:
                main.update_profile(
                    main.ProfileUpdateRequest(
                        phone_country_code="+86",
                        phone_number="13800138000",
                    ),
                    db=self.db,
                    current_user=self.user,
                )
            self.assertEqual(raised.exception.status_code, 409)
        finally:
            self.db.query(UserModel).filter(UserModel.id == other.id).delete()
            self.db.commit()

    def test_non_admin_cannot_save_or_read_admin_factor_presets(self):
        preset_name = f"admin-factors-{id(self)}"
        restricted = main.FactorPresetSaveRequest(
            name=preset_name,
            config=[{"factor": "ma60_gap", "params": []}],
        )
        with self.assertRaises(HTTPException) as raised:
            main.save_factor_preset(restricted, db=self.db, current_user=self.user)
        self.assertEqual(raised.exception.status_code, 403)

        admin = UserModel(username=f"factor_admin_{id(self)}", password_hash="x", role="admin")
        self.db.add(admin)
        self.db.commit()
        self.db.refresh(admin)
        try:
            saved = main.save_factor_preset(
                main.FactorPresetSaveRequest(
                    name=preset_name,
                    config=[
                        {"factor": "market_cap", "params": []},
                        {"factor": "ma60_gap", "params": []},
                    ],
                ),
                db=self.db,
                current_user=admin,
            )
            normal_rows = main.list_factor_presets(db=self.db, current_user=self.user)
            normal_row = next(item for item in normal_rows if item["id"] == saved["id"])
            self.assertEqual([item["factor"] for item in normal_row["config"]], ["market_cap"])
        finally:
            self.db.query(FactorPreset).filter(FactorPreset.name == preset_name).delete()
            self.db.query(UserModel).filter(UserModel.id == admin.id).delete()
            self.db.commit()

    @patch("main.requests.post")
    def test_stripe_checkout_uses_real_session_api(self, post):
        post.return_value.status_code = 200
        post.return_value.json.return_value = {"url": "https://checkout.stripe.com/c/session"}
        url = main._create_stripe_checkout_session(
            secret_key="sk_test_secret",
            price_id="price_123",
            trade_no="trade-stripe-session",
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
            email="user@example.com",
        )
        self.assertEqual(url, "https://checkout.stripe.com/c/session")
        args, kwargs = post.call_args
        self.assertEqual(args[0], "https://api.stripe.com/v1/checkout/sessions")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer sk_test_secret")
        self.assertEqual(kwargs["data"]["client_reference_id"], "trade-stripe-session")

    def test_stripe_webhook_signature_requires_secret(self):
        payload = b'{"type":"checkout.session.completed"}'
        self.assertFalse(main._verify_stripe_signature(payload, "", ""))
        timestamp = "1783418400"
        expected = hmac.new(
            b"whsec_test",
            f"{timestamp}.{payload.decode('utf-8')}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        self.assertTrue(
            main._verify_stripe_signature(
                payload,
                f"t={timestamp},v1={expected}",
                "whsec_test",
            )
        )

    def test_order_completion_is_idempotent_and_provider_guarded(self):
        order = SubscriptionOrder(
            trade_no=f"trade-{id(self)}",
            user_id=self.user.id,
            plan_id=self.plan.id,
            provider="epay",
            amount_cents=4900,
            currency="CNY",
            status="pending",
        )
        self.db.add(order)
        self.db.commit()

        completed = main._complete_subscription_order(self.db, order.trade_no, "epay", {"ok": True})
        self.assertTrue(completed["completed"])
        again = main._complete_subscription_order(self.db, order.trade_no, "epay", {"ok": True})
        self.assertFalse(again["completed"])

        order2 = SubscriptionOrder(
            trade_no=f"trade-guard-{id(self)}",
            user_id=self.user.id,
            plan_id=self.plan.id,
            provider="stripe",
            amount_cents=4900,
            currency="CNY",
            status="pending",
        )
        self.db.add(order2)
        self.db.commit()
        with self.assertRaises(ValueError):
            main._complete_subscription_order(self.db, order2.trade_no, "epay", {})

    def test_risk_sector_options_include_market_sources(self):
        stock = Stock(code=f"T{id(self)}", name="测试股", industry="半导体", board="科创板")
        board = ConceptBoard(code=f"C{id(self)}", name="人工智能", stock_count=88)
        self.db.add(stock)
        self.db.add(board)
        self.db.commit()
        options = main._risk_sector_options(self.db)
        names = {item["name"] for item in options}
        self.assertIn("半导体", names)
        self.assertIn("科创板", names)
        self.assertIn("人工智能", names)

    @patch("llm_factory.get_llm_config")
    def test_risk_assessment_get_is_read_only_and_run_charges(self, get_llm_config):
        get_llm_config.return_value = {"api_key": ""}
        read_only = main.get_risk_ai_assessment(
            db=self.db,
            current_user=self.user,
        )
        self.assertEqual(read_only["credit_summary"], None)
        self.assertEqual(
            self.db.query(CreditLedger).filter(CreditLedger.user_id == self.user.id).count(),
            0,
        )

        charged = main.run_risk_ai_assessment(
            main.RiskAiAssessmentRunRequest(use_llm=True),
            db=self.db,
            current_user=self.user,
        )
        self.assertIsNotNone(charged["credit_summary"])
        self.assertEqual(charged["credit_summary"]["credits_remaining"], 50)
        ledger = (
            self.db.query(CreditLedger)
            .filter(CreditLedger.user_id == self.user.id)
            .first()
        )
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.amount, 30)

    @patch("main.requests.post")
    def test_robot_webhook_delivery_is_best_effort(self, post):
        post.return_value.status_code = 200
        config = {
            "feishu": {"enabled": True, "webhook_url": "https://open.feishu.cn/webhook/test", "secret": ""},
            "wecom": {"enabled": False, "webhook_url": ""},
            "telegram": {"enabled": False, "bot_token": "", "chat_id": ""},
        }
        main._save_user_robot_webhook_config(self.db, self.user, config)
        results = main._deliver_robot_webhooks(self.db, self.user, "标题", "内容")
        self.assertEqual(results[0]["provider"], "feishu")
        self.assertTrue(results[0]["ok"])
        post.assert_called_once()

    def test_robot_webhook_rejects_untrusted_hosts(self):
        ok, error = main._validate_robot_webhook_url("feishu", "http://127.0.0.1/hook")
        self.assertFalse(ok)
        self.assertIn("https", error)
        ok, error = main._validate_robot_webhook_url("wecom", "https://example.com/hook")
        self.assertFalse(ok)
        self.assertIn("not allowed", error)
        ok, error = main._validate_robot_webhook_url(
            "telegram",
            "https://api.telegram.org/bot123/sendMessage",
        )
        self.assertTrue(ok)

    def test_notification_templates_require_svip_or_admin(self):
        custom = {
            "templates": {
                "risk_events": "CUSTOM {title} {content}",
            }
        }
        normal_config = main._save_user_robot_webhook_config(self.db, self.user, custom)
        self.assertNotEqual(
            normal_config["templates"]["risk_events"],
            "CUSTOM {title} {content}",
        )

        self.user.role = "svip"
        self.db.commit()
        svip_config = main._save_user_robot_webhook_config(self.db, self.user, custom)
        self.assertEqual(
            svip_config["templates"]["risk_events"],
            "CUSTOM {title} {content}",
        )

    @patch("main.requests.post")
    def test_notification_scope_can_disable_delivery(self, post):
        post.return_value.status_code = 200
        config = {
            "feishu": {"enabled": True, "webhook_url": "https://open.feishu.cn/webhook/test", "secret": ""},
            "scope": {"risk_events": False, "system_status": True},
        }
        main._save_user_robot_webhook_config(self.db, self.user, config)
        disabled = main._deliver_robot_webhooks(
            self.db,
            self.user,
            "风险",
            "内容",
            "risk",
        )
        self.assertEqual(disabled, [])
        post.assert_not_called()

        delivered = main._deliver_robot_webhooks(
            self.db,
            self.user,
            "系统",
            "内容",
            "system",
        )
        self.assertEqual(delivered[0]["provider"], "feishu")
        post.assert_called_once()


if __name__ == "__main__":
    unittest.main()
