from pathlib import Path

from django.conf import settings

OCR_ROOT = Path(settings.BASE_DIR) / 'ocr'
OCR_SCRATCH_ROOT = Path(settings.OCR_SCRATCH_ROOT)
JOBS_DIR = OCR_SCRATCH_ROOT / 'jobs'
UPLOADS_DIR = OCR_SCRATCH_ROOT / 'uploads'
ALIAS_DIR = JOBS_DIR / '.aliases'
SCHEMAS_DIR = OCR_ROOT / 'schemas'
SCRIPTS_DIR = OCR_ROOT / 'scripts'

JOBS_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
ALIAS_DIR.mkdir(parents=True, exist_ok=True)
