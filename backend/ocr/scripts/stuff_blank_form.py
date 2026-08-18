#!/usr/bin/env python3
"""Stuff extract_structured_clean.json values into the blank HTML template.

Does not call Datalab Fill API — local DOM-style substitution via data-field attrs.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "daily_production_sheet_blank.html"


def flatten_extract(data: dict) -> dict[str, str]:
    """Map extract JSON → data-field keys used in the blank HTML."""
    out: dict[str, str] = {}

    def put(key: str, val):
        if val is None or val == "":
            return
        out[key] = str(val)

    header = data.get("header") or {}
    for k in ("machine", "product", "shot_sleeve", "die_number", "date", "document_id"):
        put(f"header.{k}", header.get(k))

    for i, s in enumerate(data.get("shift_summaries") or []):
        for k, v in s.items():
            if k == "shift":
                continue
            put(f"shift_summaries.{i}.{k}", v)

    # downtime: group by shift into N_S / D_S / A_S slots
    buckets = {"N/S": [], "D/S": [], "A/S": []}
    for e in data.get("downtime_entries") or []:
        sh = (e.get("shift") or "D/S").strip().upper()
        if sh not in buckets:
            # normalize
            if sh.startswith("N"):
                sh = "N/S"
            elif sh.startswith("A"):
                sh = "A/S"
            else:
                sh = "D/S"
        buckets[sh].append(e)

    for sh, rows in buckets.items():
        sid = sh.replace("/", "_")
        for r, e in enumerate(rows[:7]):
            for k in (
                "reason",
                "sign",
                "mc_stop",
                "maint_start",
                "troom_finish",
                "mc_start",
                "warmup_prod_minutes",
                "maint_minutes",
                "tool_minutes",
                "eng_minutes",
                "prod_minutes",
                "other_minutes",
            ):
                put(f"downtime_entries.{sid}.{r}.{k}", e.get(k))

    # rejects by reason label order from template
    reasons = [
        "Drag",
        "Crack",
        "Leaker",
        "Warmup",
        "Hand. Damage",
        "Trim Damage",
        "Robot Damage",
        "Misrun",
        "Gate Break",
        "Broken Biscuit",
        "Short Biscuit",
        "Blister",
        "Porosity",
        "Chipping",
        "Distortion",
        "Soldering",
        "Laser issues",
        "Stain",
        "Broken C' Pin",
        "Dropped in PIT",
    ]
    by_reason = {}
    for r in data.get("rejects") or []:
        name = (r.get("reason") or "").strip()
        by_reason[name.lower()] = r
    for i, name in enumerate(reasons):
        r = by_reason.get(name.lower()) or by_reason.get(name.lower().replace(".", ""))
        if not r:
            # fuzzy: warmup etc
            for k, v in by_reason.items():
                if name.lower() in k or k in name.lower():
                    r = v
                    break
        if not r:
            continue
        put(f"rejects.{i}.reason", name)
        for col in ("n_s", "d_s", "a_s", "total"):
            put(f"rejects.{i}.{col}", r.get(col))

    tr = data.get("total_rejects") or {}
    for col in ("n_s", "d_s", "a_s", "total"):
        put(f"total_rejects.{col}", tr.get(col))

    mc = data.get("machine_counter") or {}
    for k, v in mc.items():
        put(f"machine_counter.{k}", v)

    return out


def stuff_html(template_html: str, flat: dict[str, str]) -> str:
    # Ensure generated tables exist: run as static by embedding values after
    # the script builds DOM — simpler: replace data-field spans/tds via regex
    # on a pre-rendered snapshot. For blank template with JS, we inject a
    # stuffing script that runs after table build.
    payload = json.dumps(flat)
    injector = f"""
<script>
(function() {{
  const DATA = {payload};
  function apply() {{
    document.querySelectorAll('[data-field]').forEach(el => {{
      const key = el.getAttribute('data-field');
      if (Object.prototype.hasOwnProperty.call(DATA, key)) {{
        el.textContent = DATA[key];
      }}
    }});
  }}
  if (document.readyState === 'loading') {{
    document.addEventListener('DOMContentLoaded', () => setTimeout(apply, 0));
  }} else {{
    setTimeout(apply, 0);
  }}
}})();
</script>
</body>"""
    if "</body>" in template_html:
        return template_html.replace("</body>", injector)
    return template_html + injector


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "extract_json",
        nargs="?",
        default=str(
            ROOT
            / "data"
            / "output"
            / "test1_pipeline_20260813T103401Z"
            / "extract_structured_clean.json"
        ),
    )
    ap.add_argument(
        "-o",
        "--output",
        default=str(ROOT / "templates" / "daily_production_sheet_stuffed.html"),
    )
    args = ap.parse_args()
    data = json.loads(Path(args.extract_json).read_text(encoding="utf-8"))
    flat = flatten_extract(data)
    html = stuff_html(TEMPLATE.read_text(encoding="utf-8"), flat)
    out = Path(args.output)
    out.write_text(html, encoding="utf-8")
    map_path = out.with_suffix(".fields.json")
    map_path.write_text(json.dumps(flat, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out}")
    print(f"wrote {map_path} ({len(flat)} fields)")


if __name__ == "__main__":
    main()
