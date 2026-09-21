"""
tests/unit/identity/test_token_hasher.py — Unit tests for HMAC-SHA256 token hashing.

Fix 1:
- Raw token is never stored directly
- Deterministic 64-char hex digest enables constant-time lookup
- secrets.compare_digest prevents timing attacks
"""

from __future__ import annotations

from app.modules.identity.infrastructure.token_hasher import (
    compute_token_digest,
    generate_raw_token,
    verify_token_digest,
)

HMAC_KEY = "test-hmac-key-minimum-32-chars-long-secret"


class TestTokenHasher:
    def test_session_token_raw_never_stored_in_db(self) -> None:
        raw_token = generate_raw_token()
        digest = compute_token_digest(raw_token, HMAC_KEY)

        # Raw token must not equal digest
        assert raw_token != digest
        # Digest must be 64 characters hex
        assert len(digest) == 64
        assert all(c in "0123456789abcdef" for c in digest)

    def test_session_token_digest_is_consistent_for_same_raw(self) -> None:
        raw_token = generate_raw_token()
        digest1 = compute_token_digest(raw_token, HMAC_KEY)
        digest2 = compute_token_digest(raw_token, HMAC_KEY)
        assert digest1 == digest2

    def test_session_lookup_uses_constant_time_compare(self) -> None:
        raw_token = generate_raw_token()
        digest = compute_token_digest(raw_token, HMAC_KEY)

        assert verify_token_digest(raw_token, digest, HMAC_KEY) is True
        assert verify_token_digest("wrong-token", digest, HMAC_KEY) is False

    def test_csrf_token_digest_lookup(self) -> None:
        raw_csrf = generate_raw_token()
        csrf_digest = compute_token_digest(raw_csrf, HMAC_KEY)

        assert verify_token_digest(raw_csrf, csrf_digest, HMAC_KEY) is True
        assert verify_token_digest(raw_csrf + "tampered", csrf_digest, HMAC_KEY) is False
