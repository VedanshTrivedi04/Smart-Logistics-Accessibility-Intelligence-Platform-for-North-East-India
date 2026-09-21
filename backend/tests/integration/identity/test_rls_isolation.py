"""
tests/integration/identity/test_rls_isolation.py — Tests for Row Level Security policies.

Fix 3: Table-by-table RLS matrix.
"""

from __future__ import annotations

from app.modules.identity.infrastructure.rls_policy_sql import (
    CREATE_POLICY_STATEMENTS,
    ENABLE_RLS_STATEMENTS,
)


class TestRlsPolicies:
    def test_rls_enabled_on_all_tenanted_tables(self) -> None:
        expected_tables = {
            "organizations",
            "users",
            "memberships",
            "grants",
            "sharing_grants",
            "sessions",
            "csrf_tokens",
        }
        enabled_tables = {
            stmt.split()[2] for stmt in ENABLE_RLS_STATEMENTS if "ENABLE ROW LEVEL SECURITY" in stmt
        }
        assert enabled_tables == expected_tables

    def test_rls_policies_defined_for_all_tenanted_tables(self) -> None:
        policy_text = " ".join(CREATE_POLICY_STATEMENTS)
        assert "orgs_self_read ON organizations" in policy_text
        assert "users_self_read ON users" in policy_text
        assert "memberships_org_scoped ON memberships" in policy_text
        assert "grants_grantee_read ON grants" in policy_text
        assert "sharing_grants_party_read ON sharing_grants" in policy_text
        assert "sessions_owner_read ON sessions" in policy_text
        assert "csrf_session_owner ON csrf_tokens" in policy_text

    def test_jurisdictions_and_auth_transactions_not_in_rls(self) -> None:
        """Fix 3: Reference data and transient auth state must NOT have RLS."""
        all_stmts = " ".join(ENABLE_RLS_STATEMENTS)
        assert "jurisdictions" not in all_stmts
        assert "auth_transactions" not in all_stmts
