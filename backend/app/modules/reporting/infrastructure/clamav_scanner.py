"""
app/modules/reporting/infrastructure/clamav_scanner.py — Antivirus via a ClamAV daemon (clamd).

Speaks the clamd INSTREAM protocol: the file is streamed in length-prefixed chunks and the daemon
answers "stream: OK" or "stream: <signature> FOUND". Only used when CLAMAV_HOST is configured.
"""

from __future__ import annotations

import asyncio
import struct

from app.modules.reporting.application.ports import MalwareScannerPort, ScanVerdict

CHUNK = 64 * 1024


class ClamAvScanner(MalwareScannerPort):
    def __init__(self, host: str, port: int = 3310, timeout: float = 20.0) -> None:
        self.host, self.port, self.timeout = host, port, timeout

    async def scan(self, data: bytes) -> ScanVerdict:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(self.host, self.port), self.timeout)
        try:
            writer.write(b"zINSTREAM\0")
            for i in range(0, len(data), CHUNK):
                chunk = data[i : i + CHUNK]
                writer.write(struct.pack("!I", len(chunk)) + chunk)
            writer.write(struct.pack("!I", 0))
            await writer.drain()
            reply = (await asyncio.wait_for(reader.read(1024), self.timeout)).rstrip(b"\0\n").decode("utf-8", "replace")
        finally:
            writer.close()
        if reply.endswith("OK"):
            return ScanVerdict(clean=True)
        if reply.endswith("FOUND"):
            return ScanVerdict(clean=False, signature=reply.removeprefix("stream:").removesuffix("FOUND").strip())
        raise RuntimeError(f"Unexpected clamd reply: {reply[:80]}")
