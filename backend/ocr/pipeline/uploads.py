"""Content-addressed staged PDFs: page counting and OCR page extraction."""

from __future__ import annotations

import json
import hashlib
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from ocr.paths import UPLOADS_DIR
from ocr.storage import get_store


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def pdf_page_count(pdf_path: Path) -> int:
    out = subprocess.check_output(
        ['pdfinfo', str(pdf_path)],
        text=True,
        stderr=subprocess.STDOUT,
    )
    for line in out.splitlines():
        if line.lower().startswith('pages:'):
            return int(line.split(':', 1)[1].strip())
    raise RuntimeError(f'Could not read page count for {pdf_path}')


def extract_pdf_page(src_pdf: Path, page: int, dest_pdf: Path) -> None:
    dest_pdf.parent.mkdir(parents=True, exist_ok=True)
    tmp_prefix = dest_pdf.parent / f'.tmp_{dest_pdf.stem}'
    for old in dest_pdf.parent.glob(f'{tmp_prefix.name}*'):
        old.unlink(missing_ok=True)
    subprocess.run(
        [
            'pdfseparate',
            '-f', str(page),
            '-l', str(page),
            str(src_pdf),
            str(tmp_prefix) + '%d.pdf',
        ],
        check=True,
        capture_output=True,
    )
    produced = list(dest_pdf.parent.glob(f'{tmp_prefix.name}*.pdf'))
    if not produced:
        raise RuntimeError(f'pdfseparate produced no page {page} for {src_pdf}')
    produced[0].replace(dest_pdf)
    for extra in dest_pdf.parent.glob(f'{tmp_prefix.name}*'):
        extra.unlink(missing_ok=True)


def create_upload(pdf_bytes: bytes, original_filename: str) -> dict:
    store = get_store()
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    upload_id = f'upl-{digest}'
    source_key = f'sources/{digest}.pdf'
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='upload-', dir=UPLOADS_DIR) as temp_dir:
        pdf_path = Path(temp_dir) / 'source.pdf'
        pdf_path.write_bytes(pdf_bytes)
        page_count = pdf_page_count(pdf_path)

    meta = {
        'id': upload_id,
        'original_filename': original_filename,
        'page_count': page_count,
        'created_at': _utc_now(),
        'content_sha256': digest,
        'source_key': source_key,
    }
    created_source = store.put_bytes_if_absent(
        source_key,
        pdf_bytes,
        content_type='application/pdf',
    )
    created_upload = store.put_json_if_absent(f'uploads/{upload_id}/meta.json', meta)
    if not created_upload:
        stored_meta = read_upload_meta(upload_id)
        meta = {**stored_meta, 'original_filename': original_filename}
    return {
        **meta,
        'deduplicated': not created_source,
    }


def get_upload_dir(upload_id: str) -> Path:
    safe = Path(upload_id).name
    if not re.fullmatch(r'upl-[0-9a-f]+', safe):
        raise FileNotFoundError(upload_id)
    path = (UPLOADS_DIR / safe).resolve()
    if path.parent != UPLOADS_DIR.resolve():
        raise FileNotFoundError(upload_id)
    meta = read_upload_meta(safe)
    path.mkdir(parents=True, exist_ok=True)
    source = path / 'source.pdf'
    source_key = meta.get('source_key')
    if source_key:
        get_store().download_file(str(source_key), source)
    else:
        get_store().download_file(f'uploads/{safe}/source.pdf', source)
    (path / 'meta.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    return path


def read_upload_meta(upload_id: str) -> dict:
    safe = Path(upload_id).name
    if not re.fullmatch(r'upl-[0-9a-f]+', safe):
        raise FileNotFoundError(upload_id)
    try:
        return get_store().get_json(f'uploads/{safe}/meta.json')
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
        raise FileNotFoundError(upload_id) from exc


def delete_upload(upload_id: str) -> None:
    safe = Path(upload_id).name
    if not re.fullmatch(r'upl-[0-9a-f]+', safe):
        raise FileNotFoundError(upload_id)
    store = get_store()
    if not store.exists(f'uploads/{safe}/meta.json'):
        raise FileNotFoundError(upload_id)
    meta = read_upload_meta(safe)
    source_key = str(meta.get('source_key') or '')
    store.delete_prefix(f'uploads/{safe}')
    shutil.rmtree(UPLOADS_DIR / safe, ignore_errors=True)
    if source_key.startswith('sources/'):
        from ocr.pipeline.jobs import _source_is_referenced

        if not _source_is_referenced(source_key, store):
            store.delete_object(source_key)
