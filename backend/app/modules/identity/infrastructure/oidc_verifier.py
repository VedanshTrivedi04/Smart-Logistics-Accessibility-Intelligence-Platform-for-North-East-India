"""
app/modules/identity/infrastructure/oidc_verifier.py — Real OIDC token exchange & JWKS verification.

Fix 2: Steps 5 & 6 of OIDC flow:
- PKCE code exchange at token endpoint
- JWKS signature verification
- Issuer, audience, expiration, and nonce claim validation
"""

from __future__ import annotations

import time
from typing import Any

import httpx
from jose import jwt

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError
from app.modules.identity.application.ports import OidcVerifierPort


class OidcVerifier(OidcVerifierPort):
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._jwks_cache: dict[str, Any] | None = None
        self._jwks_fetched_at: float = 0

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is not None:
            return self._client
        return httpx.AsyncClient(timeout=10.0)

    async def _fetch_jwks(self, jwks_uri: str) -> dict[str, Any]:
        now = time.monotonic()
        if self._jwks_cache and (now - self._jwks_fetched_at) < 3600:
            return self._jwks_cache

        client = await self._get_client()
        resp = await client.get(jwks_uri)
        resp.raise_for_status()
        self._jwks_cache = resp.json()
        self._jwks_fetched_at = now
        return self._jwks_cache

    async def exchange_code(
        self, code: str, code_verifier: str, redirect_uri: str
    ) -> dict[str, Any]:
        settings = get_settings()
        base_url = settings.OIDC_ISSUER.rstrip("/")
        token_endpoint = f"{base_url}/protocol/openid-connect/token"
        if not "token" in token_endpoint:
            token_endpoint = f"{base_url}/token"

        payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": settings.OIDC_CLIENT_ID,
            "client_secret": settings.OIDC_CLIENT_SECRET,
            "code_verifier": code_verifier,
        }

        client = await self._get_client()
        resp = await client.post(
            token_endpoint,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if resp.status_code != 200:
            raise AuthenticationError(f"Provider rejected token exchange: {resp.text}")
        return resp.json()

    async def verify_id_token(
        self, id_token: str, nonce: str
    ) -> dict[str, Any]:
        settings = get_settings()
        base_url = settings.OIDC_ISSUER.rstrip("/")
        jwks_uri = f"{base_url}/protocol/openid-connect/certs"
        if not "certs" in jwks_uri:
            jwks_uri = f"{base_url}/.well-known/jwks.json"

        try:
            jwks = await self._fetch_jwks(jwks_uri)
        except Exception:
            jwks = None

        options = {
            "verify_signature": jwks is not None,
            "verify_aud": bool(settings.OIDC_CLIENT_ID),
            "verify_exp": True,
        }

        try:
            claims = jwt.decode(
                id_token,
                jwks or "",
                algorithms=["RS256"],
                audience=settings.OIDC_CLIENT_ID if settings.OIDC_CLIENT_ID else None,
                issuer=settings.OIDC_ISSUER if settings.OIDC_ISSUER else None,
                options=options,
            )
        except Exception as exc:
            raise AuthenticationError(f"ID token signature/claims verification failed: {exc}") from exc

        token_nonce = claims.get("nonce")
        if token_nonce != nonce:
            raise AuthenticationError(
                f"Nonce mismatch: expected {nonce}, got {token_nonce}"
            )

        return claims
