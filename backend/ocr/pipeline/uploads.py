"""Staged PDF uploads: page count, thumbnails, page extraction."""

from __future__ import annotations

import json
import re
import secrets
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from ocr.paths import UPLOADS_DIR


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


def render_pdf_thumbs(pdf_path: Path, out_dir: Path, dpi: int = 72) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob('page-*.png'):
        old.unlink(missing_ok=True)
    prefix = out_dir / 'page'
    subprocess.run(
        ['pdftoppm', '-png', '-r', str(dpi), str(pdf_path), str(prefix)],
        check=True,
        capture_output=True,
    )
    pages = sorted(out_dir.glob('page*.png'))
    normalized: list[Path] = []
    for i, src in enumerate(pages, start=1):
        dest = out_dir / f'page-{i:03d}.png'
        if src.resolve() != dest.resolve():
            src.replace(dest)
        normalized.append(dest)
    return normalized


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
    upload_id = f'upl-{secrets.token_hex(4)}'
    while (UPLOADS_DIR / upload_id).exists():
        upload_id = f'upl-{secrets.token_hex(4)}'
    up_dir = UPLOADS_DIR / upload_id
    up_dir.mkdir(parents=True)
    pdf_path = up_dir / 'source.pdf'
    pdf_path.write_bytes(pdf_bytes)

    try:
        page_count = pdf_page_count(pdf_path)
        thumbs = render_pdf_thumbs(pdf_path, up_dir / 'thumbs', dpi=72)
    except Exception:
        shutil.rmtree(up_dir, ignore_errors=True)
        raise

    meta = {
        'id': upload_id,
        'original_filename': original_filename,
        'page_count': page_count,
        'created_at': _utc_now(),
        'thumb_count': len(thumbs),
    }
    (up_dir / 'meta.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    return meta


def get_upload_dir(upload_id: str) -> Path:
    safe = Path(upload_id).name
    if not re.fullmatch(r'upl-[0-9a-f]+', safe):
        raise FileNotFoundError(upload_id)
    path = (UPLOADS_DIR / safe).resolve()
    if path.parent != UPLOADS_DIR.resolve() or not path.is_dir():
        raise FileNotFoundError(upload_id)
    return path


def read_upload_meta(upload_id: str) -> dict:
    up_dir = get_upload_dir(upload_id)
    return json.loads((up_dir / 'meta.json').read_text(encoding='utf-8'))


def thumb_path(upload_id: str, page: int) -> Path:
    up_dir = get_upload_dir(upload_id)
    path = up_dir / 'thumbs' / f'page-{page:03d}.png'
    if not path.is_file():
        raise FileNotFoundError(f'thumb page {page}')
    return path


def delete_upload(upload_id: str) -> None:
    up_dir = get_upload_dir(upload_id)
    shutil.rmtree(up_dir)
