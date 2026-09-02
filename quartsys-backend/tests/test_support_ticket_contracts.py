import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import Notification, SupportTicket  # noqa: E402
from models import User as UserModel  # noqa: E402


class SupportTicketContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main_text = (BACKEND_DIR / "main.py").read_text(encoding="utf-8")
        cls.models_text = (BACKEND_DIR / "models.py").read_text(encoding="utf-8")
        cls.frontend_text = (
            ROOT
            / "quartsys-fronted"
            / "src"
            / "components"
            / "settings"
            / "SupportTicketsPanel.tsx"
        ).read_text(encoding="utf-8")

    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            engine,
            tables=[UserModel.__table__, SupportTicket.__table__, Notification.__table__],
        )
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def test_support_ticket_rows_are_user_scoped(self):
        first = UserModel(username="first", email="first@example.com", password_hash="x")
        second = UserModel(username="second", email="second@example.com", password_hash="x")
        self.db.add_all([first, second])
        self.db.flush()
        self.db.add_all(
            [
                SupportTicket(
                    user_id=first.id,
                    category="bug",
                    subject="First ticket",
                    message="Only the first user can list this ticket.",
                ),
                SupportTicket(
                    user_id=second.id,
                    category="suggestion",
                    subject="Second ticket",
                    message="Only the second user can list this ticket.",
                ),
            ]
        )
        self.db.commit()

        first_rows = (
            self.db.query(SupportTicket)
            .filter(SupportTicket.user_id == first.id)
            .all()
        )
        self.assertEqual([row.subject for row in first_rows], ["First ticket"])

    def test_backend_contract_requires_admin_and_notifies_on_resolution(self):
        self.assertIn('class SupportTicket(Base):', self.models_text)
        self.assertIn('"/api/support/tickets"', self.main_text)
        self.assertIn('"/api/admin/support/tickets"', self.main_text)
        self.assertIn('Depends(require_permission("system.manage"))', self.main_text)
        self.assertIn('SupportTicket.user_id == current_user.id', self.main_text)
        self.assertIn('transitioned_to_terminal', self.main_text)
        self.assertIn('type="support_ticket"', self.main_text)
        self.assertIn('background_tasks.add_task(_send_support_ticket_resolution_email', self.main_text)
        self.assertIn('html.escape(str(row.admin_reply or ""))', self.main_text)

    def test_frontend_exposes_user_panel_and_admin_workbench_separately(self):
        self.assertIn('createSupportTicket', self.frontend_text)
        self.assertIn('listMySupportTickets', self.frontend_text)
        self.assertIn('hasPermission("system.manage")', self.frontend_text)
        self.assertIn('<AdminTicketWorkbench', self.frontend_text)
        self.assertIn('updateAdminSupportTicket', self.frontend_text)


if __name__ == "__main__":
    unittest.main()
