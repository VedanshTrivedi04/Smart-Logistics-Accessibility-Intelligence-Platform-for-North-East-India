"""
app/modules/identity/infrastructure/rls_policy_sql.py — SQL statements for PostgreSQL Row Level Security.

Fix 3: Table-by-table RLS matrix.
Tables with RLS:
- organizations (self-read + platform admin)
- users (self-read + org admin/supervisors)
- memberships (org-scoped + self-read)
- grants (grantee read + grantor read + platform admin)
- sharing_grants (owner org OR recipient org)
- sessions (session-owner only)
- csrf_tokens (session-owner only via session FK)

Tables with NO RLS:
- jurisdictions (global public GIS reference data)
- auth_transactions (short-lived, single-use OIDC transient state)
"""

from __future__ import annotations

# Enable and force RLS on tables
ENABLE_RLS_STATEMENTS = [
    "ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE organizations FORCE ROW LEVEL SECURITY;",

    "ALTER TABLE users ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE users FORCE ROW LEVEL SECURITY;",

    "ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE memberships FORCE ROW LEVEL SECURITY;",

    "ALTER TABLE grants ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE grants FORCE ROW LEVEL SECURITY;",

    "ALTER TABLE sharing_grants ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE sharing_grants FORCE ROW LEVEL SECURITY;",

    "ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE sessions FORCE ROW LEVEL SECURITY;",

    "ALTER TABLE csrf_tokens ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE csrf_tokens FORCE ROW LEVEL SECURITY;",
]

# Table-by-table RLS policies
CREATE_POLICY_STATEMENTS = [
    # organizations
    """
    CREATE POLICY orgs_self_read ON organizations FOR SELECT
      USING (
        id::text = current_setting('app.current_org_id', true)
        OR current_setting('app.current_role', true) = 'PLATFORM_ADMINISTRATOR'
      );
    """,

    # users
    """
    CREATE POLICY users_self_read ON users FOR SELECT
      USING (
        id::text = current_setting('app.current_user_id', true)
        OR current_setting('app.current_role', true) IN (
            'PLATFORM_ADMINISTRATOR', 'DISTRICT_VERIFIER', 'REGIONAL_AUTHORITY', 'STATE_AUTHORITY'
        )
      );
    """,

    # memberships
    """
    CREATE POLICY memberships_org_scoped ON memberships FOR SELECT
      USING (org_id::text = current_setting('app.current_org_id', true));
    """,
    """
    CREATE POLICY memberships_self ON memberships FOR SELECT
      USING (user_id::text = current_setting('app.current_user_id', true));
    """,

    # grants
    """
    CREATE POLICY grants_grantee_read ON grants FOR SELECT
      USING (
        (grantee_user_id IS NOT NULL AND
          grantee_user_id::text = current_setting('app.current_user_id', true))
        OR
        (grantee_org_id IS NOT NULL AND
          grantee_org_id::text = current_setting('app.current_org_id', true))
        OR current_setting('app.current_role', true) = 'PLATFORM_ADMINISTRATOR'
      );
    """,
    """
    CREATE POLICY grants_grantor_read ON grants FOR SELECT
      USING (grantor_org_id::text = current_setting('app.current_org_id', true));
    """,

    # sharing_grants
    """
    CREATE POLICY sharing_grants_party_read ON sharing_grants FOR SELECT
      USING (
        owner_org_id::text = current_setting('app.current_org_id', true)
        OR
        recipient_org_id::text = current_setting('app.current_org_id', true)
        OR current_setting('app.current_role', true) = 'PLATFORM_ADMINISTRATOR'
      );
    """,

    # sessions
    """
    CREATE POLICY sessions_owner_read ON sessions FOR SELECT
      USING (
        user_id::text = current_setting('app.current_user_id', true)
        AND id::text = current_setting('app.current_session_id', true)
      );
    """,

    # csrf_tokens
    """
    CREATE POLICY csrf_session_owner ON csrf_tokens FOR SELECT
      USING (
        session_id::text = current_setting('app.current_session_id', true)
      );
    """,
]

DROP_POLICY_STATEMENTS = [
    "DROP POLICY IF EXISTS orgs_self_read ON organizations;",
    "DROP POLICY IF EXISTS users_self_read ON users;",
    "DROP POLICY IF EXISTS memberships_org_scoped ON memberships;",
    "DROP POLICY IF EXISTS memberships_self ON memberships;",
    "DROP POLICY IF EXISTS grants_grantee_read ON grants;",
    "DROP POLICY IF EXISTS grants_grantor_read ON grants;",
    "DROP POLICY IF EXISTS sharing_grants_party_read ON sharing_grants;",
    "DROP POLICY IF EXISTS sessions_owner_read ON sessions;",
    "DROP POLICY IF EXISTS csrf_session_owner ON csrf_tokens;",
]
