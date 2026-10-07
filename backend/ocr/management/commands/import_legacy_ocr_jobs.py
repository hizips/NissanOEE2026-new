"""Copy OCR job folders from the legacy Surya project and sync OcrJobRecord rows."""

from __future__ import annotations

from pathlib import Path

from django.core.management.base import BaseCommand

from ocr.models import OcrJobRecord
from ocr.pipeline import jobs as job_pipeline
from ocr.storage import get_store

DEFAULT_SOURCE = Path('/home/vegas/capstone/ocr/surya/data/jobs')


class Command(BaseCommand):
    help = 'Import legacy OCR job folders (meta.json + scans) into the configured S3 bucket'

    def add_arguments(self, parser):
        parser.add_argument(
            '--source',
            type=str,
            default=str(DEFAULT_SOURCE),
            help=f'Legacy jobs directory (default: {DEFAULT_SOURCE})',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='List folders that would be copied without writing files',
        )

    def handle(self, *args, **options):
        source = Path(options['source']).expanduser().resolve()
        if not source.is_dir():
            self.stderr.write(self.style.ERROR(f'Source not found: {source}'))
            return

        store = get_store()
        aliases_src = source / '.aliases'
        if aliases_src.is_dir() and not options['dry_run']:
            for alias in aliases_src.iterdir():
                if alias.is_file():
                    store.put_text(f'jobs/.aliases/{alias.name}', alias.read_text(encoding='utf-8'))

        copied = 0
        for child in sorted(source.iterdir()):
            if not child.is_dir() or child.name.startswith('.'):
                continue
            if not (child / 'meta.json').is_file():
                continue
            if options['dry_run']:
                self.stdout.write(f'would copy {child.name}')
                copied += 1
                continue
            store.delete_prefix(f'jobs/{child.name}')
            store.upload_tree(child, f'jobs/{child.name}')
            copied += 1
            self.stdout.write(f'copied {child.name}')

        if options['dry_run']:
            self.stdout.write(self.style.SUCCESS(f'{copied} job folder(s) would be imported'))
            return

        synced = 0
        for meta in job_pipeline.list_jobs():
            folder = meta['id']
            record, _ = OcrJobRecord.objects.get_or_create(folder_name=folder)
            try:
                merged = job_pipeline.load_merged(folder)
                record.merged_json_hash = OcrJobRecord.hash_merged(merged)
                record.save(update_fields=['merged_json_hash'])
            except FileNotFoundError:
                pass
            synced += 1

        self.stdout.write(self.style.SUCCESS(f'Imported {copied} folder(s); synced {synced} job record(s)'))
