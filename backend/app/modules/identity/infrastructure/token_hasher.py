"""
app/modules/identity/infrastructure/token_hasher.py — HMAC-SHA256 Token Hasher.

Fix 1: Uses HMAC-SHA256 with a dedicated server secret (TOKEN_HMAC_KEY) instead of bcrypt.
Raw tokens are NEVER stored in persistent storage.
Comparisons are ALWAYS performed using constant-time comparison (secrets.compare_digest).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets


def generate_raw_token(byte_length: int = 32) -> str:
    """
    Generate a cryptographically secure random token (256 bits default)
    formatted as URL-safe base64 without padding.
    """
    raw_bytes = secrets.token_bytes(byte_length)
    return base64.urlsafe_b64encode(raw_bytes).decode("ascii").rstrip("=")


def compute_token_digest(raw_token: str, hmac_key: str) -> str:
    """
    Compute deterministic HMAC-SHA256 hex digest of raw token using the server's TOKEN_HMAC_KEY.
    This digest is 64 hex characters and is safe to index and look up in PostgreSQL.
    """
    key_bytes = hmac_key.encode("utf-8")
    msg_bytes = raw_token.encode("utf-8")
    return hmac.new(key_bytes, msg_bytes, hashlib.sha256).hexdigest()


def verify_token_digest(raw_token: str, stored_digest: str, hmac_key: str) -> bool:
    """
    Constant-time comparison between recomputed digest and stored digest.
    Prevents timing attacks.
    """
    computed = compute_token_digest(raw_token, hmac_key)
    return secrets.compare_digest(computed, stored_digest)
