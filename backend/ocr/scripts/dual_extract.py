#!/usr/bin/env python3
"""Run two fast extracts on one convert checkpoint, merge, and render data-only HTML/PNG.

Usage:
  python3 scripts/dual_extract.py --checkpoint checkpoint_...
  python3 scripts/dual_extract.py --checkpoint checkpoint_... --out data/output
"""

from __future__ import annotations

import argparse
import html
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib_datalab import (  # noqa: E402
    api_base,
    http_json,
    multipart_encode,
    poll_result,
    require_api_key,
)
from sheet_form import (  # noqa: E402
    COUNTER_ROWS,
    HEADER_FIELDS,
    SHIFT_META_FIELDS,
    normalize_merged,
)

DOWNTIME_SCHEMA = ROOT / "schemas" / "downtime.json"
REJECTS_SCHEMA = ROOT / "schemas" / "rejects_cast_quantity.json"


def clean(obj):
    if isinstance(obj, list):
        return [clean(x) for x in obj]
    if isinstance(obj, dict):
        return {
            k: clean(v)
            for k, v in obj.items()
            if not (
                k.endswith("_citations")
                or k.endswith("_meta")
                or k.endswith("_score")
            )
        }
    return obj


def parse_extraction(result: dict):
    raw = result.get("extraction_schema_json")
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"_unparsed": raw}
    return raw


def run_extract(
    checkpoint_id: str,
    schema_path: Path,
    api_key: str,
    out_dir: Path,
    *,
    tag: str,
    extraction_mode: str,
) -> dict:
    base = api_base()
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    fields = {
        "checkpoint_id": checkpoint_id,
        "page_schema": json.dumps(schema),
        "extraction_mode": extraction_mode,
        "output_format": "json",
    }
    (out_dir / f"20_{tag}_extract_request.json").write_text(
        json.dumps(
            {
                "checkpoint_id": checkpoint_id,
                "extraction_mode": extraction_mode,
                "schema_title": schema.get("title"),
                "schema_path": str(schema_path),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    body, ctype = multipart_encode(fields)
    print(f"Extract [{tag}] via checkpoint {checkpoint_id[:24]}… ({extraction_mode})")
    initial = http_json("POST", f"{base}/api/v1/extract", api_key, body, ctype)
    (out_dir / f"21_{tag}_extract_submit.json").write_text(
        json.dumps(initial, indent=2), encoding="utf-8"
    )
    check_url = initial.get("request_check_url")
    if not check_url:
        raise SystemExit(f"No request_check_url [{tag}]: {initial}")
    print(f"  request_id={initial.get('request_id')}")
    result = poll_result(check_url, api_key, label=f"extract-{tag}")
    (out_dir / f"22_{tag}_extract_result_raw.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    extracted = parse_extraction(result)
    if extracted is not None:
        (out_dir / f"extract_{tag}.json").write_text(
            json.dumps(extracted, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        (out_dir / f"extract_{tag}_clean.json").write_text(
            json.dumps(clean(extracted), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    if not result.get("success") or result.get("status") == "failed":
        raise SystemExit(f"Extract [{tag}] failed: {result.get('error')}")
    return result


def esc(v) -> str:
    if v is None or v == "":
        return ""
    return html.escape(str(v))


def cell(v) -> str:
    s = esc(v)
    empty = " empty" if not s else ""
    return f'<td class="v{empty}">{s if s else "·"}</td>'


def render_data_only(merged: dict) -> str:
    data = normalize_merged(merged)
    h = data.get("header") or {}
    shifts = data.get("shifts") or []
    rejects = data.get("rejects") or []
    total = data.get("total_rejects") or {}
    mc = data.get("machine_counter") or {}

    parts = [
        """<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Daily Production Extract</title>
<style>
body { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; color:#111;
  margin: 16px; background:#f4f5f7; }
.wrap { max-width: 1180px; margin: 0 auto; background:#fff; border:1px solid #ddd;
  border-radius: 8px; padding: 18px 20px; }
h1 { font-size: 18px; margin: 0 0 4px; }
.sub { color:#666; margin: 0 0 16px; font-size: 12px; }
h2 { font-size: 14px; margin: 18px 0 8px; border-bottom: 2px solid #222; padding-bottom: 3px; }
.hdr { display:grid; grid-template-columns: repeat(5,1fr); gap:10px; margin-bottom: 8px; }
.hdr div { background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; }
.hdr span { display:block; color:#64748b; font-size:11px; }
.hdr b { font-size:14px; color:#0f766e; }
table { width:100%; border-collapse: collapse; margin: 6px 0 12px; }
th, td { border:1px solid #cbd5e1; padding:4px 6px; text-align:left; vertical-align:top; }
th { background:#e2e8f0; font-size:10px; }
td.v { color:#0f766e; font-weight:600; }
td.empty { color:#94a3b8; font-weight:400; }
.shift { margin-bottom: 14px; padding: 10px 12px; background:#f8fafc; border:1px solid #e2e8f0;
  border-radius: 6px; }
.shift h3 { margin: 0 0 8px; font-size: 13px; }
.meta-row { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:8px; font-size:12px; }
.meta-row span { color:#64748b; }
</style></head><body><div class="wrap">
"""
    ]
    parts.append("<h1>Extracted production data</h1>")
    parts.append(
        '<p class="sub">Complete form · Downtime N/S → D/S → A/S · Reject Data · Cast Quantity</p>'
    )

    parts.append("<h2>Header</h2><div class='hdr'>")
    for key, label in HEADER_FIELDS:
        parts.append(
            f"<div><span>{esc(label)}</span><b>{esc(h.get(key)) or '·'}</b></div>"
        )
    parts.append("</div>")

    parts.append("<h2>Downtime (N/S, D/S, A/S)</h2>")
    for sh in shifts:
        code = esc(sh.get("shift") or "?")
        parts.append(f"<div class='shift'><h3>Shift {code}</h3>")
        parts.append("<div class='meta-row'>")
        for key, label in SHIFT_META_FIELDS:
            parts.append(
                f"<div><span>{esc(label)}</span><br><b>{esc(sh.get(key)) or '·'}</b></div>"
            )
        parts.append("</div>")
        parts.append(
            "<table><tr><th>Reason</th><th>M/C Stop</th>"
            "<th>Maint Start</th><th>Maint Finish</th><th>M/C Start</th>"
            "<th>Warmup shots</th><th>Maint</th><th>Tool</th><th>Eng</th>"
            "<th>Prod</th><th>Other</th><th>Cont?</th></tr>"
        )
        for e in sh.get("downtime_entries") or []:
            cont = e.get("reason_continued_from_previous")
            cont_s = "yes" if cont is True else ("no" if cont is False else "·")
            parts.append(
                "<tr>"
                f"<td>{esc(e.get('reason')) or '·'}</td>"
                f"{cell(e.get('mc_stop'))}"
                f"{cell(e.get('maint_troom_start'))}"
                f"{cell(e.get('maint_troom_finish'))}{cell(e.get('mc_start'))}"
                f"{cell(e.get('warmup_shot_count'))}"
                f"{cell(e.get('maint_minutes'))}{cell(e.get('tool_minutes'))}"
                f"{cell(e.get('eng_minutes'))}{cell(e.get('prod_minutes'))}"
                f"{cell(e.get('other_minutes'))}{cell(cont_s)}</tr>"
            )
        parts.append("</table></div>")

    parts.append("<h2>Reject Data</h2><table>")
    parts.append("<tr><th>Reason</th><th>N/S</th><th>D/S</th><th>A/S</th><th>Total</th></tr>")
    for r in rejects:
        parts.append(
            f"<tr><td>{esc(r.get('reason'))}</td>"
            f"{cell(r.get('n_s'))}{cell(r.get('d_s'))}"
            f"{cell(r.get('a_s'))}{cell(r.get('total'))}</tr>"
        )
    parts.append(
        f"<tr><th>Total Rejects</th>"
        f"{cell(total.get('n_s'))}{cell(total.get('d_s'))}"
        f"{cell(total.get('a_s'))}{cell(total.get('total'))}</tr>"
    )
    parts.append("</table>")

    parts.append("<h2>Cast Quantity / Machine Counter</h2><table>")
    parts.append("<tr><th></th><th>N/S</th><th>D/S</th><th>A/S</th><th>Total</th></tr>")
    for key, label in COUNTER_ROWS:
        row = mc.get(key) or {}
        parts.append(
            f"<tr><td>{esc(label)}</td>"
            f"{cell(row.get('n_s'))}{cell(row.get('d_s'))}"
            f"{cell(row.get('a_s'))}{cell(row.get('total'))}</tr>"
        )
    parts.append("</table>")

    parts.append("</div></body></html>")
    return "".join(parts)


def screenshot_html(html_path: Path, png_path: Path) -> None:
    subprocess.run(
        [
            "google-chrome",
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--window-size=1200,4200",
            f"--screenshot={png_path}",
            html_path.resolve().as_uri(),
        ],
        check=True,
        capture_output=True,
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Dual fast extract + data-only render")
    ap.add_argument(
        "--checkpoint",
        default="checkpoint_aSg1Z6MNH-OUIIK-TQ_WGLm0pdmRhDF1lUBrpJaJzIg",
        help="Existing convert checkpoint_id",
    )
    ap.add_argument("--out", default=str(ROOT / "data" / "output"))
    ap.add_argument(
        "--extraction-mode",
        default="fast",
        help="Extract mode (default: fast)",
    )
    ap.add_argument("--tag", default="test1", help="Output folder prefix")
    args = ap.parse_args()

    api_key = require_api_key(ROOT)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = (
        Path(args.out).expanduser().resolve()
        / f"{args.tag}_dual_fast_{stamp}"
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    checkpoint_id = args.checkpoint.strip()
    mode = args.extraction_mode.strip()

    summary: dict = {
        "checkpoint_id": checkpoint_id,
        "extraction_mode": mode,
        "schemas": {
            "downtime": str(DOWNTIME_SCHEMA),
            "rejects": str(REJECTS_SCHEMA),
        },
        "output_dir": str(out_dir),
    }

    dt_result = run_extract(
        checkpoint_id,
        DOWNTIME_SCHEMA,
        api_key,
        out_dir,
        tag="downtime",
        extraction_mode=mode,
    )
    rj_result = run_extract(
        checkpoint_id,
        REJECTS_SCHEMA,
        api_key,
        out_dir,
        tag="rejects",
        extraction_mode=mode,
    )

    downtime = clean(parse_extraction(dt_result) or {})
    rejects = clean(parse_extraction(rj_result) or {})
    merged = {
        "header": downtime.get("header"),
        "shifts": downtime.get("shifts"),
        "rejects": rejects.get("rejects"),
        "total_rejects": rejects.get("total_rejects"),
        "machine_counter": rejects.get("machine_counter"),
    }
    (out_dir / "extract_merged_clean.json").write_text(
        json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    html_path = out_dir / "review_extracted.html"
    html_path.write_text(render_data_only(merged), encoding="utf-8")
    png_path = out_dir / "review_extracted.png"
    try:
        screenshot_html(html_path, png_path)
        summary["render_png"] = str(png_path)
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        summary["render_png_error"] = str(e)
        print(f"PNG screenshot skipped: {e}")

    summary["downtime_extract"] = {
        "success": dt_result.get("success"),
        "cost_breakdown": dt_result.get("cost_breakdown"),
    }
    summary["rejects_extract"] = {
        "success": rj_result.get("success"),
        "cost_breakdown": rj_result.get("cost_breakdown"),
    }
    (out_dir / "30_dual_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))
    print(f"\nDone → {out_dir}")
    print(f"  merged: {out_dir / 'extract_merged_clean.json'}")
    print(f"  html:   {html_path}")
    if png_path.is_file():
        print(f"  png:    {png_path}")


if __name__ == "__main__":
    main()
