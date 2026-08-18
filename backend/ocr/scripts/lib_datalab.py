#!/usr/bin/env python3
"""Shared Datalab API helpers (stdlib only)."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE = "https://www.datalab.to"
POLL_INTERVAL_S = 2.0
MAX_POLLS = 300
USER_AGENT = "Mozilla/5.0 (compatible; DatalabOCR/1.0; +https://www.datalab.to)"


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


def require_api_key(root: Path) -> str:
    load_dotenv(root / ".env")
    key = os.environ.get("DATALAB_API_KEY", "").strip()
    if not key or key.startswith("your_api_key"):
        raise SystemExit(
            "DATALAB_API_KEY missing. Copy .env.example → .env and set your key."
        )
    return key


def api_base() -> str:
    return os.environ.get("DATALAB_API_BASE", DEFAULT_BASE).rstrip("/")


def multipart_encode(
    fields: dict[str, str],
    files: dict[str, tuple[str, bytes, str]] | None = None,
) -> tuple[bytes, str]:
    boundary = f"----datalab{int(time.time() * 1000)}"
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")
    for name, (filename, content, content_type) in (files or {}).items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(
            (
                f'Content-Disposition: form-data; name="{name}"; '
                f'filename="{filename}"\r\n'
            ).encode()
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode())
        body.extend(content)
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def http_json(
    method: str,
    url: str,
    api_key: str,
    body: bytes | None = None,
    content_type: str | None = None,
) -> dict:
    headers = {
        "X-API-Key": api_key,
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} {url}\n{detail}") from e


def http_json_soft(
    method: str,
    url: str,
    api_key: str,
    body: bytes | None = None,
    content_type: str | None = None,
    *,
    timeout: float = 60,
) -> tuple[dict | None, str | None]:
    """Like http_json but returns (data, error) instead of SystemExit."""
    headers = {
        "X-API-Key": api_key,
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return (json.loads(raw) if raw else {}), None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        return None, f"HTTP {e.code}: {detail[:500]}"
    except Exception as e:
        return None, str(e)


def poll_result(check_url: str, api_key: str, label: str = "job") -> dict:
    result: dict = {}
    for i in range(MAX_POLLS):
        result = http_json("GET", check_url, api_key)
        status = result.get("status")
        print(f"  [{label}] poll {i + 1}: status={status}")
        if status in ("complete", "failed"):
            return result
        time.sleep(POLL_INTERVAL_S)
    raise SystemExit(f"Timed out polling {label} after {MAX_POLLS} attempts")


def fetch_check_once(check_url: str, api_key: str) -> tuple[dict | None, str | None]:
    """Single GET of a Datalab request_check_url (for resume after restart)."""
    return http_json_soft("GET", check_url, api_key, timeout=60)
