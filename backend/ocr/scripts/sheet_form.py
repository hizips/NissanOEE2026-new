#!/usr/bin/env python3
"""Canonical complete production-sheet data model for edit + render."""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

SHIFTS = ("N/S", "D/S", "A/S")
DOWNTIME_SLOTS = 10

HEADER_FIELDS = (
    ("machine", "Machine"),
    ("product", "Product"),
    ("shot_sleeve", "Shot Sleeve #"),
    ("die_number", "Die #"),
    ("date", "Date"),
)

SHIFT_META_FIELDS = (
    ("plunger_tip_life_count", "Plunger tip life"),
    ("vacuum_valve", "Vacuum valve"),
    ("meetings_minutes", "Meetings min"),
    ("polish_minutes", "Polish min"),
    ("chk_list_minutes", "Chk list min"),
    ("cleanup_minutes", "Cleanup min"),
)

DOWNTIME_FIELDS = (
    ("reason", "Reason"),
    ("mc_stop", "M/C Stop"),
    ("maint_troom_start", "Maint Start"),
    ("maint_troom_finish", "Maint Finish"),
    ("mc_start", "M/C Start"),
    ("warmup_shot_count", "Warmup shots"),
    ("maint_minutes", "Maint"),
    ("tool_minutes", "Tool"),
    ("eng_minutes", "Eng"),
    ("prod_minutes", "Prod"),
    ("other_minutes", "Other"),
    ("reason_continued_from_previous", "Cont?"),
)

REJECT_REASONS = (
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
    "Test / QA",
)

COUNTER_ROWS = (
    ("start", "Start"),
    ("stop", "Stop"),
    ("machine", "Machine"),
    ("ems_counter", "EMS Counter"),
)

SHIFT_COUNT_KEYS = ("n_s", "d_s", "a_s", "total")

_MACHINE_PAIR_RE = re.compile(r"(\d+)\D+(\d+)")


def canonicalize_machine_name(value: object) -> str | None:
    """Replace the OCR symbol between two numbers with '#' (2250-1 → 2250#1)."""
    text = str(value or "").strip()
    if not text:
        return None
    match = _MACHINE_PAIR_RE.search(text)
    if match:
        return f"{match.group(1)}#{match.group(2)}"
    collapsed = "".join(text.split())
    return collapsed or None


DEFAULT_OCR_YEAR = 2025


def split_date_and_year(raw: object, fallback_year: int = DEFAULT_OCR_YEAR) -> tuple[str | None, int]:
    """If the date includes a year, return (date-without-year, year)."""
    text = str(raw or "").strip()
    if not text:
        return None, fallback_year

    iso = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$", text)
    if iso:
        year = int(iso.group(1))
        date = f"{int(iso.group(2))}/{int(iso.group(3))}"
        return date, year if 1900 <= year <= 2100 else fallback_year

    sep = "/" if "/" in text else "-" if "-" in text else None
    if sep:
        parts = [p.strip() for p in text.split(sep) if p.strip()]
        if len(parts) >= 3:
            try:
                year = int(parts[-1])
            except ValueError:
                year = -1
            if 0 <= year < 100:
                year += 2000
            if 1900 <= year <= 2100:
                return sep.join(parts[:-1]), year

    return text, fallback_year


def _empty_downtime_row() -> dict[str, Any]:
    return {
        "reason": None,
        "reason_continued_from_previous": None,
        "mc_stop": None,
        "maint_troom_start": None,
        "maint_troom_finish": None,
        "mc_start": None,
        "warmup_shot_count": None,
        "maint_minutes": None,
        "tool_minutes": None,
        "eng_minutes": None,
        "prod_minutes": None,
        "other_minutes": None,
    }


def _empty_shift(code: str) -> dict[str, Any]:
    return {
        "shift": code,
        "plunger_tip_life_count": None,
        "vacuum_valve": None,
        "meetings_minutes": None,
        "polish_minutes": None,
        "chk_list_minutes": None,
        "cleanup_minutes": None,
        "downtime_entries": [_empty_downtime_row() for _ in range(DOWNTIME_SLOTS)],
    }


def _empty_counts() -> dict[str, Any]:
    return {k: None for k in SHIFT_COUNT_KEYS}


def _pad_downtime(entries: list | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for raw in entries or []:
        if not isinstance(raw, dict):
            continue
        row = _empty_downtime_row()
        for key in row:
            if key in raw:
                row[key] = raw.get(key)
        # drop obsolete sign if present — ignore
        rows.append(row)
    while len(rows) < DOWNTIME_SLOTS:
        rows.append(_empty_downtime_row())
    return rows[:DOWNTIME_SLOTS]


def _is_blank_downtime(row: dict) -> bool:
    for k, v in row.items():
        if k == "reason_continued_from_previous":
            continue
        if v is None or v == "":
            continue
        return False
    return True


def blank_merged() -> dict[str, Any]:
    return {
        "header": {k: None for k, _ in HEADER_FIELDS},
        "shifts": [_empty_shift(code) for code in SHIFTS],
        "rejects": [{"reason": r, **_empty_counts()} for r in REJECT_REASONS],
        "total_rejects": _empty_counts(),
        "machine_counter": {key: _empty_counts() for key, _ in COUNTER_ROWS},
    }


def normalize_merged(data: dict | None) -> dict[str, Any]:
    """Return a complete form-shaped object (all shifts/rows/cols present)."""
    src = data if isinstance(data, dict) else {}
    out = blank_merged()

    header = src.get("header") or {}
    for key, _ in HEADER_FIELDS:
        if key in header:
            out["header"][key] = header.get(key)
    machine = out["header"].get("machine")
    if machine is not None:
        out["header"]["machine"] = canonicalize_machine_name(machine)
    explicit_year = header.get("year")
    try:
        fallback_year = int(explicit_year) if explicit_year not in (None, "") else DEFAULT_OCR_YEAR
    except (TypeError, ValueError):
        fallback_year = DEFAULT_OCR_YEAR
    date_only, year = split_date_and_year(out["header"].get("date"), fallback_year)
    raw_date = str(out["header"].get("date") or "").strip()
    if re.match(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}$", raw_date) or len(re.split(r"[/-]", raw_date)) >= 3:
        pass  # year came from the date cell
    elif 1900 <= fallback_year <= 2100:
        year = fallback_year
    out["header"]["date"] = date_only
    out["header"]["year"] = year

    by_shift = {}
    for sh in src.get("shifts") or []:
        if not isinstance(sh, dict):
            continue
        code = (sh.get("shift") or "").strip()
        if code in SHIFTS:
            by_shift[code] = sh

    for i, code in enumerate(SHIFTS):
        base = out["shifts"][i]
        raw = by_shift.get(code) or {}
        for key, _ in SHIFT_META_FIELDS:
            if key in raw:
                base[key] = raw.get(key)
        base["downtime_entries"] = _pad_downtime(raw.get("downtime_entries"))

    reject_map = {}
    for r in src.get("rejects") or []:
        if isinstance(r, dict) and r.get("reason"):
            reject_map[str(r["reason"])] = r
    for row in out["rejects"]:
        raw = reject_map.get(row["reason"]) or {}
        for k in SHIFT_COUNT_KEYS:
            if k in raw:
                row[k] = raw.get(k)

    total = src.get("total_rejects") or {}
    for k in SHIFT_COUNT_KEYS:
        if k in total:
            out["total_rejects"][k] = total.get(k)

    mc = src.get("machine_counter") or {}
    for key, _ in COUNTER_ROWS:
        raw = mc.get(key) or {}
        for k in SHIFT_COUNT_KEYS:
            if k in raw:
                out["machine_counter"][key][k] = raw.get(k)

    return out


def compact_merged(data: dict) -> dict[str, Any]:
    """Keep complete structure but drop trailing blank downtime rows? No —
    store normalized complete form so empty rows stay visible on reload.
    Still strip fully blank downtime rows beyond first empty block? User asked
    for complete form — keep all slots.
    """
    return normalize_merged(data)


def form_template() -> dict[str, Any]:
    return {
        "shifts": list(SHIFTS),
        "downtime_slots": DOWNTIME_SLOTS,
        "header_fields": [{"key": k, "label": lab} for k, lab in HEADER_FIELDS],
        "shift_meta_fields": [
            {"key": k, "label": lab} for k, lab in SHIFT_META_FIELDS
        ],
        "downtime_fields": [{"key": k, "label": lab} for k, lab in DOWNTIME_FIELDS],
        "reject_reasons": list(REJECT_REASONS),
        "counter_rows": [{"key": k, "label": lab} for k, lab in COUNTER_ROWS],
        "count_keys": list(SHIFT_COUNT_KEYS),
    }


def deepcopy_merged(data: dict) -> dict:
    return deepcopy(normalize_merged(data))
