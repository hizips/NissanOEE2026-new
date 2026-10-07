#!/usr/bin/env python3
"""Job store + convert/dual-extract pipeline for the web UI."""

from __future__ import annotations

import json
import hashlib
import queue
import re
import secrets
import shutil
import sys
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings

from ocr.paths import ALIAS_DIR, JOBS_DIR, SCRIPTS_DIR, UPLOADS_DIR
from ocr.storage import get_store

sys.path.insert(0, str(SCRIPTS_DIR))

from dual_extract import (  # noqa: E402
    DOWNTIME_SCHEMA,
    REJECTS_SCHEMA,
    clean,
    parse_extraction,
    run_extract,
)
from lib_datalab import require_api_key  # noqa: E402
from ocr_pipeline import CONVERT_MODES, EXTRACT_MODES, run_convert  # noqa: E402
from sheet_form import canonicalize_machine_name, form_template, normalize_merged  # noqa: E402

_lock = threading.Lock()
_reconcile_lock = threading.Lock()

DEFAULT_CONVERT_MODE = "accurate"
DEFAULT_EXTRACTION_MODE = "fast"


def normalize_convert_mode(mode: str | None) -> str:
    m = (mode or DEFAULT_CONVERT_MODE).strip().lower()
    return m if m in CONVERT_MODES else DEFAULT_CONVERT_MODE


def normalize_extraction_mode(mode: str | None) -> str:
    m = (mode or DEFAULT_EXTRACTION_MODE).strip().lower()
    return m if m in EXTRACT_MODES else DEFAULT_EXTRACTION_MODE


def _parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _elapsed_seconds(started: str | None, finished: str | None = None) -> float | None:
    start = _parse_iso(started)
    end = _parse_iso(finished) if finished else datetime.now(timezone.utc)
    if not start or not end:
        return None
    return max(0.0, (end - start).total_seconds())


def _cost_float(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sync_db_record(job_dir: Path, meta: dict) -> None:
    from ocr.models import OcrJobRecord

    folder = job_dir.name
    record, _ = OcrJobRecord.objects.get_or_create(folder_name=folder)
    record.display_name = meta.get('name') or folder
    record.ocr_status = meta.get('status') or record.ocr_status
    record.ocr_stage = meta.get('stage') or ''
    record.metadata = {**meta, 'id': folder}
    record.save(
        update_fields=[
            'display_name',
            'ocr_status',
            'ocr_stage',
            'metadata',
            'updated_at',
        ]
    )


def _delete_db_record(folder_name: str) -> None:
    from ocr.models import OcrJobRecord

    OcrJobRecord.objects.filter(folder_name=folder_name).delete()


def random_job_name() -> str:
    return f"job-{secrets.token_hex(3)}"


def sanitize_name_part(value: object, fallback: str = "unknown") -> str:
    s = str(value or "").strip()
    if not s:
        return fallback
    s = s.replace("/", "-").replace("\\", "-")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w.\- #()+]+", "", s, flags=re.UNICODE).strip(" .-_")
    return s or fallback


def display_name_from_header(header: dict | None) -> str:
    h = header or {}
    date = sanitize_name_part(h.get("date"), "nodate")
    machine = sanitize_name_part(
        canonicalize_machine_name(h.get("machine")) or h.get("machine"),
        "nomachine",
    )
    product = sanitize_name_part(h.get("product"), "noproduct")
    die = sanitize_name_part(h.get("die_number"), "nodie")
    return f"{date} - {machine} - {product} - {die}"


def folder_slug(display_name: str) -> str:
    slug = display_name.replace(" - ", "__")
    slug = re.sub(r"[^\w.\-]+", "_", slug, flags=re.UNICODE)
    slug = re.sub(r"_+", "_", slug).strip("._")
    return slug[:120] or "job"


def _meta_path(job_dir: Path) -> Path:
    return job_dir / "meta.json"


def read_meta(job_dir: Path) -> dict:
    return json.loads(_meta_path(job_dir).read_text(encoding="utf-8"))


def write_meta(job_dir: Path, meta: dict) -> None:
    meta = dict(meta)
    meta["updated_at"] = _utc_now()
    _meta_path(job_dir).write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _job_prefix(job_id: str) -> str:
    return f"jobs/{Path(job_id).name}"


def _sync_meta(job_dir: Path) -> None:
    """Persist the small job checkpoint without re-uploading immutable artifacts."""
    get_store().put_json(f"{_job_prefix(job_dir.name)}/meta.json", read_meta(job_dir))


def _sync_artifact(job_dir: Path, path: Path) -> None:
    """Upload one changed job artifact."""
    relative = path.resolve().relative_to(job_dir.resolve()).as_posix()
    if relative in {'input.pdf', 'original.png', 'source.pdf'}:
        return
    get_store().put_file(f"{_job_prefix(job_dir.name)}/{relative}", path)


def _set_alias(old_id: str, new_id: str) -> None:
    ALIAS_DIR.mkdir(parents=True, exist_ok=True)
    (ALIAS_DIR / old_id).write_text(new_id, encoding="utf-8")
    get_store().put_text(f"jobs/.aliases/{old_id}", new_id)


def resolve_job_id(job_id: str) -> str:
    """Follow rename aliases to the current folder name."""
    seen: set[str] = set()
    current = Path(job_id).name
    while current not in seen:
        seen.add(current)
        from ocr.models import OcrJobRecord

        if OcrJobRecord.objects.filter(folder_name=current).exists():
            break
        alias_key = f"jobs/.aliases/{current}"
        if not get_store().exists(alias_key):
            break
        current = get_store().get_text(alias_key).strip() or current
    return current


def all_ids_for_job(job_id: str) -> list[str]:
    """Current folder name plus any alias names that resolve to it."""
    current = resolve_job_id(job_id)
    ids = {current, Path(job_id).name}
    for alias in get_store().list_alias_ids():
        try:
            if resolve_job_id(alias) == current:
                ids.add(alias)
        except OSError:
            pass
    return [i for i in ids if i]


def retarget_imported_records(old_id: str, new_id: str) -> None:
    """Keep shift-record mapping when an OCR job folder is renamed."""
    if not old_id or old_id == new_id:
        return
    from production.models import DowntimeEventHistory, PartProductionHistory, ProductionRecord
    from production.ocr_import_utils import ocr_import_notes

    for model in (ProductionRecord, PartProductionHistory, DowntimeEventHistory):
        model.objects.filter(ocr_job_id=old_id).update(ocr_job_id=new_id)
    ProductionRecord.objects.filter(notes=ocr_import_notes(old_id)).update(
        notes=ocr_import_notes(new_id),
        ocr_job_id=new_id,
    )
    ProductionRecord.objects.filter(notes=f'OCR downtime import from {old_id}').update(
        notes=ocr_import_notes(new_id),
        ocr_job_id=new_id,
    )


def list_jobs() -> list[dict]:
    from ocr.models import OcrJobRecord

    records = list(OcrJobRecord.objects.all())
    jobs = [dict(record.metadata) for record in records if record.metadata]
    if jobs and len(jobs) == len(records):
        jobs.sort(key=lambda m: m.get("created_at") or "", reverse=True)
        return jobs

    # One-time compatibility import for jobs created before metadata was cached in DB.
    jobs = []
    store = get_store()
    for job_id in store.list_job_ids():
        try:
            meta = store.get_json(f"jobs/{job_id}/meta.json")
        except (OSError, ValueError, json.JSONDecodeError):
            continue
        meta["id"] = job_id
        job_dir = JOBS_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        write_meta(job_dir, meta)
        _sync_db_record(job_dir, meta)
        jobs.append(meta)
    jobs.sort(key=lambda m: m.get("created_at") or "", reverse=True)
    return jobs


def get_job_dir(job_id: str) -> Path:
    safe = resolve_job_id(job_id)
    path = (JOBS_DIR / safe).resolve()
    if path.parent != JOBS_DIR.resolve():
        raise FileNotFoundError(job_id)
    get_store().download_prefix(_job_prefix(safe), path)
    return path


def get_job_meta(job_id: str) -> dict:
    from ocr.models import OcrJobRecord

    safe = resolve_job_id(job_id)
    record = OcrJobRecord.objects.filter(folder_name=safe).first()
    if record and record.metadata:
        return {**record.metadata, 'id': safe}
    meta = get_store().get_json(f"jobs/{safe}/meta.json")
    meta['id'] = safe
    path = JOBS_DIR / safe
    path.mkdir(parents=True, exist_ok=True)
    write_meta(path, meta)
    _sync_db_record(path, meta)
    return meta


def create_job(
    original_filename: str,
    *,
    source_key: str,
    source_sha256: str,
    source_page_count: int,
    convert_mode: str = DEFAULT_CONVERT_MODE,
    extraction_mode: str = DEFAULT_EXTRACTION_MODE,
    page: int | None = None,
    upload_id: str | None = None,
    request_id: str | None = None,
    job_id: str | None = None,
) -> dict:
    convert_mode = normalize_convert_mode(convert_mode)
    extraction_mode = normalize_extraction_mode(extraction_mode)
    store = get_store()
    with _lock:
        job_id = job_id or random_job_name()
        if request_id:
            from ocr.models import OcrJobRecord

            record = OcrJobRecord.objects.filter(folder_name=job_id).first()
            if record and record.metadata:
                existing = {**record.metadata, "id": job_id}
                if existing.get("request_id") != request_id:
                    raise ValueError("OCR request ID conflicts with an existing job")
                return existing
        while not request_id and store.exists(f"jobs/{job_id}/meta.json"):
            job_id = random_job_name()
        job_dir = JOBS_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

    label = original_filename
    if page is not None:
        label = f"{original_filename} (p{page})"

    meta = {
        "id": job_id,
        "name": job_id,
        "status": "queued",
        "stage": "queued",
        "original_filename": label,
        "source_filename": original_filename,
        "page": page,
        "upload_id": upload_id,
        "request_id": request_id,
        "source_key": source_key,
        "source_sha256": source_sha256,
        "source_page_count": source_page_count,
        "has_pdf": True,
        "pdf_page": page or 1,
        "convert_mode": convert_mode,
        "extraction_mode": extraction_mode,
        "created_at": _utc_now(),
        "started_at": None,
        "finished_at": None,
        "duration_seconds": None,
        "updated_at": _utc_now(),
        "error": None,
        "header": None,
        "checkpoint_id": None,
        "cost_cents": None,
        "cost_breakdown": None,
        "has_extract_png": False,
        "has_merged_json": False,
    }
    write_meta(job_dir, meta)
    created = store.put_json_if_absent(f"jobs/{job_id}/meta.json", meta)
    if not created:
        existing = store.get_json(f"jobs/{job_id}/meta.json")
        if request_id and existing.get("request_id") != request_id:
            raise ValueError("OCR request ID conflicts with an existing job")
        existing["id"] = job_id
        write_meta(job_dir, existing)
        _sync_db_record(job_dir, existing)
        return existing
    _sync_db_record(job_dir, meta)
    return meta


def _update(job_dir: Path, **fields) -> dict:
    with _lock:
        meta = read_meta(job_dir)
        meta.update(fields)
        write_meta(job_dir, meta)
        if meta.get('status') in {'done', 'failed'}:
            _sync_meta(job_dir)
        _sync_db_record(job_dir, meta)
        return meta


def _rename_job_folder(job_dir: Path, display_name: str) -> Path:
    """Keep the immutable job id; the extracted name is display metadata only."""
    return job_dir


def _materialize_input_pdf(job_dir: Path, meta: dict) -> Path:
    """Create the disposable one-page OCR input from the durable source PDF."""
    input_pdf = job_dir / 'input.pdf'
    if input_pdf.is_file():
        return input_pdf

    source_key = meta.get('source_key')
    if not source_key:
        raise FileNotFoundError(f"No PDF source is available for {job_dir.name}")

    source_pdf = job_dir / 'source.pdf'
    get_store().download_file(str(source_key), source_pdf)
    page = int(meta.get('page') or 1)
    page_count = int(meta.get('source_page_count') or 1)
    if page == 1 and page_count == 1:
        shutil.copyfile(source_pdf, input_pdf)
    else:
        from ocr.pipeline.uploads import extract_pdf_page

        extract_pdf_page(source_pdf, page, input_pdf)
    source_pdf.unlink(missing_ok=True)
    return input_pdf


def run_job(job_id: str) -> None:
    job_dir = get_job_dir(job_id)
    try:
        api_key = require_api_key(settings.BASE_DIR)
        meta0 = read_meta(job_dir)
        pdf_path = _materialize_input_pdf(job_dir, meta0)
        convert_mode = normalize_convert_mode(meta0.get("convert_mode"))
        extraction_mode = normalize_extraction_mode(meta0.get("extraction_mode"))
        started_at = meta0.get("started_at") or _utc_now()

        _update(
            job_dir,
            status="running",
            stage="converting",
            error=None,
            started_at=started_at,
            convert_mode=convert_mode,
            extraction_mode=extraction_mode,
        )

        convert_raw = job_dir / "12_convert_result_raw.json"
        if convert_raw.is_file():
            convert_result = json.loads(convert_raw.read_text(encoding="utf-8"))
            checkpoint_id = convert_result.get("checkpoint_id") or meta0.get("checkpoint_id")
            if not checkpoint_id:
                raise SystemExit("Cached convert result has no checkpoint_id")
            convert_cost = (convert_result.get("cost_breakdown") or {}).get(
                "final_cost_cents"
            )
            _update(
                job_dir,
                checkpoint_id=checkpoint_id,
                stage="extracting_downtime",
                datalab=_datalab_refs_from_disk(job_dir),
            )
        else:
            _update(job_dir, stage="converting")
            convert_result = run_convert(
                pdf_path,
                api_key,
                job_dir,
                cheap=True,
                mime="application/pdf",
                mode=convert_mode,
                on_artifact=lambda path: _sync_artifact(job_dir, path),
            )
            checkpoint_id = convert_result["checkpoint_id"]
            convert_cost = (convert_result.get("cost_breakdown") or {}).get(
                "final_cost_cents"
            )
            _update(
                job_dir,
                checkpoint_id=checkpoint_id,
                stage="extracting_downtime",
                datalab=_datalab_refs_from_disk(job_dir),
            )

        dt_raw = job_dir / "22_downtime_extract_result_raw.json"
        if dt_raw.is_file():
            dt_result = json.loads(dt_raw.read_text(encoding="utf-8"))
        else:
            dt_result = run_extract(
                checkpoint_id,
                DOWNTIME_SCHEMA,
                api_key,
                job_dir,
                tag="downtime",
                extraction_mode=extraction_mode,
                on_artifact=lambda path: _sync_artifact(job_dir, path),
            )
        _update(
            job_dir,
            stage="extracting_rejects",
            datalab=_datalab_refs_from_disk(job_dir),
        )

        rj_raw = job_dir / "22_rejects_extract_result_raw.json"
        if rj_raw.is_file():
            rj_result = json.loads(rj_raw.read_text(encoding="utf-8"))
        else:
            rj_result = run_extract(
                checkpoint_id,
                REJECTS_SCHEMA,
                api_key,
                job_dir,
                tag="rejects",
                extraction_mode=extraction_mode,
                on_artifact=lambda path: _sync_artifact(job_dir, path),
            )
        _update(job_dir, datalab=_datalab_refs_from_disk(job_dir))

        _write_merged_and_finish(
            job_dir,
            dt_result=dt_result,
            rj_result=rj_result,
            convert_cost=convert_cost,
            started_at=started_at,
        )
    except SystemExit as e:
        _fail(job_dir if job_dir.exists() else JOBS_DIR / job_id, str(e))
    except Exception as e:
        _fail(
            job_dir if job_dir.exists() else JOBS_DIR / job_id,
            f"{e}\n{traceback.format_exc()}",
        )


def _datalab_refs_from_disk(job_dir: Path) -> dict:
    """Collect request_id / check URLs from submit artifacts for later resume."""
    refs: dict = {}
    convert = _read_json_file(job_dir / "11_convert_submit.json")
    if convert:
        refs["convert"] = {
            "request_id": convert.get("request_id"),
            "request_check_url": convert.get("request_check_url"),
        }
    for tag in ("downtime", "rejects"):
        submit = _read_json_file(job_dir / f"21_{tag}_extract_submit.json")
        if submit:
            refs[tag] = {
                "request_id": submit.get("request_id"),
                "request_check_url": submit.get("request_check_url"),
            }
    return refs


def _read_json_file(path: Path) -> dict | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _write_merged_and_finish(
    job_dir: Path,
    *,
    dt_result: dict,
    rj_result: dict,
    convert_cost,
    started_at: str | None,
) -> Path:
    downtime = clean(parse_extraction(dt_result) or {})
    rejects = clean(parse_extraction(rj_result) or {})
    merged = normalize_merged(
        {
            "header": downtime.get("header"),
            "shifts": downtime.get("shifts"),
            "rejects": rejects.get("rejects"),
            "total_rejects": rejects.get("total_rejects"),
            "machine_counter": rejects.get("machine_counter"),
        }
    )
    merged_path = job_dir / "extract_merged_clean.json"
    merged_path.write_text(
        json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    _sync_artifact(job_dir, merged_path)

    dt_cost = (dt_result.get("cost_breakdown") or {}).get("final_cost_cents")
    rj_cost = (rj_result.get("cost_breakdown") or {}).get("final_cost_cents")
    cost_breakdown = {
        "convert_cents": _cost_float(convert_cost),
        "downtime_extract_cents": _cost_float(dt_cost),
        "rejects_extract_cents": _cost_float(rj_cost),
    }
    total_cost = sum(cost_breakdown.values())
    finished_at = _utc_now()
    duration = _elapsed_seconds(started_at, finished_at)

    header = merged.get("header") or {}
    display = display_name_from_header(header)
    _update(
        job_dir,
        name=display,
        header=header,
        has_merged_json=True,
        cost_cents=total_cost,
        cost_breakdown=cost_breakdown,
        convert_cost_cents=cost_breakdown["convert_cents"],
        downtime_cost_cents=cost_breakdown["downtime_extract_cents"],
        rejects_cost_cents=cost_breakdown["rejects_extract_cents"],
        finished_at=finished_at,
        duration_seconds=duration,
        status="renaming",
        stage="renaming",
        datalab=_datalab_refs_from_disk(job_dir),
    )

    new_dir = _rename_job_folder(job_dir, display)
    return _update(
        new_dir,
        id=new_dir.name,
        name=display,
        status="done",
        stage="done",
        finished_at=finished_at,
        duration_seconds=duration,
        cost_cents=total_cost,
        cost_breakdown=cost_breakdown,
        has_pdf=True,
        pdf_page=int(read_meta(new_dir).get('page') or 1),
        has_merged_json=(new_dir / "extract_merged_clean.json").is_file(),
    )


def _fail(job_dir: Path, message: str) -> None:
    try:
        if not job_dir.is_dir():
            return
        meta = read_meta(job_dir)
        finished_at = _utc_now()
        duration = _elapsed_seconds(meta.get("started_at") or meta.get("created_at"), finished_at)
        _update(
            job_dir,
            status="failed",
            stage="failed",
            error=message[:4000],
            finished_at=finished_at,
            duration_seconds=duration,
        )
    except Exception:
        pass


def _save_convert_result_files(job_dir: Path, result: dict) -> None:
    raw_path = job_dir / "12_convert_result_raw.json"
    raw_path.write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    _sync_artifact(job_dir, raw_path)
    if result.get("markdown"):
        markdown_path = job_dir / "convert_result.md"
        markdown_path.write_text(result["markdown"], encoding="utf-8")
        _sync_artifact(job_dir, markdown_path)
    if result.get("html"):
        html_path = job_dir / "convert_result.html"
        html_path.write_text(result["html"], encoding="utf-8")
        _sync_artifact(job_dir, html_path)
    if result.get("json") is not None:
        json_path = job_dir / "convert_result.json"
        json_path.write_text(
            json.dumps(result["json"], indent=2, ensure_ascii=False), encoding="utf-8"
        )
        _sync_artifact(job_dir, json_path)


def _save_extract_result_files(job_dir: Path, tag: str, result: dict) -> None:
    raw_path = job_dir / f"22_{tag}_extract_result_raw.json"
    raw_path.write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    _sync_artifact(job_dir, raw_path)
    extracted = parse_extraction(result)
    if extracted is not None:
        extracted_path = job_dir / f"extract_{tag}.json"
        extracted_path.write_text(
            json.dumps(extracted, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        _sync_artifact(job_dir, extracted_path)
        clean_path = job_dir / f"extract_{tag}_clean.json"
        clean_path.write_text(
            json.dumps(clean(extracted), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        _sync_artifact(job_dir, clean_path)


def _finalize_from_merged_file(job_dir: Path) -> str:
    """Promote a job that already has extract_merged_clean.json to status=done."""
    path = job_dir / "extract_merged_clean.json"
    merged = normalize_merged(json.loads(path.read_text(encoding="utf-8")))
    header = merged.get("header") or {}
    display = display_name_from_header(header)
    meta = read_meta(job_dir)
    started_at = meta.get("started_at") or meta.get("created_at")
    finished_at = meta.get("finished_at") or _utc_now()
    duration = meta.get("duration_seconds")
    if duration is None:
        duration = _elapsed_seconds(started_at, finished_at)
    _update(
        job_dir,
        name=display,
        header=header,
        has_merged_json=True,
        status="renaming",
        stage="renaming",
        finished_at=finished_at,
        duration_seconds=duration,
        datalab=_datalab_refs_from_disk(job_dir),
    )
    new_dir = _rename_job_folder(job_dir, display)
    _update(
        new_dir,
        id=new_dir.name,
        name=display,
        status="done",
        stage="done",
        has_pdf=True,
        pdf_page=int(read_meta(new_dir).get('page') or 1),
        has_merged_json=True,
        finished_at=finished_at,
        duration_seconds=duration,
    )
    return new_dir.name


def _try_recover_datalab_results(job_dir: Path, api_key: str) -> list[str]:
    """Pull completed Datalab results using saved request_check_url (≈1h retention)."""
    from lib_datalab import fetch_check_once

    notes: list[str] = []
    convert_raw = job_dir / "12_convert_result_raw.json"
    if not convert_raw.is_file():
        submit = _read_json_file(job_dir / "11_convert_submit.json")
        check_url = (submit or {}).get("request_check_url")
        if check_url:
            data, err = fetch_check_once(check_url, api_key)
            if err:
                notes.append(f"convert: {err}")
            elif data and data.get("status") == "complete" and data.get("success"):
                _save_convert_result_files(job_dir, data)
                notes.append("recovered convert from Datalab")
            elif data and data.get("status") == "processing":
                notes.append("convert still processing on Datalab")
            elif data:
                notes.append(f"convert status={data.get('status')}")

    for tag in ("downtime", "rejects"):
        raw_path = job_dir / f"22_{tag}_extract_result_raw.json"
        if raw_path.is_file():
            continue
        submit = _read_json_file(job_dir / f"21_{tag}_extract_submit.json")
        check_url = (submit or {}).get("request_check_url")
        if not check_url:
            continue
        data, err = fetch_check_once(check_url, api_key)
        if err:
            notes.append(f"{tag}: {err}")
        elif data and data.get("status") == "complete" and data.get("success"):
            _save_extract_result_files(job_dir, tag, data)
            notes.append(f"recovered {tag} extract from Datalab")
        elif data and data.get("status") == "processing":
            notes.append(f"{tag} still processing on Datalab")
        elif data:
            notes.append(f"{tag} status={data.get('status')}")
    return notes


def _merge_extracts_on_disk(job_dir: Path) -> bool:
    """If both extract results exist but merged JSON does not, finish the job."""
    if (job_dir / "extract_merged_clean.json").is_file():
        return False
    dt_raw = _read_json_file(job_dir / "22_downtime_extract_result_raw.json")
    rj_raw = _read_json_file(job_dir / "22_rejects_extract_result_raw.json")
    if not dt_raw or not rj_raw:
        return False
    convert_raw = _read_json_file(job_dir / "12_convert_result_raw.json") or {}
    meta = read_meta(job_dir)
    _write_merged_and_finish(
        job_dir,
        dt_result=dt_raw,
        rj_result=rj_raw,
        convert_cost=(convert_raw.get("cost_breakdown") or {}).get("final_cost_cents"),
        started_at=meta.get("started_at") or meta.get("created_at"),
    )
    return True


def _job_looks_incomplete(meta: dict, job_dir: Path) -> bool:
    status = meta.get("status")
    if status in ("done", "failed"):
        return False
    if (job_dir / "extract_merged_clean.json").is_file():
        return True  # should be finalized
    return status in ("queued", "running", "renaming", "converting") or bool(status)


def reconcile_jobs(*, fetch_datalab: bool = True, requeue: bool = True) -> dict:
    """Run at most one reconciliation per process to avoid duplicate remote checks."""
    if not _reconcile_lock.acquire(blocking=False):
        return {
            "synced": 0,
            "healed": [],
            "datalab": [],
            "requeued": [],
            "errors": [],
            "in_progress": 0,
            "ready": 0,
            "skipped": True,
        }
    try:
        return _reconcile_jobs(fetch_datalab=fetch_datalab, requeue=requeue)
    finally:
        _reconcile_lock.release()


def _reconcile_jobs(*, fetch_datalab: bool = True, requeue: bool = True) -> dict:
    """Sync DB, heal crash leftovers, optionally re-fetch Datalab, requeue stuck jobs.

    Datalab keeps completed results for about one hour — after that, only local
    artifacts can be recovered (or the PDF must be re-submitted).
    """
    summary: dict = {
        "synced": 0,
        "healed": [],
        "datalab": [],
        "requeued": [],
        "errors": [],
        "in_progress": 0,
        "ready": 0,
    }
    api_key: str | None = None
    if fetch_datalab:
        try:
            api_key = require_api_key(settings.BASE_DIR)
        except SystemExit as e:
            summary["errors"].append(f"Datalab key: {e}")
            api_key = None

    store = get_store()
    for stored_job_id in store.list_job_ids():
        try:
            job_dir = get_job_dir(stored_job_id)
            meta = read_meta(job_dir)
        except (OSError, json.JSONDecodeError) as e:
            summary["errors"].append(f"{stored_job_id}: bad meta ({e})")
            continue

        job_id = stored_job_id
        try:
            _sync_db_record(job_dir, {**meta, "id": job_id})
            summary["synced"] += 1

            # Crash during rename / before status=done but merged JSON exists
            if (job_dir / "extract_merged_clean.json").is_file() and meta.get("status") != "done":
                new_id = _finalize_from_merged_file(job_dir)
                summary["healed"].append(f"{job_id} → {new_id} (from merged JSON)")
                job_id = new_id
                job_dir = get_job_dir(new_id)
                meta = read_meta(job_dir)

            if meta.get("status") == "done":
                if not meta.get("has_merged_json") and (job_dir / "extract_merged_clean.json").is_file():
                    _update(job_dir, has_merged_json=True)
                    summary["healed"].append(f"{job_id}: set has_merged_json")
                summary["ready"] += 1
                continue

            if meta.get("status") == "failed":
                continue

            if api_key:
                notes = _try_recover_datalab_results(job_dir, api_key)
                if notes:
                    summary["datalab"].append({"jobId": job_id, "notes": notes})
                    _update(job_dir, datalab=_datalab_refs_from_disk(job_dir))

            if _merge_extracts_on_disk(job_dir):
                # folder may have been renamed
                resolved = resolve_job_id(job_id)
                summary["healed"].append(f"{job_id} → {resolved} (merged extracts on disk)")
                summary["ready"] += 1
                continue

            job_dir = get_job_dir(job_id)
            meta = read_meta(job_dir)
            job_id = job_dir.name

            if meta.get("status") == "done":
                summary["ready"] += 1
                continue

            if _job_looks_incomplete(meta, job_dir):
                summary["in_progress"] += 1
                if requeue:
                    with _workers_lock:
                        already = job_id in _inflight_jobs
                    if not already:
                        # Resumable run_job skips stages that already have result files.
                        _update(job_dir, status="queued", stage="queued", error=None)
                        start_job_thread(job_id)
                        summary["requeued"].append(job_id)
        except Exception as e:
            summary["errors"].append(f"{job_id}: {e}")

    # Drop orphan DB rows whose folders are gone (except those that only exist as aliases)
    from ocr.models import OcrJobRecord

    for rec in list(OcrJobRecord.objects.all()):
        folder_name = rec.folder_name
        if store.exists(f"jobs/{folder_name}/meta.json"):
            continue
        try:
            get_job_dir(folder_name)
            continue
        except FileNotFoundError:
            pass
        alias_target = f"jobs/.aliases/{folder_name}"
        if store.exists(alias_target):
            try:
                target = resolve_job_id(folder_name)
                if store.exists(f"jobs/{target}/meta.json"):
                    rec.folder_name = target
                    target_dir = get_job_dir(target)
                    meta = read_meta(target_dir)
                    rec.display_name = meta.get("name") or target
                    rec.ocr_status = meta.get("status") or rec.ocr_status
                    rec.ocr_stage = meta.get("stage") or ""
                    rec.save()
                    summary["healed"].append(f"DB retarget {folder_name} → {target}")
                    continue
            except Exception:
                pass
        rec.delete()
        summary["healed"].append(f"removed orphan DB row {folder_name}")

    return summary


def start_job_thread(job_id: str) -> None:
    """Enqueue job on a small worker pool (survives UI navigation; needs server up)."""
    _ensure_workers()
    safe = Path(job_id).name
    with _workers_lock:
        if safe in _inflight_jobs:
            return
        _inflight_jobs.add(safe)
    _job_queue.put(safe)


_job_queue: queue.Queue[str] = queue.Queue()
_workers_lock = threading.Lock()
_workers_started = False
_startup_reconcile_done = False
_inflight_jobs: set[str] = set()
_MAX_WORKERS = 2


def _job_worker() -> None:
    while True:
        job_id = _job_queue.get()
        try:
            run_job(job_id)
        except Exception:
            traceback.print_exc()
        finally:
            with _workers_lock:
                _inflight_jobs.discard(job_id)
            _job_queue.task_done()


def _ensure_workers() -> None:
    global _workers_started, _startup_reconcile_done
    with _workers_lock:
        if _workers_started:
            return
        for i in range(_MAX_WORKERS):
            t = threading.Thread(
                target=_job_worker, daemon=True, name=f"ocr-worker-{i}"
            )
            t.start()
        _workers_started = True
        need_startup = not _startup_reconcile_done
        if need_startup:
            _startup_reconcile_done = True
    if need_startup:
        # Resume incomplete jobs left behind by a previous process exit.
        threading.Thread(
            target=lambda: reconcile_jobs(fetch_datalab=True, requeue=True),
            daemon=True,
            name="ocr-startup-reconcile",
        ).start()


def start_runtime() -> None:
    """Start the single-process worker pool and crash recovery from WSGI startup."""
    _ensure_workers()


def queue_depth() -> int:
    return _job_queue.qsize()


def start_jobs_from_upload(
    upload_id: str,
    pages: list[int],
    *,
    request_id: str,
    convert_mode: str = DEFAULT_CONVERT_MODE,
    extraction_mode: str = DEFAULT_EXTRACTION_MODE,
) -> list[dict]:
    from ocr.pipeline.uploads import (
        get_upload_dir,
        read_upload_meta,
    )

    meta = read_upload_meta(upload_id)
    request_id = str(request_id or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9._:-]{8,128}", request_id):
        raise ValueError("A valid OCR request ID is required")
    page_count = int(meta["page_count"])
    if not pages:
        raise ValueError("No pages selected")
    unique_pages = sorted({int(p) for p in pages})
    for p in unique_pages:
        if p < 1 or p > page_count:
            raise ValueError(f"Page {p} out of range 1..{page_count}")

    source_key = meta.get('source_key')
    source_sha256 = meta.get('content_sha256')
    if not source_key or not source_sha256:
        # Promote a legacy staged upload into the content-addressed source store.
        source_bytes = (get_upload_dir(upload_id) / 'source.pdf').read_bytes()
        source_sha256 = hashlib.sha256(source_bytes).hexdigest()
        source_key = f'sources/{source_sha256}.pdf'
        get_store().put_bytes_if_absent(
            source_key,
            source_bytes,
            content_type='application/pdf',
        )

    jobs: list[dict] = []
    for page in unique_pages:
        job_digest = hashlib.sha256(f"{request_id}:{page}".encode("utf-8")).hexdigest()
        job = create_job(
            meta["original_filename"],
            source_key=str(source_key),
            source_sha256=str(source_sha256),
            source_page_count=page_count,
            convert_mode=convert_mode,
            extraction_mode=extraction_mode,
            page=page,
            upload_id=upload_id,
            request_id=request_id,
            job_id=f"job-{job_digest[:16]}",
        )
        if job.get("status") not in {"done", "failed"}:
            start_job_thread(job["id"])
        jobs.append(job)
    return jobs


def load_merged(job_id: str) -> dict:
    resolved = resolve_job_id(job_id)
    try:
        value = get_store().get_json(f"jobs/{resolved}/extract_merged_clean.json")
    except FileNotFoundError as exc:
        raise FileNotFoundError("merged json not ready") from exc
    return normalize_merged(value)


def read_job_bytes(job_id: str, filename: str) -> bytes:
    safe_filename = Path(filename).name
    if safe_filename != filename:
        raise FileNotFoundError(filename)
    resolved = resolve_job_id(job_id)
    try:
        return get_store().get_bytes(f"jobs/{resolved}/{safe_filename}")
    except FileNotFoundError as exc:
        raise FileNotFoundError(filename) from exc


def read_job_pdf(job_id: str) -> tuple[bytes, int]:
    resolved = resolve_job_id(job_id)
    meta = get_job_meta(resolved)
    source_key = meta.get('source_key')
    if source_key:
        return get_store().get_bytes(str(source_key)), int(meta.get('page') or 1)
    try:
        return get_store().get_bytes(f"jobs/{resolved}/input.pdf"), 1
    except FileNotFoundError as exc:
        raise FileNotFoundError('PDF source not found') from exc


def save_merged(job_id: str, data: dict) -> dict:
    job_dir = get_job_dir(job_id)
    merged = normalize_merged(data)
    path = job_dir / "extract_merged_clean.json"
    bak = job_dir / "extract_merged_ocr.json"
    if path.is_file() and not bak.is_file():
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        _sync_artifact(job_dir, bak)
    path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding='utf-8')
    _sync_artifact(job_dir, path)

    header = merged.get("header") or {}
    display = display_name_from_header(header)
    meta = read_meta(job_dir)
    meta = _update(
        job_dir,
        has_merged_json=True,
        edited=True,
        header=header,
        name=display,
    )

    from ocr.models import OcrJobRecord
    try:
        rec = OcrJobRecord.objects.get(folder_name=job_dir.name)
        rec.merged_json_hash = OcrJobRecord.hash_merged(merged)
        if rec.import_status == OcrJobRecord.IMPORT_IMPORTED:
            rec.import_status = OcrJobRecord.IMPORT_STALE
        rec.save(update_fields=['merged_json_hash', 'import_status', 'updated_at'])
    except OcrJobRecord.DoesNotExist:
        pass

    meta["id"] = job_dir.name
    return {"merged": merged, "meta": meta}


def revert_merged(job_id: str) -> dict:
    job_dir = get_job_dir(job_id)
    bak = job_dir / 'extract_merged_ocr.json'
    path = job_dir / 'extract_merged_clean.json'
    if not bak.is_file():
        raise FileNotFoundError('No original OCR backup to revert to')
    path.write_text(bak.read_text(encoding='utf-8'), encoding='utf-8')
    merged = normalize_merged(json.loads(path.read_text(encoding='utf-8')))
    from ocr.models import OcrJobRecord
    try:
        rec = OcrJobRecord.objects.get(folder_name=job_dir.name)
        rec.mark_stale_if_imported()
    except OcrJobRecord.DoesNotExist:
        pass
    _sync_artifact(job_dir, path)
    return merged


def delete_job(job_id: str) -> None:
    real_id = resolve_job_id(job_id)
    job_dir = JOBS_DIR / real_id
    with _lock:
        store = get_store()
        try:
            meta = get_job_meta(real_id)
        except (FileNotFoundError, ValueError, json.JSONDecodeError):
            meta = {}
        source_key = str(meta.get('source_key') or '')
        upload_id = str(meta.get('upload_id') or '')

        store.delete_prefix(_job_prefix(real_id))
        shutil.rmtree(job_dir, ignore_errors=True)
        _delete_db_record(real_id)
        if upload_id:
            from ocr.models import OcrJobRecord

            upload_still_used = any(
                isinstance(metadata, dict) and metadata.get('upload_id') == upload_id
                for metadata in OcrJobRecord.objects.values_list('metadata', flat=True)
            )
            if not upload_still_used:
                store.delete_prefix(f"uploads/{Path(upload_id).name}")
                shutil.rmtree(UPLOADS_DIR / Path(upload_id).name, ignore_errors=True)
        # Drop aliases that pointed at this folder
        for alias in store.list_alias_ids():
            try:
                if store.get_text(f"jobs/.aliases/{alias}").strip() == real_id:
                    store.delete_object(f"jobs/.aliases/{alias}")
                    (ALIAS_DIR / alias).unlink(missing_ok=True)
            except OSError:
                pass
            # Also remove alias named after the request id
        request_alias = Path(job_id).name
        store.delete_object(f"jobs/.aliases/{request_alias}")
        (ALIAS_DIR / request_alias).unlink(missing_ok=True)

        if source_key.startswith('sources/') and not _source_is_referenced(source_key, store):
            store.delete_object(source_key)


def _source_is_referenced(source_key: str, store) -> bool:
    """Keep a content-addressed PDF while another job or staged upload uses it."""
    from ocr.models import OcrJobRecord

    for metadata in OcrJobRecord.objects.values_list('metadata', flat=True):
        if isinstance(metadata, dict) and metadata.get('source_key') == source_key:
            return True

    try:
        upload_meta_keys = [
            key
            for key in store.list_keys('uploads')
            if key.startswith('uploads/') and key.endswith('/meta.json')
        ]
    except Exception:
        # Retaining an unverified shared source is safer than breaking another upload.
        return True

    for key in upload_meta_keys:
        try:
            upload_meta = store.get_json(key)
        except (FileNotFoundError, ValueError, json.JSONDecodeError):
            return True
        if upload_meta.get('source_key') == source_key:
            return True
    return False
