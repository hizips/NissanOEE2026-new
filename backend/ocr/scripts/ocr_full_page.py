#!/usr/bin/env python3
"""Full-page OCR via Datalab Convert API — dumps rich debug artifacts.

Usage:
  export DATALAB_API_KEY=...
  python scripts/ocr_full_page.py data/input/test1.pdf

Or with a local .env containing DATALAB_API_KEY.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE = "https://www.datalab.to"
POLL_INTERVAL_S = 2.0
MAX_POLLS = 300


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key, value)


def multipart_encode(fields: dict[str, str], files: dict[str, tuple[str, bytes, str]]) -> tuple[bytes, str]:
    boundary = f"----datalab{int(time.time() * 1000)}"
    body = bytearray()

    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(value.encode("utf-8"))
        body.extend(b"\r\n")

    for name, (filename, content, content_type) in files.items():
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


def http_json(method: str, url: str, api_key: str, body: bytes | None = None, content_type: str | None = None) -> dict:
    # Cloudflare rejects bare urllib defaults (error 1010); send a real UA.
    headers = {
        "X-API-Key": api_key,
        "User-Agent": "Mozilla/5.0 (compatible; DatalabOCR/1.0; +https://www.datalab.to)",
        "Accept": "application/json",
    }
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} {url}\n{detail}") from e


def convert_options() -> dict[str, str]:
    """Max-info first-pass settings for later ROI / schema fine-tuning."""
    mode = os.environ.get("DATALAB_MODE", "accurate")
    return {
        # All formats so we can compare structures without re-running.
        "output_format": "markdown,html,json,chunks",
        "mode": mode,
        "paginate": "true",
        "add_block_ids": "true",
        "include_markdown_in_chunks": "true",
        "word_bboxes": "true",
        "save_checkpoint": "true",
        "disable_image_extraction": "false",
        "disable_image_captions": "false",
        "fence_synthetic_captions": "true",
        # Table cell bboxes matter for downtime / reject grids later.
        "extras": "table_cell_bboxes,list_item_bboxes,extract_links,new_block_types",
        "additional_config": json.dumps(
            {
                "keep_pageheader_in_output": True,
                "keep_pagefooter_in_output": True,
            }
        ),
    }


def save_images(images: dict | None, out_dir: Path) -> list[str]:
    if not images:
        return []
    img_dir = out_dir / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    for name, b64 in images.items():
        # API may return raw base64 or a data-URL.
        if isinstance(b64, str) and "," in b64 and b64.strip().startswith("data:"):
            b64 = b64.split(",", 1)[1]
        data = base64.b64decode(b64)
        path = img_dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        saved.append(str(path.relative_to(out_dir)))
    return saved


def summarize(result: dict) -> dict:
    """Compact index of what came back — useful before opening huge JSON."""
    js = result.get("json")
    chunks = result.get("chunks")
    html = result.get("html") or ""
    md = result.get("markdown") or ""

    block_labels: dict[str, int] = {}
    block_count = 0
    if isinstance(js, dict):
        children = js.get("children") or js.get("blocks") or []
        if isinstance(children, list):
            block_count = len(children)
            for blk in children:
                if isinstance(blk, dict):
                    label = str(blk.get("block_type") or blk.get("type") or "unknown")
                    block_labels[label] = block_labels.get(label, 0) + 1

    return {
        "status": result.get("status"),
        "success": result.get("success"),
        "page_count": result.get("page_count"),
        "parse_quality_score": result.get("parse_quality_score"),
        "cost_breakdown": result.get("cost_breakdown"),
        "checkpoint_id": result.get("checkpoint_id"),
        "output_format": result.get("output_format"),
        "versions": result.get("versions"),
        "metadata": result.get("metadata"),
        "error": result.get("error"),
        "markdown_chars": len(md),
        "html_chars": len(html),
        "html_has_data_bbox": "data-bbox" in html,
        "html_has_data_confidence": "data-confidence" in html,
        "html_has_data_block_id": "data-block-id" in html,
        "json_top_keys": sorted(js.keys()) if isinstance(js, dict) else type(js).__name__,
        "json_block_count": block_count,
        "json_block_labels": block_labels,
        "chunks_type": type(chunks).__name__,
        "chunks_len": len(chunks) if isinstance(chunks, (list, dict)) else None,
        "image_keys": sorted((result.get("images") or {}).keys()),
    }


def run(pdf_path: Path, out_root: Path) -> Path:
    load_dotenv(ROOT / ".env")
    api_key = os.environ.get("DATALAB_API_KEY", "").strip()
    if not api_key or api_key.startswith("your_api_key"):
        raise SystemExit(
            "DATALAB_API_KEY is missing. Copy .env.example → .env and paste your key "
            "from https://www.datalab.to/app/keys"
        )

    base = os.environ.get("DATALAB_API_BASE", DEFAULT_BASE).rstrip("/")
    pdf_bytes = pdf_path.read_bytes()
    fields = convert_options()
    body, content_type = multipart_encode(
        fields,
        {"file": (pdf_path.name, pdf_bytes, "application/pdf")},
    )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = out_root / f"{pdf_path.stem}_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    request_meta = {
        "input_file": str(pdf_path),
        "input_bytes": len(pdf_bytes),
        "submitted_at": stamp,
        "api_base": base,
        "options": fields,
    }
    (out_dir / "00_request.json").write_text(
        json.dumps(request_meta, indent=2), encoding="utf-8"
    )

    print(f"Submitting {pdf_path.name} → {base}/api/v1/convert (mode={fields['mode']})")
    initial = http_json("POST", f"{base}/api/v1/convert", api_key, body, content_type)
    (out_dir / "01_submit_response.json").write_text(
        json.dumps(initial, indent=2), encoding="utf-8"
    )

    check_url = initial.get("request_check_url")
    request_id = initial.get("request_id")
    if not check_url:
        raise SystemExit(f"No request_check_url in submit response:\n{json.dumps(initial, indent=2)}")

    print(f"request_id={request_id}")
    print(f"polling {check_url}")

    result: dict = {}
    for i in range(MAX_POLLS):
        result = http_json("GET", check_url, api_key)
        status = result.get("status")
        print(f"  poll {i + 1}: status={status}")
        if status in ("complete", "failed"):
            break
        time.sleep(POLL_INTERVAL_S)
    else:
        (out_dir / "99_timeout_last_poll.json").write_text(
            json.dumps(result, indent=2), encoding="utf-8"
        )
        raise SystemExit(f"Timed out after {MAX_POLLS} polls; partial dump in {out_dir}")

    # Full raw response (may be large).
    (out_dir / "02_result_raw.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    if result.get("markdown"):
        (out_dir / "result.md").write_text(result["markdown"], encoding="utf-8")
    if result.get("html"):
        (out_dir / "result.html").write_text(result["html"], encoding="utf-8")
    if result.get("json") is not None:
        (out_dir / "result.json").write_text(
            json.dumps(result["json"], indent=2, ensure_ascii=False), encoding="utf-8"
        )
    if result.get("chunks") is not None:
        (out_dir / "result_chunks.json").write_text(
            json.dumps(result["chunks"], indent=2, ensure_ascii=False), encoding="utf-8"
        )
    if result.get("metadata") is not None:
        (out_dir / "result_metadata.json").write_text(
            json.dumps(result["metadata"], indent=2, ensure_ascii=False), encoding="utf-8"
        )

    saved_images = save_images(result.get("images"), out_dir)
    summary = summarize(result)
    summary["saved_images"] = saved_images
    summary["request_id"] = request_id
    summary["output_dir"] = str(out_dir)
    (out_dir / "03_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(json.dumps(summary, indent=2))
    if not result.get("success") or result.get("status") == "failed":
        raise SystemExit(f"Conversion failed — see {out_dir}")
    print(f"\nWrote rich dump → {out_dir}")
    return out_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Full-page OCR via Datalab Convert API")
    parser.add_argument(
        "pdf",
        nargs="?",
        default=str(ROOT / "data" / "input" / "test1.pdf"),
        help="PDF path (default: data/input/test1.pdf)",
    )
    parser.add_argument(
        "--out",
        default=str(ROOT / "data" / "output"),
        help="Output root directory",
    )
    args = parser.parse_args()
    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.is_file():
        raise SystemExit(f"File not found: {pdf_path}")
    run(pdf_path, Path(args.out).expanduser().resolve())


if __name__ == "__main__":
    main()
