import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/quartsys-agent-analysis-test.db")

import financial_agent_analysis as service  # noqa: E402
import main  # noqa: E402
from models import (  # noqa: E402
    AgentAnalysisMessage,
    AgentAnalysisSession,
    CreditLedger,
    FinancialAgentProfile,
    UserSubscription,
)
from models import User as UserModel  # noqa: E402


class AgentAnalysisTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        try:
            main.scheduler.shutdown(wait=False)
        except Exception:
            pass

    def setUp(self):
        self.db = main.SessionLocal()
        self.user = UserModel(
            username=f"agent_analysis_{id(self)}",
            email=f"agent_analysis_{id(self)}@example.com",
            password_hash="x",
            role="normal",
        )
        self.other_user = UserModel(
            username=f"agent_analysis_other_{id(self)}",
            email=f"agent_analysis_other_{id(self)}@example.com",
            password_hash="x",
            role="normal",
        )
        self.db.add_all([self.user, self.other_user])
        self.db.commit()
        self.db.refresh(self.user)
        self.db.refresh(self.other_user)

    def tearDown(self):
        try:
            session_ids = [
                row.id
                for row in self.db.query(AgentAnalysisSession)
                .filter(AgentAnalysisSession.user_id.in_([self.user.id, self.other_user.id]))
                .all()
            ]
            if session_ids:
                self.db.query(AgentAnalysisMessage).filter(
                    AgentAnalysisMessage.session_id.in_(session_ids)
                ).delete(synchronize_session=False)
                self.db.query(AgentAnalysisSession).filter(
                    AgentAnalysisSession.id.in_(session_ids)
                ).delete(synchronize_session=False)
            self.db.query(FinancialAgentProfile).filter(
                FinancialAgentProfile.owner_user_id.in_([self.user.id, self.other_user.id])
            ).delete(synchronize_session=False)
            self.db.query(CreditLedger).filter(
                CreditLedger.user_id.in_([self.user.id, self.other_user.id])
            ).delete(synchronize_session=False)
            self.db.query(UserSubscription).filter(
                UserSubscription.user_id.in_([self.user.id, self.other_user.id])
            ).delete(synchronize_session=False)
            self.db.query(UserModel).filter(
                UserModel.id.in_([self.user.id, self.other_user.id])
            ).delete(synchronize_session=False)
            self.db.commit()
        finally:
            self.db.close()

    def test_default_profiles_are_seeded_and_visible(self):
        main._ensure_default_financial_agents(self.db)
        rows = (
            main._financial_agent_visible_query(self.db, self.user)
            .filter(FinancialAgentProfile.is_builtin.is_(True))
            .all()
        )
        names = {row.name for row in rows}
        self.assertGreaterEqual(len(rows), 7)
        self.assertIn("巴菲特价值分析师", names)
        self.assertIn("组合风险官", names)
        self.assertIn("agent_analysis.use", main.permissions_for_role("normal"))

    def test_role_limits_and_credit_formula(self):
        normal = main._financial_agent_role_limits("normal")
        vip = main._financial_agent_role_limits("vip")
        svip = main._financial_agent_role_limits("svip")
        self.assertFalse(normal["can_create_agents"])
        self.assertEqual((normal["max_agents"], normal["max_initial_rounds"]), (2, 1))
        self.assertEqual((vip["max_agents"], vip["max_initial_rounds"]), (4, 2))
        self.assertEqual((svip["max_agents"], svip["max_initial_rounds"]), (6, 3))
        self.assertEqual(main._agent_analysis_credit_cost(2, 1), 60)
        self.assertEqual(main._agent_analysis_credit_cost(4, 2), 180)
        self.assertEqual(main._agent_analysis_credit_cost(1, 1), 40)

    def test_normal_user_cannot_create_private_agent(self):
        payload = main.FinancialAgentProfileRequest(
            name="测试私有分析师",
            system_prompt="这是一个足够长的系统提示词，用于验证普通用户不能创建私有分析师。",
        )
        with self.assertRaises(main.HTTPException) as error:
            main.create_financial_agent(payload, self.db, self.user)
        self.assertEqual(error.exception.status_code, 403)

    def test_private_profile_is_only_visible_to_owner(self):
        self.user.role = "vip"
        self.other_user.role = "admin"
        self.db.commit()
        private = FinancialAgentProfile(
            owner_user_id=self.user.id,
            name="私有分析师",
            category="general",
            system_prompt="这是一个足够长的测试系统提示词，用于验证用户隔离。",
            tools_json='["database"]',
            skills_json="[]",
            mcp_servers_json="[]",
            visibility="private",
            enabled=True,
        )
        self.db.add(private)
        self.db.commit()
        owner_ids = {
            row.id for row in main._financial_agent_visible_query(self.db, self.user).all()
        }
        other_ids = {
            row.id
            for row in main._financial_agent_visible_query(self.db, self.other_user).all()
        }
        self.assertIn(private.id, owner_ids)
        self.assertNotIn(private.id, other_ids)
        with self.assertRaises(main.HTTPException) as error:
            main.update_financial_agent(
                private.id,
                main.FinancialAgentProfileRequest(
                    name="管理员不应修改别人的私有分析师",
                    system_prompt="这是一个足够长的系统提示词，用于验证管理员不能修改其他用户私有分析师。",
                ),
                self.db,
                self.other_user,
            )
        self.assertEqual(error.exception.status_code, 403)

    def test_admin_cannot_read_other_user_discussion_sessions(self):
        self.other_user.role = "admin"
        user_session = AgentAnalysisSession(
            user_id=self.user.id,
            title="普通用户讨论",
            subject_type="stock",
            subject="这是普通用户的私有讨论",
            selected_agent_ids_json="[]",
            max_rounds=1,
            current_round=1,
            status="done",
            progress_json="{}",
        )
        admin_session = AgentAnalysisSession(
            user_id=self.other_user.id,
            title="管理员自己的讨论",
            subject_type="stock",
            subject="这是管理员自己的讨论",
            selected_agent_ids_json="[]",
            max_rounds=1,
            current_round=1,
            status="done",
            progress_json="{}",
        )
        self.db.add_all([user_session, admin_session])
        self.db.commit()
        self.db.refresh(user_session)
        self.db.refresh(admin_session)

        listed = main.list_agent_analysis_sessions(self.db, self.other_user)["sessions"]
        listed_ids = {item["id"] for item in listed}
        self.assertIn(admin_session.id, listed_ids)
        self.assertNotIn(user_session.id, listed_ids)

        with self.assertRaises(main.HTTPException) as error:
            main.get_agent_analysis_session(user_session.id, self.db, self.other_user)
        self.assertEqual(error.exception.status_code, 404)

    def test_rich_response_normalization_accepts_supported_blocks(self):
        raw = json.dumps(
            {
                "markdown": "## 结论\n基于现有数据保持中性。",
                "stance": "neutral",
                "confidence": 63,
                "blocks": [
                    {
                        "type": "chart",
                        "chart_type": "line",
                        "title": "价格",
                        "categories": ["D1", "D2"],
                        "series": [{"name": "收盘", "data": [10, 11]}],
                    },
                    {
                        "type": "table",
                        "columns": ["指标", "值"],
                        "rows": [["PE", "20"]],
                    },
                    {"type": "image", "url": "javascript:alert(1)"},
                ],
            },
            ensure_ascii=False,
        )
        parsed = service.parse_agent_response(raw)
        self.assertEqual(parsed["stance"], "neutral")
        self.assertEqual(parsed["confidence"], 63)
        self.assertEqual([block["type"] for block in parsed["blocks"]], ["chart", "table"])

    def test_local_agent_and_moderator_fallback_are_evidence_bound(self):
        context = {
            "targets": [
                {
                    "code": "600519",
                    "name": "贵州茅台",
                    "pe_ratio": 24.1,
                    "pb_ratio": 7.2,
                    "roe": 31.0,
                    "latest": {"close": 1500, "change_pct": 1.2},
                    "recent_stats": {"change_20d_pct": 6.5, "change_60d_pct": 8.2},
                    "concepts": [],
                }
            ],
            "news": {"items": []},
            "web_search": {"items": []},
        }
        profile = service.default_financial_agent_profiles()[3]
        response = service.build_local_agent_response(profile, context, "LLM unavailable")
        self.assertEqual(response["stance"], "bullish")
        self.assertIn("600519", response["markdown"])
        transcript = [
            {
                "sender_type": "agent",
                "sender_name": "A",
                "meta": {"stance": "bullish", "confidence": 70},
            },
            {
                "sender_type": "agent",
                "sender_name": "B",
                "meta": {"stance": "bearish", "confidence": 60},
            },
        ]
        final = service.build_local_final_result(transcript)
        self.assertEqual(final["stance"], "mixed")
        self.assertEqual(final["confidence"], 65)

    def test_mcp_config_requires_endpoint_and_tool(self):
        normalized = service.normalize_mcp_servers(
            [
                {"name": "missing tool", "endpoint": "https://example.com/mcp"},
                {
                    "name": "valid",
                    "endpoint": "https://example.com/mcp",
                    "tool": "market_search",
                    "enabled": True,
                },
            ]
        )
        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0]["tool"], "market_search")

    def test_svip_mcp_is_limited_to_admin_allowlist(self):
        self.user.role = "svip"
        self.db.commit()
        approved = {
            "name": "Market MCP",
            "endpoint": "https://example.com/mcp",
            "tool": "market_search",
            "enabled": True,
        }
        main._save_financial_agent_mcp_settings(self.db, {"servers": [approved]})
        result = main._financial_agent_mcp_for_user(self.db, self.user, [approved])
        self.assertEqual(len(result), 1)
        with self.assertRaises(main.HTTPException):
            main._financial_agent_mcp_for_user(
                self.db,
                self.user,
                [{**approved, "tool": "unapproved_tool"}],
            )
        with self.assertRaises(main.HTTPException):
            main._save_financial_agent_mcp_settings(
                self.db,
                {
                    "servers": [
                        {
                            "name": "Local MCP",
                            "endpoint": "http://127.0.0.1:9000/mcp",
                            "tool": "market_search",
                        }
                    ]
                },
            )
        main._save_financial_agent_mcp_settings(self.db, {"servers": []})

    def test_session_creation_records_user_message_and_charges_credits(self):
        main.ensure_default_subscription_plans()
        main._ensure_default_financial_agents(self.db)
        profiles = (
            self.db.query(FinancialAgentProfile)
            .filter(FinancialAgentProfile.is_builtin.is_(True))
            .order_by(FinancialAgentProfile.id.asc())
            .limit(2)
            .all()
        )
        result = main.create_agent_analysis_session(
            background_tasks=main.BackgroundTasks(),
            payload=main.AgentAnalysisSessionRequest(
                title="用户参与测试",
                subject="分析 600519 的估值和主要风险",
                symbol="600519",
                agent_ids=[item.id for item in profiles],
                max_rounds=1,
            ),
            db=self.db,
            current_user=self.user,
        )
        session = result["session"]
        self.assertEqual(
            result["credit_summary"]["last_charge"]["cost"],
            result["billing_estimate"]["estimated_credits"],
        )
        self.assertGreaterEqual(result["credit_summary"]["last_charge"]["cost"], 60)
        self.assertEqual(session["messages"][0]["sender_type"], "user")
        self.assertIn("600519", session["messages"][0]["content_markdown"])

        row = self.db.query(AgentAnalysisSession).filter_by(id=session["id"]).first()
        row.current_round = 1
        row.max_rounds = 1
        row.status = "done"
        self.db.commit()
        follow_up = main.post_agent_analysis_user_message(
            session_id=row.id,
            payload=main.AgentAnalysisUserMessageRequest(
                content="请技术分析师单独解释趋势失效条件",
                target_agent_id=profiles[0].id,
            ),
            background_tasks=main.BackgroundTasks(),
            db=self.db,
            current_user=self.user,
        )
        self.assertEqual(
            follow_up["credit_summary"]["last_charge"]["cost"],
            follow_up["billing_estimate"]["estimated_credits"],
        )
        self.assertGreaterEqual(follow_up["credit_summary"]["last_charge"]["cost"], 40)
        self.assertEqual(follow_up["queued_round"], 2)
        last_message = follow_up["session"]["messages"][-1]
        self.assertEqual(last_message["sender_type"], "user")
        self.assertEqual(last_message["meta"]["target_agent_id"], profiles[0].id)

    def test_insufficient_credits_roll_back_session_and_initial_message(self):
        main.ensure_default_subscription_plans()
        main._ensure_default_financial_agents(self.db)
        profiles = (
            self.db.query(FinancialAgentProfile)
            .filter(FinancialAgentProfile.is_builtin.is_(True))
            .order_by(FinancialAgentProfile.id.asc())
            .limit(2)
            .all()
        )
        subscription = main._ensure_user_subscription(self.db, self.user)
        subscription.credits_total = 10
        subscription.credits_used = 0
        self.db.commit()
        with self.assertRaises(main.HTTPException) as error:
            main.create_agent_analysis_session(
                background_tasks=main.BackgroundTasks(),
                payload=main.AgentAnalysisSessionRequest(
                    subject="余额不足时不应留下半成品会话",
                    agent_ids=[item.id for item in profiles],
                    max_rounds=1,
                ),
                db=self.db,
                current_user=self.user,
            )
        self.assertEqual(error.exception.status_code, 402)
        self.assertEqual(
            self.db.query(AgentAnalysisSession)
            .filter(AgentAnalysisSession.user_id == self.user.id)
            .count(),
            0,
        )
        self.assertEqual(
            self.db.query(AgentAnalysisMessage)
            .join(AgentAnalysisSession)
            .filter(AgentAnalysisSession.user_id == self.user.id)
            .count(),
            0,
        )

    def test_legacy_session_serialization_includes_original_user_question(self):
        session = AgentAnalysisSession(
            user_id=self.user.id,
            title="旧会话",
            subject_type="stock",
            subject="旧会话中的原始研究问题",
            symbol="000001",
            selected_agent_ids_json="[]",
            max_rounds=1,
            current_round=1,
            status="done",
            progress_json="{}",
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        payload = main._serialize_agent_analysis_session(
            self.db, session, include_messages=True
        )
        self.assertEqual(payload["messages"][0]["sender_type"], "user")
        self.assertTrue(payload["messages"][0]["meta"]["legacy_session"])
        self.assertIn("000001", payload["messages"][0]["content_markdown"])

    def test_background_discussion_builds_messages_and_report(self):
        main._ensure_default_financial_agents(self.db)
        profiles = (
            self.db.query(FinancialAgentProfile)
            .filter(FinancialAgentProfile.is_builtin.is_(True))
            .order_by(FinancialAgentProfile.id.asc())
            .limit(2)
            .all()
        )
        session = AgentAnalysisSession(
            user_id=self.user.id,
            title="测试讨论",
            subject_type="stock",
            subject="分析 600519 的估值和风险",
            symbol="600519",
            selected_agent_ids_json=json.dumps([item.id for item in profiles]),
            max_rounds=1,
            current_round=0,
            status="pending",
            progress_json="{}",
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        context = {
            "query": session.subject,
            "targets": [
                {
                    "code": "600519",
                    "name": "贵州茅台",
                    "pe_ratio": 24.1,
                    "pb_ratio": 7.2,
                    "roe": 31.0,
                    "industry": "白酒",
                    "latest": {"close": 1500, "change_pct": 1.2},
                    "recent_stats": {"change_20d_pct": 3.0},
                    "concepts": [],
                }
            ],
            "market_temperature": {},
            "top_concepts": [],
            "research_tools": {},
            "f10": {"items": []},
            "news": {"items": []},
            "web_search": {"items": []},
            "evidence_chain": [],
            "limitations": [],
        }
        with patch.object(main, "_assistant_research_context", return_value=context), patch.object(
            main,
            "_llm_config_for_module",
            return_value={
                "provider": "openai",
                "model": "test-model",
                "api_key": None,
                "base_url": "https://example.com/v1",
            },
        ):
            main._run_agent_analysis_session(session.id, self.user.id)
        self.db.expire_all()
        completed = self.db.query(AgentAnalysisSession).filter_by(id=session.id).first()
        messages = (
            self.db.query(AgentAnalysisMessage)
            .filter(AgentAnalysisMessage.session_id == session.id)
            .order_by(AgentAnalysisMessage.id.asc())
            .all()
        )
        self.assertEqual(completed.status, "done")
        self.assertTrue(completed.report_markdown.startswith("# Agent 分析委员会报告"))
        self.assertEqual(len([item for item in messages if item.sender_type == "agent"]), 2)
        self.assertEqual(messages[-1].sender_type, "moderator")


if __name__ == "__main__":
    unittest.main()
