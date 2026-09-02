import asyncio
import os
import sys
import unittest
from pathlib import Path

from fastapi import HTTPException
from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/quartsys-permissions-test.db")

import main  # noqa: E402


class DummyUser:
    def __init__(self, role: str, permission_overrides_json: str | None = None):
        self.id = 1
        self.username = "dummy"
        self.email = "dummy@example.com"
        self.role = role
        self.avatar_url = ""
        self.permission_overrides_json = permission_overrides_json


class PermissionTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        try:
            main.scheduler.shutdown(wait=False)
        except Exception:
            pass

    def test_role_permissions_are_distinct(self):
        self.assertIn("system.manage", main.permissions_for_role("admin"))
        self.assertNotIn("llm.configure", main.permissions_for_role("normal"))
        self.assertNotIn("system.manage", main.permissions_for_role("normal"))
        self.assertIn("ai.insights", main.permissions_for_role("normal"))
        self.assertIn("smart_research.use", main.permissions_for_role("normal"))
        self.assertIn("agent_analysis.use", main.permissions_for_role("normal"))
        self.assertIn("factors.manage", main.permissions_for_role("normal"))
        self.assertIn("risk.view", main.permissions_for_role("normal"))
        self.assertNotIn("strategy.manage", main.permissions_for_role("normal"))
        self.assertNotIn("backtest.run", main.permissions_for_role("normal"))
        self.assertNotIn("trading.use", main.permissions_for_role("normal"))
        self.assertIn("ai.insights", main.permissions_for_role("vip"))
        self.assertIn("trading.use", main.permissions_for_role("vip"))
        self.assertIn("trading.use", main.permissions_for_role("svip"))
        self.assertEqual(main.normalize_user_role("user"), "normal")
        self.assertEqual(main.normalize_user_role("missing-role"), "normal")

    def test_require_permission_denies_missing_permission(self):
        dependency = main.require_permission("system.manage")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(dependency(DummyUser("normal")))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail["permission"], "system.manage")

    def test_user_permission_overrides_are_applied(self):
        user = DummyUser("normal", '["dashboard.view", "ai.insights"]')
        self.assertEqual(main.permissions_for_user(user), ["ai.insights", "dashboard.view"])
        self.assertTrue(main.user_has_permission(user, "ai.insights"))
        self.assertFalse(main.user_has_permission(user, "quote.view"))

    def test_non_admin_overrides_cannot_keep_system_permissions(self):
        user = DummyUser("vip", '["dashboard.view", "system.manage", "llm.configure"]')
        self.assertEqual(main.permissions_for_user(user), ["dashboard.view"])

    def test_admin_always_keeps_full_permissions(self):
        user = DummyUser("admin", '["dashboard.view"]')
        self.assertIn("system.manage", main.permissions_for_user(user))
        self.assertEqual(main.permissions_for_user(user), main.permissions_for_role("admin"))

    def test_builtin_factor_catalog_is_admin_only(self):
        normal = DummyUser("normal")
        admin = DummyUser("admin")

        self.assertEqual(main.get_builtin_factors_api(current_user=normal), {"factors": []})
        self.assertEqual(main.get_factor_templates_api(current_user=normal), {"templates": []})
        self.assertTrue(main.get_builtin_factors_api(current_user=admin)["factors"])
        self.assertTrue(main.get_factor_templates_api(current_user=admin)["templates"])

    def test_user_role_update_rejects_unknown_role(self):
        with self.assertRaises(ValidationError):
            main.UserRoleUpdate(role="owner")

    def test_admin_role_update_rejects_second_system_admin(self):
        db = main.SessionLocal()
        created_admin = None
        target = None
        try:
            current_admin = db.query(main.UserModel).filter(main.UserModel.role == "admin").first()
            if not current_admin:
                current_admin = main.UserModel(
                    username=f"only_admin_{id(self)}",
                    email=f"only_admin_{id(self)}@example.com",
                    password_hash="x",
                    role="admin",
                )
                db.add(current_admin)
                db.commit()
                db.refresh(current_admin)
                created_admin = current_admin
            target = main.UserModel(
                username=f"second_admin_{id(self)}",
                email=f"second_admin_{id(self)}@example.com",
                password_hash="x",
                role="normal",
            )
            db.add(target)
            db.commit()
            db.refresh(target)

            with self.assertRaises(HTTPException) as ctx:
                main.update_admin_user_role(
                    target.id,
                    main.UserRoleUpdate(role="admin"),
                    db=db,
                    current_user=current_admin,
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("只能有 1 个", ctx.exception.detail)
        finally:
            if target is not None:
                db.query(main.UserModel).filter(main.UserModel.id == target.id).delete()
            if created_admin is not None:
                db.query(main.UserModel).filter(main.UserModel.id == created_admin.id).delete()
            db.commit()
            db.close()

    def test_login_identifier_accepts_username_or_email(self):
        db = main.SessionLocal()
        username = f"login_user_{id(self)}"
        email = f"{username}@example.com"
        user = main.UserModel(
            username=username,
            email=email,
            password_hash=main.get_password_hash("secret123"),
            role="normal",
        )
        try:
            db.add(user)
            db.commit()
            db.refresh(user)

            by_username = main._find_user_by_login_identifier(db, username)
            by_email = main._find_user_by_login_identifier(db, email.upper())

            self.assertEqual(by_username.id, user.id)
            self.assertEqual(by_email.id, user.id)
            self.assertTrue(main.verify_password("secret123", by_email.password_hash))
            self.assertEqual(
                main.UserLogin(username="long.email.login.identifier@example.com", password="x").username,
                "long.email.login.identifier@example.com",
            )
        finally:
            db.query(main.UserModel).filter(main.UserModel.username == username).delete()
            db.commit()
            db.close()

    def test_user_data_export_section_helpers(self):
        payload = {
            "schema": "quartsys_user_data",
            "data": {
                "strategies": [{"id": 1}],
                "factors": [{"id": 2}],
                "watchlist": [{"id": 3}],
            },
            "counts": {"strategies": 1, "factors": 1, "watchlist": 1},
        }

        self.assertEqual(
            main._normalize_user_data_sections_param("strategies,factors", "watchlist"),
            ["strategies", "factors", "watchlist"],
        )
        self.assertEqual(main._filter_user_data_payload_sections(payload, [])["data"], payload["data"])

        filtered = main._filter_user_data_payload_sections(payload, ["factors"])
        self.assertEqual(list(filtered["data"].keys()), ["factors"])
        self.assertEqual(filtered["counts"], {"factors": 1})

        with self.assertRaises(HTTPException) as ctx:
            main._normalize_user_data_sections_param("unknown")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_customer_service_public_settings_require_ready_config(self):
        db = main.SessionLocal()
        try:
            db.query(main.SystemSetting).filter(
                main.SystemSetting.key == main.CUSTOMER_SERVICE_AI_SETTINGS_KEY
            ).delete()
            db.commit()

            self.assertFalse(main._customer_service_public_settings(db)["enabled"])

            main._save_customer_service_ai_settings(
                db,
                {
                    "enabled": True,
                    "display_title": "测试 AI客服",
                    "use_system_ai": False,
                    "provider": "custom",
                    "model": "support-model",
                    "api_url": "https://llm.example.com/v1",
                    "api_key": "support-secret-key",
                    "welcome_message": "欢迎咨询",
                },
            )
            public = main._customer_service_public_settings(db)
            admin_config = main._customer_service_ai_settings(db, masked=True)

            self.assertTrue(public["enabled"])
            self.assertEqual(public["display_title"], "测试 AI客服")
            self.assertNotIn("api_key", public)
            self.assertIn("****", admin_config["api_key"])
        finally:
            db.query(main.SystemSetting).filter(
                main.SystemSetting.key == main.CUSTOMER_SERVICE_AI_SETTINGS_KEY
            ).delete()
            db.commit()
            db.close()

    def test_public_analytics_event_feeds_admin_dashboard(self):
        db = main.SessionLocal()
        session_key = f"test_analytics_session_{id(self)}"
        visitor_key = f"test_analytics_visitor_{id(self)}"
        request = main.Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/public/analytics/event",
                "headers": [
                    (b"host", b"testserver"),
                    (b"user-agent", b"pytest chrome"),
                ],
                "client": ("127.0.0.1", 12345),
                "server": ("testserver", 80),
                "scheme": "http",
            }
        )
        try:
            for model in (
                main.AnalyticsApiLog,
                main.AnalyticsModuleUsage,
                main.AnalyticsPageView,
                main.AnalyticsSession,
            ):
                db.query(model).filter(model.session_key == session_key).delete()
            db.commit()

            main.record_public_analytics_event(
                request,
                main.AnalyticsEventRequest(
                    event_type="page_view",
                    session_key=session_key,
                    visitor_key=visitor_key,
                    path="/pytest-analytics",
                    title="Pytest Analytics",
                    source_type="direct",
                    device_type="pc",
                    is_entry=True,
                ),
                db=db,
            )
            main.record_public_analytics_event(
                request,
                main.AnalyticsEventRequest(
                    event_type="page_leave",
                    session_key=session_key,
                    visitor_key=visitor_key,
                    path="/pytest-analytics",
                    duration_seconds=72,
                    is_exit=True,
                ),
                db=db,
            )
            main.record_public_analytics_event(
                request,
                main.AnalyticsEventRequest(
                    event_type="module_usage",
                    session_key=session_key,
                    visitor_key=visitor_key,
                    path="/search?q=600000",
                    module_key="stock_search",
                    module_label="股票搜索",
                    action="search_success",
                    success=True,
                    result_count=1,
                    duration_ms=320,
                ),
                db=db,
            )
            db.add(
                main.AnalyticsApiLog(
                    method="GET",
                    path="/api/pytest-slow",
                    status_code=500,
                    duration_ms=2400,
                    success=False,
                    session_key=session_key,
                    visitor_key=visitor_key,
                )
            )
            db.commit()

            dashboard = main.get_admin_analytics_dashboard(days=7, db=db)
            self.assertGreaterEqual(dashboard["summary"]["today_pv"], 1)
            self.assertTrue(any(row["path"] == "/pytest-analytics" for row in dashboard["page_rank"]))
            self.assertTrue(any(row["module_key"] == "stock_search" for row in dashboard["feature_rank"]))
            self.assertTrue(any(row["path"] == "/api/pytest-slow" for row in dashboard["api_slow_top"]))
            self.assertNotIn("revenue", str(dashboard["funnel"]).lower())
        finally:
            for model in (
                main.AnalyticsApiLog,
                main.AnalyticsModuleUsage,
                main.AnalyticsPageView,
                main.AnalyticsSession,
            ):
                db.query(model).filter(model.session_key == session_key).delete()
            db.commit()
            db.close()


if __name__ == "__main__":
    unittest.main()
