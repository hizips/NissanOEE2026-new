#!/usr/bin/env python3
"""Render extract_structured_clean.json as a human-readable filled form (HTML + optional PNG)."""

from __future__ import annotations

import argparse
import html
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def esc(v) -> str:
    if v is None or v == "":
        return ""
    return html.escape(str(v))


def cell(v, cls="v") -> str:
    s = esc(v)
    empty = " empty" if not s else ""
    return f'<td class="{cls}{empty}">{s if s else "·"}</td>'


def render(data: dict) -> str:
    h = data.get("header") or {}
    meta = data.get("form_meta") or {}
    labour = data.get("labour") or {}
    rejects = data.get("rejects") or []
    total = data.get("total_rejects") or {}
    mc = data.get("machine_counter") or {}

    parts = []
    parts.append(
        f"""<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Extracted Daily Production Sheet</title>
<style>
@page {{ size: A4 landscape; margin: 8mm; }}
body {{ font-family: Arial, Helvetica, sans-serif; font-size: 11px; color:#111; margin:12px; background:#f6f7f9; }}
.sheet {{ background:#fff; border:1px solid #ccc; padding:14px 16px; max-width:1200px; margin:0 auto; box-shadow:0 1px 4px rgba(0,0,0,.08); }}
h1 {{ text-align:center; margin:0 0 8px; font-size:18px; letter-spacing:1px; }}
.badge {{ float:right; border:2px solid #000; padding:2px 10px; font-weight:700; margin-top:-4px; }}
.hdr {{ display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin:10px 0 14px; clear:both; }}
.hdr div {{ border-bottom:1px solid #333; padding:2px 4px; }}
.hdr span {{ color:#666; font-size:10px; display:block; }}
.hdr b {{ font-size:13px; color:#0b5; }}
section {{ margin:12px 0; }}
h2 {{ font-size:13px; margin:0 0 6px; border-bottom:2px solid #333; padding-bottom:2px; }}
table {{ width:100%; border-collapse:collapse; margin-bottom:8px; }}
th, td {{ border:1px solid #999; padding:3px 5px; vertical-align:top; }}
th {{ background:#eee; font-size:10px; }}
td.v {{ background:#fffbe6; font-weight:600; color:#111; }}
td.empty {{ background:#fafafa; color:#bbb; font-weight:400; }}
.reason {{ text-align:left; max-width:220px; }}
.cols {{ display:grid; grid-template-columns:1.4fr 1fr; gap:12px; }}
.meta {{ color:#666; font-size:10px; margin-top:8px; }}
.note {{ background:#eef6ff; border:1px solid #bcd; padding:6px 8px; margin-bottom:10px; font-size:10px; }}
</style></head><body><div class="sheet">
<div class="badge">{esc(meta.get("process") or "HPDC")}</div>
<h1>DAILY PRODUCTION SHEET — extracted review</h1>
<div class="note">Values in yellow cells came from OCR extract. Grey · = blank/null. Check against the scanned sheet.</div>
<div class="hdr">
  <div><span>Machine</span><b>{esc(h.get("machine")) or "·"}</b></div>
  <div><span>Product</span><b>{esc(h.get("product")) or "·"}</b></div>
  <div><span>Shot Sleeve #</span><b>{esc(h.get("shot_sleeve")) or "·"}</b></div>
  <div><span>Die #</span><b>{esc(h.get("die_number")) or "·"}</b></div>
  <div><span>Date</span><b>{esc(h.get("date")) or "·"}</b></div>
</div>
"""
    )

    # Shifts / downtime
    parts.append('<div class="cols"><div>')
    for s in data.get("shifts") or []:
        sh = s.get("shift") or "?"
        parts.append(f"<section><h2>Shift {esc(sh)}</h2>")
        parts.append("<table><tr>")
        for label, key in [
            ("Plunger tip life", "plunger_tip_life_count"),
            ("Vacuum valve #", "vacuum_valve"),
            ("Meetings min", "meetings_minutes"),
            ("Polish min", "polish_minutes"),
            ("Chk list min", "chk_list_minutes"),
            ("Cleanup min", "cleanup_minutes"),
            ("D stamp", "d_stamp"),
        ]:
            parts.append(f"<th>{label}</th>")
        parts.append("</tr><tr>")
        for _, key in [
            ("", "plunger_tip_life_count"),
            ("", "vacuum_valve"),
            ("", "meetings_minutes"),
            ("", "polish_minutes"),
            ("", "chk_list_minutes"),
            ("", "cleanup_minutes"),
            ("", "d_stamp"),
        ]:
            parts.append(cell(s.get(key)))
        parts.append("</tr></table>")

        parts.append(
            """<table><thead><tr>
            <th class="reason">Reason</th><th>Sign</th>
            <th>M/C Stop</th><th>Maint/T Start</th><th>Maint/T Finish</th><th>M/C Start</th>
            <th>Warmup shots</th><th>Maint</th><th>Tool</th><th>Eng</th><th>Prod</th><th>Other</th>
            </tr></thead><tbody>"""
        )
        entries = s.get("downtime_entries") or []
        if not entries:
            parts.append('<tr><td colspan="12" class="empty">No downtime entries</td></tr>')
        for e in entries:
            ditto = " <i>(ditto)</i>" if e.get("reason_continued_from_previous") else ""
            parts.append("<tr>")
            parts.append(
                f'<td class="reason v">{esc(e.get("reason"))}{ditto}</td>'
            )
            for k in (
                "sign",
                "mc_stop",
                "maint_troom_start",
                "maint_troom_finish",
                "mc_start",
                "warmup_shot_count",
                "maint_minutes",
                "tool_minutes",
                "eng_minutes",
                "prod_minutes",
                "other_minutes",
            ):
                parts.append(cell(e.get(k)))
            parts.append("</tr>")
        parts.append("</tbody></table></section>")

    parts.append("</div><div>")

    # Labour
    parts.append("<section><h2>Labour (initials)</h2><table>")
    parts.append("<tr><th>Role</th><th>N/S</th><th>D/S</th><th>A/S</th></tr>")
    for role, key in [
        ("Support", "support"),
        ("Operator", "operator"),
        ("Relief Operator", "relief_operator"),
    ]:
        row = labour.get(key) or {}
        parts.append(
            f"<tr><td>{role}</td>{cell(row.get('n_s'))}{cell(row.get('d_s'))}{cell(row.get('a_s'))}</tr>"
        )
    parts.append("</table></section>")

    # Rejects
    parts.append("<section><h2>Reject Data</h2><table>")
    parts.append("<tr><th>Reason</th><th>N/S</th><th>D/S</th><th>A/S</th><th>Total</th></tr>")
    for r in rejects:
        parts.append(
            f"<tr><td>{esc(r.get('reason'))}</td>"
            f"{cell(r.get('n_s'))}{cell(r.get('d_s'))}{cell(r.get('a_s'))}{cell(r.get('total'))}</tr>"
        )
    parts.append(
        f"<tr><th>Total Rejects</th>"
        f"{cell(total.get('n_s'))}{cell(total.get('d_s'))}{cell(total.get('a_s'))}{cell(total.get('total'))}</tr>"
    )
    parts.append("</table></section>")

    # Machine counter
    parts.append("<section><h2>Machine Counter Readings</h2><table>")
    parts.append("<tr><th></th><th>N/S</th><th>D/S</th><th>A/S</th><th>Total</th></tr>")
    for label, key in [
        ("Start", "start"),
        ("Stop", "stop"),
        ("Machine", "machine"),
        ("EMS Counter", "ems_counter"),
    ]:
        row = mc.get(key) or {}
        parts.append(
            f"<tr><td>{label}</td>"
            f"{cell(row.get('n_s'))}{cell(row.get('d_s'))}{cell(row.get('a_s'))}{cell(row.get('total'))}</tr>"
        )
    parts.append("</table></section>")

    parts.append("</div></div>")
    doc_id = (meta.get("document_id") if meta else None) or "PR-FO-4623"
    parts.append(
        f'<div class="meta">Document ID: {esc(doc_id)}'
        f' &nbsp;|&nbsp; form rev: {esc(meta.get("form_revision_date")) or "·"}'
        f' &nbsp;|&nbsp; {esc(meta.get("form_author")) or ""}</div>'
    )
    parts.append("</div></body></html>")
    return "".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("extract_json")
    ap.add_argument("-o", "--output", required=True, help="Output HTML path")
    ap.add_argument("--png", default="", help="Optional PNG screenshot path")
    args = ap.parse_args()

    data = json.loads(Path(args.extract_json).read_text(encoding="utf-8"))
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(data), encoding="utf-8")
    print(f"wrote {out}")

    if args.png:
        png = Path(args.png)
        png.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "google-chrome",
                "--headless",
                "--disable-gpu",
                f"--window-size=1400,1800",
                f"--screenshot={png}",
                out.resolve().as_uri(),
            ],
            check=True,
            capture_output=True,
        )
        print(f"wrote {png}")


if __name__ == "__main__":
    main()
