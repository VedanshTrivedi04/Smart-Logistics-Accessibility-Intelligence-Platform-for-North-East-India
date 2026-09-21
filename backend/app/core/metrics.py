"""
app/core/metrics.py — Prometheus observability metrics for authentication & authorization.

These metrics track:
- Authentication attempts and outcomes
- Authorization denials by capability and reason
- CSRF and Origin validation violations
- Session revocations
- OIDC flow progression and drop-offs
"""

from __future__ import annotations

from prometheus_client import Counter

auth_success_total = Counter(
    "ner_auth_success_total",
    "Total successful authentications",
    ["auth_method"],  # "session_cookie", "dev_header", "oidc_callback"
)

auth_failure_total = Counter(
    "ner_auth_failure_total",
    "Total authentication failures",
    ["reason"],  # "missing_cookie", "expired", "revoked", "idle_timeout", "invalid_digest", etc.
)

authz_denied_total = Counter(
    "ner_authz_denied_total",
    "Total authorization denials",
    ["capability", "reason"],  # capability name, reason code
)

csrf_failure_total = Counter(
    "ner_csrf_failure_total",
    "Total CSRF validation failures",
    ["reason"],  # "missing_token", "invalid_token", "expired_token"
)

origin_failure_total = Counter(
    "ner_origin_failure_total",
    "Total Origin header validation failures",
    ["reason"],  # "missing_origin", "forbidden_origin"
)

session_revocation_total = Counter(
    "ner_session_revocation_total",
    "Total session revocations",
    ["reason"],  # "user_logout", "user_logout_all", "admin_revoked", "idle_timeout"
)

oidc_failure_total = Counter(
    "ner_oidc_failure_total",
    "Total OIDC flow failures",
    ["step"],  # "state_invalid", "token_exchange", "id_token_validation", "no_membership"
)
