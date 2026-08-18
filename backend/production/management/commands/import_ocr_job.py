"""
Import reject data from an OCR extract_merged_clean.json file into ProductionRecord
and PartProductionHistory rows (one NG entry per rejected unit, for UI visibility).

Usage:
  .venv/bin/python manage.py import_ocr_job /path/to/extract_merged_clean.json
  .venv/bin/python manage.py import_ocr_job /path/to/extract_merged_clean.json --dry-run
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from production.models import (
    DefectReason,
    Die,
    Machine,
    Operator,
    Part,
    PartProductionHistory,
    ProductionRecord,
)
from production.ocr_import_utils import (
    SHIFT_TO_OCR,
    parse_date,
    parse_date_from_job_dir,
    slug_part_number,
)

SHIFT_MAP = {
    'n_s': 'night',
    'd_s': 'morning',
    'a_s': 'afternoon',
}


class Command(BaseCommand):
    help = 'Import OCR reject data from extract_merged_clean.json'

    def add_arguments(self, parser):
        parser.add_argument('json_path', type=str, help='Path to extract_merged_clean.json')
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
        path = Path(options['json_path']).expanduser().resolve()
        if not path.is_file():
            raise CommandError(f'File not found: {path}')

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

        self.stdout.write(f'Importing OCR job: {path.name}')
        self.stdout.write(
            f'  machine={header["machine"]} product={header["product"]} '
            f'die={header["die_number"]} date={record_date}'
        )

        with transaction.atomic():
            machine = self._ensure_machine(header['machine'], dry_run=options['dry_run'])
            part = self._ensure_part(header['product'], header['die_number'], dry_run=options['dry_run'])
            self._ensure_operator(operator_name, dry_run=options['dry_run'])
            self._link_machine_part(machine, part, dry_run=options['dry_run'])

            if options['dry_run']:
                self._plan_import(data, machine, part, header, record_date, operator_name)
                self.stdout.write(self.style.WARNING('Dry run — no changes written.'))
                transaction.set_rollback(True)
                return

            created_records = []
            created_parts = 0

            for shift_key, shift_name in SHIFT_MAP.items():
                shift_rejects = self._shift_rejects(data['rejects'], shift_key)
                defect_count = data.get('total_rejects', {}).get(shift_key) or sum(
                    r['count'] for r in shift_rejects
                )
                if defect_count == 0 and not shift_rejects:
                    continue

                defects_json = [
                    {
                        'category': 'casting',
                        'type': r['reason'],
                        'quantity': r['count'],
                    }
                    for r in shift_rejects
                ]

                counters = data.get('machine_counter', {})
                start_val = (counters.get('start') or {}).get(shift_key)
                stop_val = (counters.get('stop') or {}).get(shift_key)
                gross_val = (counters.get('machine') or {}).get(shift_key)

                record = ProductionRecord.objects.filter(
                    machine=machine,
                    date=record_date,
                    shift=shift_name,
                    operator_name=operator_name,
                ).first()
                record_fields = {
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
                    'notes': f'OCR import from {path.parent.name}',
                    'downtime_events': [],
                }
                if record:
                    for key, value in record_fields.items():
                        setattr(record, key, value)
                    record.save()
                    created = False
                else:
                    record = ProductionRecord.objects.create(
                        machine=machine,
                        date=record_date,
                        shift=shift_name,
                        operator_name=operator_name,
                        downtime=0,
                        **record_fields,
                    )
                    created = True
                action = 'Created' if created else 'Updated'
                self.stdout.write(
                    f'  {action} ProductionRecord shift={shift_name} '
                    f'defect_count={defect_count} reasons={len(defects_json)}'
                )
                created_records.append(record)

                # Replace prior OCR-imported part rows for this shift/date/machine.
                deleted, _ = PartProductionHistory.objects.filter(
                    machine=machine,
                    date=record_date,
                    shift=shift_name,
                    operator_name=operator_name,
                    comment__startswith='OCR import:',
                ).delete()
                if deleted:
                    self.stdout.write(f'    Removed {deleted} previous OCR part rows for {shift_name}')

                die_label = header['die_number']
                for reject in shift_rejects:
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
                        )
                        created_parts += 1

            self.stdout.write(
                self.style.SUCCESS(
                    f'Done. {len(created_records)} shift record(s), {created_parts} part NG row(s).'
                )
            )

    def _ensure_machine(self, machine_id: str, *, dry_run: bool) -> Machine:
        from production.ocr_import_utils import find_existing_machine, strip_machine_name

        machine_id = strip_machine_name(machine_id)
        existing = find_existing_machine(machine_id)
        if existing:
            self.stdout.write(f'  Machine exists: id={existing.id} {existing.machine_id}')
            return existing
        if dry_run:
            self.stdout.write(f'  Would create machine: {machine_id} (casting)')
            return Machine(machine_id=machine_id, name=machine_id, type='casting')
        machine = Machine.objects.create(
            name=machine_id,
            machine_id=machine_id,
            type='casting',
            status='idle',
            active=True,
        )
        self.stdout.write(self.style.SUCCESS(f'  Created machine id={machine.id} {machine.machine_id}'))
        return machine

    def _link_machine_part(self, machine: Machine, part: Part, *, dry_run: bool) -> None:
        if dry_run:
            if machine.pk and part.pk and machine.supported_parts.filter(pk=part.pk).exists():
                self.stdout.write(f'  Part already on machine: {part.name}')
            else:
                self.stdout.write(
                    f'  Would link part {part.name} to machine {machine.machine_id}'
                )
            return

        if not machine.pk or not part.pk:
            return

        if machine.supported_parts.filter(pk=part.pk).exists():
            self.stdout.write(f'  Part already on machine: {part.name}')
            return

        machine.supported_parts.add(part)
        self.stdout.write(
            self.style.SUCCESS(
                f'  Linked part {part.name} to machine {machine.machine_id}'
            )
        )

    def _ensure_part(self, product: str, die_number: str, *, dry_run: bool) -> Part:
        part_number = slug_part_number(product)
        existing = Part.objects.filter(part_number=part_number).first()
        if not existing:
            by_name = Part.objects.filter(name__iexact=product.strip()).first()
            if by_name:
                existing = by_name

        die = Die.objects.filter(die_number=die_number).first()
        if not die and not dry_run:
            die, die_created = Die.objects.get_or_create(
                die_number=die_number,
                defaults={'name': f'Die #{die_number}'},
            )
            if die_created:
                self.stdout.write(self.style.SUCCESS(f'  Created die id={die.id} die_number={die_number}'))

        if existing:
            self.stdout.write(f'  Part exists: id={existing.id} {existing.name}')
            if die and not dry_run and die not in existing.dies.all():
                existing.dies.add(die)
                self.stdout.write(f'  Linked die {die_number} to part {existing.name}')
            return existing

        if dry_run:
            self.stdout.write(f'  Would create part: {product} ({part_number})')
            return Part(name=product, part_number=part_number, cycle_time=2.0)

        part = Part.objects.create(
            name=product.strip(),
            part_number=part_number,
            cycle_time=2.0,
            active=True,
        )
        if die:
            part.dies.add(die)
        self.stdout.write(self.style.SUCCESS(f'  Created part id={part.id} {part.name}'))
        return part

    def _ensure_operator(self, name: str, *, dry_run: bool) -> None:
        if Operator.objects.filter(name=name).exists():
            return
        if dry_run:
            self.stdout.write(f'  Would ensure operator: {name}')
            return
        Operator.objects.get_or_create(
            employee_id=name,
            defaults={'name': name, 'role': 'Operator', 'active': True},
        )

    def _shift_rejects(self, rejects: list, shift_key: str) -> list[dict]:
        out = []
        for row in rejects:
            count = row.get(shift_key)
            if count is None or count <= 0:
                continue
            reason = row['reason']
            if not DefectReason.objects.filter(
                category='Casting Defect', subcategory=reason
            ).exists():
                self.stdout.write(
                    self.style.WARNING(f'  Unknown defect reason (will still import): {reason}')
                )
            out.append({'reason': reason, 'count': int(count)})
        return out

    def _plan_import(self, data, machine, part, header, record_date, operator_name):
        for shift_key, shift_name in SHIFT_MAP.items():
            shift_rejects = self._shift_rejects(data['rejects'], shift_key)
            defect_count = data.get('total_rejects', {}).get(shift_key) or sum(
                r['count'] for r in shift_rejects
            )
            if defect_count == 0 and not shift_rejects:
                self.stdout.write(f'  Shift {shift_name} ({SHIFT_TO_OCR[shift_name]}): no rejects')
                continue
            self.stdout.write(
                f'  Shift {shift_name} ({SHIFT_TO_OCR[shift_name]}): '
                f'{defect_count} rejects across {len(shift_rejects)} reason(s)'
            )
            for reject in shift_rejects:
                self.stdout.write(f'    - {reject["reason"]}: {reject["count"]}')
