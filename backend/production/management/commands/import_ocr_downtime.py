"""
Import downtime events from an OCR extract_downtime_clean.json (or extract_merged_clean.json)
into DowntimeEventHistory, using manual-entry style reasons (reason text as full path).

Usage:
  .venv/bin/python manage.py import_ocr_downtime /path/to/extract_downtime_clean.json
  .venv/bin/python manage.py import_ocr_downtime /path/to/job/dir --dry-run
"""
import json
from datetime import date, datetime, timedelta
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from production.models import DowntimeEventHistory, Machine, ProductionRecord
from production.ocr_import_utils import (
    OCR_COMMENT_PREFIX,
    OCR_SHIFT_MAP,
    parse_date,
    parse_date_from_job_dir,
)


def parse_time(raw: str | None) -> datetime.time | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    for fmt in ('%H:%M', '%H:%M:%S'):
        try:
            return datetime.strptime(text, fmt).time()
        except ValueError:
            continue
    if text.isdigit():
        hour = int(text)
        if 0 <= hour <= 23:
            return datetime.strptime(f'{hour}:00', '%H:%M').time()
    return None


def resolve_start_time(entry: dict) -> datetime.time | None:
    mc_stop_raw = entry.get('mc_stop')
    if (
        mc_stop_raw is not None
        and str(mc_stop_raw).strip().isdigit()
        and entry.get('maint_troom_start')
    ):
        parsed = parse_time(entry.get('maint_troom_start'))
        if parsed:
            return parsed
    for key in ('mc_stop', 'maint_troom_start'):
        parsed = parse_time(entry.get(key))
        if parsed:
            return parsed
    return None


def resolve_end_time(entry: dict) -> datetime.time | None:
    for key in ('mc_start', 'maint_troom_finish'):
        parsed = parse_time(entry.get(key))
        if parsed:
            return parsed
    return None


def has_timing_data(entry: dict) -> bool:
    minute_total = sum_minute_fields(entry)
    if minute_total:
        return True
    return resolve_start_time(entry) is not None and resolve_end_time(entry) is not None


def resolve_json_path(path: Path) -> Path:
    if path.is_dir():
        for name in ('extract_downtime_clean.json', 'extract_merged_clean.json'):
            candidate = path / name
            if candidate.is_file():
                return candidate
        raise CommandError(f'No downtime JSON found in directory: {path}')

    if path.is_file():
        return path

    raise CommandError(f'Path not found: {path}')


def is_valid_entry(entry: dict, *, reason: str | None = None) -> bool:
    if not (reason or (entry.get('reason') or '').strip()):
        return False
    return has_timing_data(entry)


def minutes_between(start: datetime.time, end: datetime.time) -> int:
    start_dt = datetime.combine(date.today(), start)
    end_dt = datetime.combine(date.today(), end)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return int((end_dt - start_dt).total_seconds() // 60)


def sum_minute_fields(entry: dict) -> int | None:
    fields = ('maint_minutes', 'tool_minutes', 'eng_minutes', 'prod_minutes', 'other_minutes')
    values = [entry[field] for field in fields if entry.get(field) not in (None, 0)]
    return sum(values) if values else None


def build_comment(entry: dict) -> str:
    parts = [OCR_COMMENT_PREFIX]
    if entry.get('warmup_shot_count') is not None:
        parts.append(f'warmup shots={entry["warmup_shot_count"]}')

    breakdown = []
    for field, label in (
        ('maint_minutes', 'maint'),
        ('tool_minutes', 'tool'),
        ('eng_minutes', 'eng'),
        ('prod_minutes', 'prod'),
        ('other_minutes', 'other'),
    ):
        if entry.get(field) not in (None, 0):
            breakdown.append(f'{label}={entry[field]}m')
    if breakdown:
        parts.append('(' + ', '.join(breakdown) + ')')

    if entry.get('reason_continued_from_previous'):
        parts.append('[continued from previous shift]')

    return ' '.join(parts)


class Command(BaseCommand):
    help = 'Import OCR downtime events into DowntimeEventHistory (manual reason text)'

    def add_arguments(self, parser):
        parser.add_argument(
            'json_path',
            type=str,
            help='Path to extract_downtime_clean.json, extract_merged_clean.json, or job directory',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print planned changes without writing to the database',
        )
        parser.add_argument(
            '--operator',
            default='unknown',
            help='Operator name for imported records (default: unknown)',
        )

    def handle(self, *args, **options):
        path = resolve_json_path(Path(options['json_path']).expanduser().resolve())
        with path.open(encoding='utf-8') as fh:
            data = json.load(fh)

        header = data['header']
        try:
            record_date = parse_date(header['date'])
        except CommandError:
            fallback = parse_date_from_job_dir(str(path.parent))
            if fallback is None:
                raise
            record_date = fallback
            self.stdout.write(self.style.WARNING(
                f'  Parsed date from job folder: {record_date}'
            ))
        operator_name = options['operator']
        machine_id = header['machine']

        self.stdout.write(f'Importing OCR downtime: {path.name}')
        self.stdout.write(
            f'  machine={machine_id} date={record_date} operator={operator_name}'
        )

        from production.ocr_import_utils import find_existing_machine

        machine = find_existing_machine(machine_id)
        if not machine:
            raise CommandError(
                f'Machine {machine_id!r} not found. Run import_ocr_job first or create the machine.'
            )

        planned = self._plan_events(data, machine, record_date, operator_name)
        if not planned:
            self.stdout.write(self.style.WARNING('No downtime entries to import.'))
            return

        if options['dry_run']:
            for item in planned:
                self.stdout.write(
                    f'  {item["shift"]}: {item["start"]}-{item["end"]} '
                    f'({item["duration"]}m) {item["reason"]}'
                )
            self.stdout.write(self.style.WARNING('Dry run — no changes written.'))
            return

        with transaction.atomic():
            deleted, _ = DowntimeEventHistory.objects.filter(
                machine=machine,
                date=record_date,
                operator_name=operator_name,
                comment__startswith=OCR_COMMENT_PREFIX,
            ).delete()
            if deleted:
                self.stdout.write(f'  Removed {deleted} previous OCR downtime row(s)')

            created_count = 0
            downtime_by_shift: dict[str, int] = {}

            for item in planned:
                DowntimeEventHistory.objects.create(
                    machine=machine,
                    operator_name=operator_name,
                    date=record_date,
                    shift=item['shift'],
                    start_time=item['start'],
                    end_time=item['end'],
                    duration=item['duration'],
                    reason_category=item['reason'],
                    reason_subsystem=None,
                    reason_component=None,
                    reason_specific_item=None,
                    reason_full_path=item['reason'],
                    comment=item['comment'],
                )
                downtime_by_shift[item['shift']] = downtime_by_shift.get(item['shift'], 0) + item['duration']
                created_count += 1
                self.stdout.write(
                    f'  Created {item["shift"]} {item["start"]}-{item["end"]} '
                    f'({item["duration"]}m) {item["reason"]}'
                )

            for shift, total_minutes in downtime_by_shift.items():
                record = ProductionRecord.objects.filter(
                    machine=machine,
                    date=record_date,
                    shift=shift,
                    operator_name=operator_name,
                ).first()

                if record:
                    record.downtime = total_minutes
                    record.save(update_fields=['downtime'])
                    self.stdout.write(
                        f'  Updated ProductionRecord shift={shift} downtime={total_minutes}m'
                    )
                else:
                    ProductionRecord.objects.create(
                        machine=machine,
                        date=record_date,
                        shift=shift,
                        operator_name=operator_name,
                        planned_production_time=machine.default_shift_time,
                        counter_start=0,
                        counter_end=0,
                        gross_count=0,
                        excluded_shots=0,
                        net_production=0,
                        total_count=0,
                        target_output=0,
                        performance=0.0,
                        good_count=0,
                        defect_count=0,
                        defects=[],
                        downtime=total_minutes,
                        downtime_events=[],
                        notes=f'OCR downtime import from {path.parent.name}',
                    )
                    self.stdout.write(
                        f'  Created ProductionRecord shift={shift} downtime={total_minutes}m'
                    )

            self.stdout.write(self.style.SUCCESS(f'Done. {created_count} downtime event(s) imported.'))

    def _plan_events(self, data: dict, machine: Machine, record_date: date, operator_name: str) -> list[dict]:
        planned = []

        for shift_block in data.get('shifts', []):
            ocr_shift = shift_block.get('shift')
            system_shift = OCR_SHIFT_MAP.get(ocr_shift)
            if not system_shift:
                self.stdout.write(self.style.WARNING(f'  Unknown shift label: {ocr_shift!r}'))
                continue

            last_reason: str | None = None
            for entry in shift_block.get('downtime_entries', []):
                raw_reason = (entry.get('reason') or '').strip()
                if raw_reason:
                    last_reason = raw_reason
                elif entry.get('reason_continued_from_previous') and last_reason:
                    raw_reason = last_reason
                else:
                    continue

                if not is_valid_entry(entry, reason=raw_reason):
                    continue

                start_time = resolve_start_time(entry)
                end_time = resolve_end_time(entry)
                minute_total = sum_minute_fields(entry)

                duration = None
                if start_time and end_time:
                    duration = minutes_between(start_time, end_time)
                if minute_total and (duration is None or duration <= 0):
                    duration = minute_total
                elif minute_total and duration > 8 * 60:
                    # Prefer minute breakdown when OCR times look implausible.
                    duration = minute_total
                if duration is None or duration <= 0:
                    self.stdout.write(
                        self.style.WARNING(f'  Skipping {raw_reason!r} — could not determine duration')
                    )
                    continue

                if not start_time:
                    start_time = end_time
                if not end_time:
                    end_time = start_time

                planned.append({
                    'shift': system_shift,
                    'reason': raw_reason,
                    'start': start_time,
                    'end': end_time,
                    'duration': duration,
                    'comment': build_comment(entry),
                })

        return planned
