"""Shared helpers for OCR production-record import commands."""
from __future__ import annotations

import re
from datetime import date, datetime

from django.core.management.base import CommandError

OCR_SHIFT_MAP = {
    'N/S': 'night',
    'D/S': 'morning',
    'A/S': 'afternoon',
}

SHIFT_TO_OCR = {
    'night': 'N/S',
    'morning': 'D/S',
    'afternoon': 'A/S',
}

OCR_COMMENT_PREFIX = 'OCR import:'


def parse_date(raw: str, *, default_year: int = 2025) -> date:
    """Parse OCR header dates (m/d/y, d/m, m/d, etc.)."""
    text = raw.strip()
    for fmt in ('%m/%d/%y', '%m/%d/%Y', '%d/%m/%y', '%d/%m/%Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    parts = text.split('/')
    if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
        first, second = int(parts[0]), int(parts[1])
        if first > 12:
            return date(default_year, second, first)
        if second > 12:
            return date(default_year, first, second)
        # Ambiguous (both <= 12): prefer month/day to match US form entries like 1/5/25.
        return date(default_year, first, second)

    raise CommandError(f'Could not parse date: {raw!r}')


def parse_date_from_job_dir(path_str: str, *, default_year: int = 2025) -> date | None:
    """
    Parse leading date token from OCR job folder names such as:
      1-5-25_1250-1_B13_Base_2  -> 2025-01-05
      3-14_2250_1_R240_2        -> 2025-03-14
      23-5_2750_1_R240_GC_2     -> 2025-05-23
    """
    name = path_str.rstrip('/').split('/')[-1]
    match = re.match(r'^(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?', name)
    if not match:
        return None

    first, second, year_token = match.groups()
    a, b = int(first), int(second)
    if year_token:
        year = int(year_token)
        if year < 100:
            year += 2000
        # Folder like 1-5-25 is month-day-year.
        return date(year, a, b)

    if a > 12:
        return date(default_year, b, a)
    if b > 12:
        return date(default_year, a, b)
    return date(default_year, a, b)


def slug_part_number(product: str) -> str:
    return product.upper().replace(' ', '-')


# OCR machine names look like 2250#1 / 2250-1 / 2250 #1 — digits, a symbol, digits.
_MACHINE_PAIR_RE = re.compile(r'(\d+)\D+(\d+)')


def canonicalize_machine_name(value: object) -> str:
    """Normalize OCR machine text to '{digits}#{digits}' (e.g. 2250-1 → 2250#1)."""
    text = str(value or '').strip()
    if not text:
        return ''
    match = _MACHINE_PAIR_RE.search(text)
    if match:
        return f'{match.group(1)}#{match.group(2)}'
    return ''.join(text.split())


def normalize_machine_key(value: object) -> str:
    """Canonical machine key for matching existing rows."""
    return canonicalize_machine_name(value).casefold()


def strip_machine_name(value: object) -> str:
    """Backward-compatible alias: canonical '#'' form with no extra spaces."""
    return canonicalize_machine_name(value)


def find_existing_machine(raw: str):
    """Match a machine by id or name using the canonical aaa#bbb key.

    If several rows match (e.g. '2250 #1' and '2250#1'), reuse the oldest so
    OCR does not keep attaching data to a later duplicate.
    """
    from production.models import Machine

    key = normalize_machine_key(raw)
    if not key:
        return None

    for machine in Machine.objects.all().order_by('id'):
        if (
            normalize_machine_key(machine.machine_id) == key
            or normalize_machine_key(machine.name) == key
        ):
            return machine
    return None


def ocr_import_notes(job_id: str) -> str:
    return f'OCR import from {job_id}'


def parse_ocr_job_id_from_notes(notes: str | None) -> str | None:
    if not notes:
        return None
    text = notes.strip()
    for prefix in ('OCR import from ', 'OCR downtime import from '):
        if text.lower().startswith(prefix.lower()):
            return text[len(prefix):].strip() or None
    return None
