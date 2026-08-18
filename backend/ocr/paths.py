from pathlib import Path

from django.conf import settings

OCR_ROOT = Path(settings.BASE_DIR) / 'ocr'
JOBS_DIR = OCR_ROOT / 'data' / 'jobs'
UPLOADS_DIR = OCR_ROOT / 'data' / 'uploads'
ALIAS_DIR = JOBS_DIR / '.aliases'
SCHEMAS_DIR = OCR_ROOT / 'schemas'
SCRIPTS_DIR = OCR_ROOT / 'scripts'

JOBS_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
ALIAS_DIR.mkdir(parents=True, exist_ok=True)
