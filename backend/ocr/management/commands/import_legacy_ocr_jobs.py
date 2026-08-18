"""Copy OCR job folders from the legacy Surya project and sync OcrJobRecord rows."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from django.core.management.base import BaseCommand

from ocr.models import OcrJobRecord
from ocr.pipeline import jobs as job_pipeline
from ocr.paths import JOBS_DIR

DEFAULT_SOURCE = Path('/home/vegas/capstone/ocr/surya/data/jobs')


class Command(BaseCommand):
    help = 'Import legacy OCR job folders (meta.json + scans) into backend/ocr/data/jobs/'

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

        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        aliases_src = source / '.aliases'
        aliases_dst = JOBS_DIR / '.aliases'
        if aliases_src.is_dir() and not options['dry_run']:
            aliases_dst.mkdir(parents=True, exist_ok=True)
            for alias in aliases_src.iterdir():
                if alias.is_file():
                    shutil.copy2(alias, aliases_dst / alias.name)

        copied = 0
        for child in sorted(source.iterdir()):
            if not child.is_dir() or child.name.startswith('.'):
                continue
            if not (child / 'meta.json').is_file():
                continue
            dest = JOBS_DIR / child.name
            if options['dry_run']:
                self.stdout.write(f'would copy {child.name}')
                copied += 1
                continue
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(child, dest)
            copied += 1
            self.stdout.write(f'copied {child.name}')

        if options['dry_run']:
            self.stdout.write(self.style.SUCCESS(f'{copied} job folder(s) would be imported'))
            return

        synced = 0
        for meta in job_pipeline.list_jobs():
            folder = meta['id']
            record, _ = OcrJobRecord.objects.get_or_create(folder_name=folder)
            merged_path = job_pipeline.get_job_dir(folder) / 'extract_merged_clean.json'
            if merged_path.is_file():
                merged = json.loads(merged_path.read_text(encoding='utf-8'))
                record.merged_hash = OcrJobRecord.hash_merged(merged)
                record.save(update_fields=['merged_hash'])
            synced += 1

        self.stdout.write(self.style.SUCCESS(f'Imported {copied} folder(s); synced {synced} job record(s)'))
