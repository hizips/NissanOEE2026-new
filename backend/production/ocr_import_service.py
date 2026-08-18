"""Shared OCR → production DB import logic (used by management commands and OCR API)."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

from django.db import transaction

from production.models import (
    Die,
    DowntimeEventHistory,
    Machine,
    Operator,
    Part,
    PartProductionHistory,
    ProductionRecord,
)
from production.ocr_import_utils import (
    OCR_COMMENT_PREFIX,
    OCR_SHIFT_MAP,
    canonicalize_machine_name,
    find_existing_machine,
    ocr_import_notes,
    parse_date,
    parse_date_from_job_dir,
    parse_ocr_job_id_from_notes,
    slug_part_number,
)

SHIFT_MAP = {
    'n_s': 'night',
    'd_s': 'morning',
    'a_s': 'afternoon',
}

# Never treat the form's Total column as a shift count — that value is the day total.
SHIFT_COUNT_ALIASES = {
    'n_s': ('n_s', 'nS', 'ns', 'N/S'),
    'd_s': ('d_s', 'dS', 'ds', 'D/S'),
    'a_s': ('a_s', 'aS', 'as', 'A/S'),
}


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


def sum_minute_fields(entry: dict) -> int | None:
    fields = ('maint_minutes', 'tool_minutes', 'eng_minutes', 'prod_minutes', 'other_minutes')
    values = [entry[field] for field in fields if entry.get(field) not in (None, 0)]
    return sum(values) if values else None


def has_timing_data(entry: dict) -> bool:
    if sum_minute_fields(entry):
        return True
    return resolve_start_time(entry) is not None and resolve_end_time(entry) is not None


def minutes_between(start: datetime.time, end: datetime.time) -> int:
    start_dt = datetime.combine(date.today(), start)
    end_dt = datetime.combine(date.today(), end)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return int((end_dt - start_dt).total_seconds() // 60)


def build_downtime_comment(entry: dict) -> str:
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


def resolve_record_date(data: dict, json_path: Path | None = None) -> date:
    header = data['header']
    default_year = int(header.get('year') or 2025)
    try:
        return parse_date(header['date'], default_year=default_year)
    except Exception:
        if json_path is not None:
            fallback = parse_date_from_job_dir(str(json_path.parent))
            if fallback is not None:
                return fallback
        raise


def ensure_machine(machine_id: str) -> Machine:
    raw = canonicalize_machine_name(machine_id)
    if not raw:
        raise ValueError('Machine is blank in the OCR header.')
    existing = find_existing_machine(raw)
    if existing:
        return existing
    return Machine.objects.create(
        name=raw,
        machine_id=raw,
        type='casting',
        status='idle',
        active=True,
    )


def ensure_part(product: str, die_number: str) -> Part:
    part_number = slug_part_number(product)
    existing = Part.objects.filter(part_number=part_number).first()
    if not existing:
        existing = Part.objects.filter(name__iexact=product.strip()).first()

    die = Die.objects.filter(die_number=die_number).first()
    if not die:
        die, _ = Die.objects.get_or_create(
            die_number=die_number,
            defaults={'name': f'Die #{die_number}'},
        )

    if existing:
        if die and die not in existing.dies.all():
            existing.dies.add(die)
        return existing

    part = Part.objects.create(
        name=product.strip(),
        part_number=part_number,
        cycle_time=2.0,
        active=True,
    )
    if die:
        part.dies.add(die)
    return part


def link_machine_part(machine: Machine, part: Part) -> None:
    if not machine.supported_parts.filter(pk=part.pk).exists():
        machine.supported_parts.add(part)


def ensure_operator(name: str = 'unknown') -> None:
    if not Operator.objects.filter(name=name).exists():
        Operator.objects.get_or_create(
            employee_id=name,
            defaults={'name': name, 'role': 'Operator', 'active': True},
        )


def coerce_count(value) -> int | None:
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(str(value).strip()))
        except (TypeError, ValueError):
            return None


def shift_count(row: dict, shift_key: str) -> int | None:
    """Read NG/counter for one shift column. Ignores the day-total `total` field."""
    if not isinstance(row, dict):
        return None
    for alias in SHIFT_COUNT_ALIASES.get(shift_key, (shift_key,)):
        if alias not in row:
            continue
        parsed = coerce_count(row.get(alias))
        if parsed is not None:
            return parsed
    return None


def shift_rejects(rejects: list, shift_key: str) -> list[dict]:
    out = []
    for row in rejects or []:
        if not isinstance(row, dict):
            continue
        count = shift_count(row, shift_key)
        if count is None or count <= 0:
            continue
        reason = (row.get('reason') or '').strip()
        if not reason:
            continue
        out.append({'reason': reason, 'count': count})
    return out


def shifts_with_importable_downtime(data: dict) -> set[str]:
    return {item['shift'] for item in plan_downtime_events(data)}


def delete_ocr_shift_rows(
    *,
    record: ProductionRecord | None,
    ids: list[str],
    shift_name: str,
    machine: Machine,
    record_date: date,
    operator_name: str,
) -> None:
    if ids:
        PartProductionHistory.objects.filter(ocr_job_id__in=ids, shift=shift_name).delete()
        DowntimeEventHistory.objects.filter(ocr_job_id__in=ids, shift=shift_name).delete()
    else:
        PartProductionHistory.objects.filter(
            machine=machine,
            date=record_date,
            shift=shift_name,
            operator_name=operator_name,
        ).delete()
        DowntimeEventHistory.objects.filter(
            machine=machine,
            date=record_date,
            shift=shift_name,
            operator_name=operator_name,
        ).delete()
    if record is not None:
        record.delete()


def purge_empty_ocr_shifts(ocr_job_ids: list[str]) -> int:
    """Drop mapped shifts that have no NG rows and no downtime events."""
    ids = [i for i in ocr_job_ids if i]
    if not ids:
        return 0
    removed = 0
    for rec in list(ProductionRecord.objects.filter(ocr_job_id__in=ids)):
        has_ng = (
            rec.defect_count > 0
            or PartProductionHistory.objects.filter(ocr_job_id__in=ids, shift=rec.shift).exists()
        )
        has_downtime = (
            rec.downtime > 0
            or DowntimeEventHistory.objects.filter(ocr_job_id__in=ids, shift=rec.shift).exists()
        )
        if has_ng or has_downtime:
            continue
        PartProductionHistory.objects.filter(ocr_job_id__in=ids, shift=rec.shift).delete()
        DowntimeEventHistory.objects.filter(ocr_job_id__in=ids, shift=rec.shift).delete()
        rec.delete()
        removed += 1
    return removed


def plan_downtime_events(data: dict) -> list[dict]:
    planned = []
    for shift_block in data.get('shifts', []):
        ocr_shift = shift_block.get('shift')
        system_shift = OCR_SHIFT_MAP.get(ocr_shift)
        if not system_shift:
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

            if not raw_reason or not has_timing_data(entry):
                continue

            start_time = resolve_start_time(entry)
            end_time = resolve_end_time(entry)
            minute_total = sum_minute_fields(entry)

            duration = None
            if start_time and end_time:
                duration = minutes_between(start_time, end_time)
            if minute_total and (duration is None or duration <= 0):
                duration = minute_total
            elif minute_total and duration and duration > 8 * 60:
                duration = minute_total
            if duration is None or duration <= 0:
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
                'comment': build_downtime_comment(entry),
            })
    return planned


def resolve_ocr_job_id(
    *,
    ocr_job_id: str | None = None,
    source_label: str | None = None,
    json_path: Path | None = None,
) -> str:
    if ocr_job_id:
        return str(ocr_job_id).strip()
    if json_path is not None:
        return json_path.parent.name
    parsed = parse_ocr_job_id_from_notes(source_label)
    return parsed or ''


def mapped_records_by_shift(ocr_job_ids: list[str]) -> dict[str, ProductionRecord]:
    mapped: dict[str, ProductionRecord] = {}
    ids = [i for i in ocr_job_ids if i]
    if not ids:
        return mapped
    for rec in ProductionRecord.objects.filter(ocr_job_id__in=ids):
        mapped[rec.shift] = rec
    if mapped:
        return mapped
    from django.db.models import Q

    q = Q()
    for job_id in ids:
        q |= Q(notes__iexact=ocr_import_notes(job_id))
        q |= Q(notes__iexact=f'OCR downtime import from {job_id}')
    for rec in ProductionRecord.objects.filter(q):
        mapped[rec.shift] = rec
    return mapped


@transaction.atomic
def import_rejects_from_merged(
    data: dict,
    *,
    operator_name: str = 'unknown',
    source_label: str = 'OCR import',
    json_path: Path | None = None,
    ocr_job_id: str | None = None,
    ocr_job_ids: list[str] | None = None,
    shifts_with_downtime: set[str] | None = None,
) -> dict:
    header = data['header']
    record_date = resolve_record_date(data, json_path)
    machine = ensure_machine(header['machine'])
    part = ensure_part(header['product'], header['die_number'])
    ensure_operator(operator_name)
    link_machine_part(machine, part)

    job_id = resolve_ocr_job_id(
        ocr_job_id=ocr_job_id, source_label=source_label, json_path=json_path
    )
    ids = list(dict.fromkeys([*(ocr_job_ids or []), job_id]))
    notes = ocr_import_notes(job_id) if job_id else source_label
    mapped = mapped_records_by_shift(ids)
    downtime_shifts = shifts_with_downtime if shifts_with_downtime is not None else shifts_with_importable_downtime(data)

    shift_records = 0
    part_rows = 0

    for shift_key, shift_name in SHIFT_MAP.items():
        shift_reject_rows = shift_rejects(data.get('rejects') or [], shift_key)
        # NG count is the sum of that shift's reason columns only — never Total / total_rejects.
        defect_count = sum(r['count'] for r in shift_reject_rows)
        counters = data.get('machine_counter', {}) or {}
        start_val = shift_count(counters.get('start') or {}, shift_key)
        stop_val = shift_count(counters.get('stop') or {}, shift_key)
        gross_val = shift_count(counters.get('machine') or {}, shift_key)
        has_ng = defect_count > 0
        has_downtime = shift_name in downtime_shifts

        record = mapped.get(shift_name)
        if not record:
            record = ProductionRecord.objects.filter(
                machine=machine,
                date=record_date,
                shift=shift_name,
                operator_name=operator_name,
            ).first()

        if not has_ng and not has_downtime:
            delete_ocr_shift_rows(
                record=record,
                ids=ids,
                shift_name=shift_name,
                machine=machine,
                record_date=record_date,
                operator_name=operator_name,
            )
            mapped.pop(shift_name, None)
            continue

        defects_json = [
            {'category': 'casting', 'type': r['reason'], 'quantity': r['count']}
            for r in shift_reject_rows
        ]

        record_fields = {
            'machine': machine,
            'date': record_date,
            'shift': shift_name,
            'operator_name': operator_name,
            'planned_production_time': machine.default_shift_time,
            'counter_start': start_val or 0,
            'counter_end': stop_val or 0,
            'gross_count': gross_val or 0,
            'excluded_shots': 0,
            'net_production': gross_val or 0,
            'total_count': gross_val or 0,
            'target_output': 0,
            'performance': 0.0,
            'good_count': max((gross_val or 0) - defect_count, 0),
            'defect_count': defect_count,
            'defects': defects_json,
            'notes': notes,
            'ocr_job_id': job_id,
        }
        if record:
            for key, value in record_fields.items():
                setattr(record, key, value)
            record.save()
        else:
            record = ProductionRecord.objects.create(
                downtime=0,
                downtime_events=[],
                **record_fields,
            )
        mapped[shift_name] = record
        shift_records += 1

        if ids:
            PartProductionHistory.objects.filter(ocr_job_id__in=ids, shift=shift_name).delete()
        else:
            PartProductionHistory.objects.filter(
                machine=machine,
                date=record_date,
                shift=shift_name,
                operator_name=operator_name,
                comment__startswith='OCR import:',
            ).delete()

        die_label = header['die_number']
        for reject in shift_reject_rows:
            for _ in range(reject['count']):
                PartProductionHistory.objects.create(
                    machine=machine,
                    part=part,
                    die=die_label,
                    operator_name=operator_name,
                    date=record_date,
                    shift=shift_name,
                    result='NOT GOOD',
                    defect_category='Casting Defect',
                    defect_subcategory=reject['reason'],
                    comment=f'OCR import: {reject["reason"]}',
                    ocr_job_id=job_id,
                )
                part_rows += 1

    return {'shift_records': shift_records, 'part_rows': part_rows}


@transaction.atomic
def import_downtime_from_merged(
    data: dict,
    *,
    operator_name: str = 'unknown',
    json_path: Path | None = None,
    source_label: str = 'OCR import',
    ocr_job_id: str | None = None,
    ocr_job_ids: list[str] | None = None,
) -> dict:
    header = data['header']
    record_date = resolve_record_date(data, json_path)
    machine = ensure_machine(header['machine'])
    job_id = resolve_ocr_job_id(
        ocr_job_id=ocr_job_id, source_label=source_label, json_path=json_path
    )
    ids = list(dict.fromkeys([*(ocr_job_ids or []), job_id]))
    notes = ocr_import_notes(job_id) if job_id else source_label
    mapped = mapped_records_by_shift(ids)

    planned = plan_downtime_events(data)
    if ids:
        DowntimeEventHistory.objects.filter(ocr_job_id__in=ids).delete()
    else:
        DowntimeEventHistory.objects.filter(
            machine=machine,
            date=record_date,
            operator_name=operator_name,
            comment__startswith=OCR_COMMENT_PREFIX,
        ).delete()

    if not planned:
        return {'events': 0}

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
            ocr_job_id=job_id,
        )
        downtime_by_shift[item['shift']] = downtime_by_shift.get(item['shift'], 0) + item['duration']

    for shift, total_minutes in downtime_by_shift.items():
        record = mapped.get(shift)
        if not record:
            record = ProductionRecord.objects.filter(
                machine=machine,
                date=record_date,
                shift=shift,
                operator_name=operator_name,
            ).first()
        if record:
            record.machine = machine
            record.date = record_date
            record.shift = shift
            record.operator_name = operator_name
            record.downtime = total_minutes
            record.notes = notes
            record.ocr_job_id = job_id
            record.save(update_fields=[
                'machine', 'date', 'shift', 'operator_name',
                'downtime', 'notes', 'ocr_job_id',
            ])
        else:
            record = ProductionRecord.objects.create(
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
                notes=notes,
                ocr_job_id=job_id,
            )
        mapped[shift] = record

    return {'events': len(planned)}


def import_merged_data(
    data: dict,
    *,
    import_rejects: bool = True,
    import_downtime: bool = True,
    operator_name: str = 'unknown',
    source_label: str = 'OCR import',
    json_path: Path | None = None,
    ocr_job_id: str | None = None,
    ocr_job_ids: list[str] | None = None,
) -> dict:
    job_id = resolve_ocr_job_id(
        ocr_job_id=ocr_job_id, source_label=source_label, json_path=json_path
    )
    ids = list(dict.fromkeys([*(ocr_job_ids or []), job_id]))
    downtime_shifts = shifts_with_importable_downtime(data) if import_downtime else set()
    result = {}
    if import_rejects:
        result['rejects'] = import_rejects_from_merged(
            data,
            operator_name=operator_name,
            source_label=source_label,
            json_path=json_path,
            ocr_job_id=job_id,
            ocr_job_ids=ids,
            shifts_with_downtime=downtime_shifts,
        )
    if import_downtime:
        result['downtime'] = import_downtime_from_merged(
            data,
            operator_name=operator_name,
            json_path=json_path,
            source_label=source_label,
            ocr_job_id=job_id,
            ocr_job_ids=ids,
        )
    result['removed_empty_shifts'] = purge_empty_ocr_shifts(ids)
    return result
