# OCR Import

Manager-only workflow for uploading scanned daily production sheets (PDF), running
OCR extraction, reviewing/editing the spreadsheet, and importing data into the OEE
production database.

**UI:** Manager tab **OCR Import** · **API:** `/api/ocr/` · **Durable job files:**
private S3 bucket under `OCR_S3_PREFIX/jobs/` in local development and AWS
(`dev/ocr` locally and `prod/ocr` in AWS)

Existing developer checkouts may keep the legacy local prefix `ocr` so their
test history remains readable. Production must use `prod/ocr`; the two runtimes
must never use the same prefix.

When adding important OCR behaviour, extend this document in the same PR.

---

## Access

- Visible only to manager accounts (`admin` / `admin` in seed data).
- Operators (`operator`) receive HTTP 403 on OCR API routes.

---

## Workflow

1. **Upload PDF** — multi-page PDFs are content-addressed by SHA-256; uploading the same bytes reuses the existing S3 source object. The browser opens the unchanged local PDF in its built-in PDF viewer and shows page-selection controls beside it.
2. **Start once** — the browser creates one stable `requestId` for the staged
   selection and disables **Start OCR** while submitting. The backend derives a
   deterministic job id for each selected page, so a retry returns the existing
   jobs instead of creating another paid Datalab run.
3. **OCR pipeline** (server-side, Datalab API):
   - Materialize the selected page in disposable local scratch
   - Convert PDF → markdown checkpoint
   - Parallel extract: downtime schema + rejects/cast-quantity schema
   - Merge into `extract_merged_clean.json`
4. **Review** — resizable split view: the browser's built-in PDF viewer displays the unchanged source PDF (left), including its native text, image, form, and annotation layers. The interactive form appears on the right. PDF scrolling and zoom are handled by the native viewer.
5. **Save** — persist edits to `extract_merged_clean.json` under the stable job id.
6. **Import** — write production records, part history (rejects), and downtime events into the application database. Operator is always `unknown` unless overridden via API.

---

## Interactive form editor

Port of the Surya spreadsheet UI (`frontend/src/components/ocr/OcrSheetEditor.tsx`).

| Capability | Detail |
|------------|--------|
| Edit cells | Double-click; Enter to commit, Escape to cancel |
| Select / move | Drag to marquee-select; drag selection to move values within the same table/grid |
| Sections | Header, downtime (3 shifts × 10 rows), rejects, cast quantity / machine counter |
| Year dropdown | Next to **Date**. If OCR date includes a year (`1/5/25`, `9-5-25`), that year is selected and stripped from the date cell. Default **2025** when no year is present. Stored as `header.year`. |
| Delete cells | Select one or more cells, then press Delete or Backspace to clear them |
| Revert | Restores `extract_merged_ocr.json` backup (first OCR merge only) |

---

## Job naming

Display name format:

```text
{date} - {machine} - {product} - {die_number}
```

Job ids remain immutable (`job-xxxxxx`). The extracted date, machine, product, and die are stored as the display name. Keeping the S3 prefix stable avoids copy/delete renames, duplicate versions, and broken links. Legacy aliases remain readable.

---

## Job tracking & recovery

Jobs are listed from `OcrJobRecord.metadata` in the application database. S3 keeps compact recovery checkpoints and immutable OCR artifacts:

| List | When it appears |
|------|-----------------|
| **In progress** | Upload/start creates the S3 `meta.json` checkpoint immediately; running status updates stay in `OcrJobRecord.metadata` |
| **Ready** | Pipeline wrote `extract_merged_clean.json` and set `status=done` (not the same as imported into production) |

OCR workers are **in-process threads**. If the Django process dies mid-poll, Datalab may still finish, but the UI stays stuck until recovery.

**Refresh** (history sidebar) calls `POST /api/ocr/jobs/reconcile/`, which:

1. Syncs `OcrJobRecord` from S3 `meta.json` checkpoints when required
2. Finalizes jobs that already have merged/extract result files but incomplete status
3. Re-GETs saved Datalab `request_check_url`s when result files are missing (**Datalab deletes results ~1 hour after completion**)
4. Re-queues incomplete jobs; the pipeline **resumes** and skips stages that
   already have local results. If a Datalab submission response was saved but
   its final result was not, the worker polls that saved `request_check_url`
   instead of sending another POST.

On backend startup, the same reconcile runs once in the background.

Normal three-second UI polling reads job metadata from the database. It sends
one request per interval: selected in-progress job detail, otherwise the job
list. Reconciliation and Datalab checks run only at backend startup or when the
manager explicitly selects **Refresh**. Concurrent reconciliation calls in the
same backend process are coalesced.

**Re-obtain from Datalab:** Yes, via `GET /api/v1/convert|{extract}/{request_id}` using IDs stored in `11_convert_submit.json` / `21_*_extract_submit.json` (also copied into `meta.datalab` when present). After the retention window, only local files remain — re-upload the PDF to run OCR again.

---

## Import options

Checkboxes (both default **on**):

- **Rejects & production counts** — part production history + shift gross/defect/good counts
- **Downtime events** — downtime event history rows

**Batch import** — select multiple done jobs in the sidebar history, then **Batch import**.

**Mark imported / not imported** — toggle the history flag without writing production data. Click the red/green import badge in History, or use **Mark imported** / **Mark not imported** on the selected job. This only updates the job’s import status; it does not create or delete shift records.

**Delete scan job** — the selected-job toolbar opens a confirmation dialog before
deleting the OCR database row, S3 job artifacts, extracted data, local scratch,
and aliases. Its content-addressed source PDF is deleted only when no other job
or staged upload references it. Production data already imported from that job
is deliberately retained.

---

## Machine matching

After OCR extraction (and on save/import), machine names matching **digits + symbol + digits**
are rewritten to `aaa#bbb`. Examples: `2250-1`, `2250 #1`, `2250.1` → `2250#1`.

Import then matches an existing machine by that canonical key (ignoring leftover spaces/case).
A new machine is created only when no match exists, and it is stored as `2250#1`.

---

## Import rules

- **Per-shift NG only.** Part history and `defect_count` come from that shift’s reason columns (`n_s` / `d_s` / `a_s`). The form **Total** column and the Total Rejects checksum row are not used as a shift’s NG count (OCR often writes the day total there).
- **Empty shifts are skipped.** A shift is imported only if it has NG counts in the reason columns **or** importable downtime (reason + timing). Counter-only shifts and Total Rejects-only cells are ignored.
- Re-import deletes leftover empty mapped shifts for that OCR job.

---

## Shift record mapping

Each imported production record, reject row, and downtime event stores `ocr_job_id`
(the OCR job folder). Notes stay `OCR import from {job_id}` for the Shift Records
**View scan** button.

On **re-import**, the importer looks up records by that job id (including rename aliases)
and **updates the same shift rows** — even if date or machine on the sheet changed —
instead of creating a second set. Child OCR reject/downtime rows for that job are
replaced. Legacy job aliases remain valid for records imported before stable ids.

---

## History sidebar badges

For each job:

| Badge | Meaning |
|-------|---------|
| **Imported** (green) | Imported into production DB and merge hash matches |
| **Not imported** (red) | Done but never imported |
| **Stale — re-import** (orange) | Imported, then merge was edited; re-import recommended |

Cost is **not** shown in history; duration/cost/convert/extract appear on the selected job toolbar above **Save / Revert / Import**.

---

## Shift Records integration

Imported production records get `notes`: `OCR import from {job_id}`.

On **Shift Records**:

- **OCR Imported** badge on matching rows
- **View scan** opens a sticky side panel containing the browser's built-in PDF viewer at the linked source page; shift records keep normal page scroll

Parse job id from notes: `frontend/src/utils/ocrRecordUtils.ts`.

---

## Legacy jobs

Copy pre-existing Surya OCR jobs into this repo:

```bash
cd backend
.venv/bin/python manage.py import_legacy_ocr_jobs
# optional: --source /path/to/surya/data/jobs --dry-run
```

---

## Backend layout

| Path | Role |
|------|------|
| `backend/ocr/models.py` | `OcrJobRecord` — cached job metadata, import status, merge hash |
| `backend/ocr/pipeline/jobs.py` | Job CRUD, pipeline, artifact sync, save |
| `backend/ocr/views.py` | REST endpoints |
| `backend/production/ocr_import_service.py` | DB import logic |
| `backend/production/ocr_import_utils.py` | Date parsing, shift mapping |

**Env:** `DATALAB_API_KEY` in `backend/.env` (required for live OCR).

## AWS deployment

The AWS deployment includes the complete OCR UI, API, import service, and scan
preview. `scripts/build-aws.sh` sets `VITE_ENABLE_OCR=true`; the backend bundle
includes the `ocr` application, and a prebuild hook installs Poppler for page
counting and selected-page extraction. The unchanged source PDF is displayed by
the browser's built-in PDF viewer; the frontend does not rasterize it to canvas
or PNG.

`DATALAB_API_KEY` is injected from AWS Secrets Manager. Source PDFs are stored
once under `OCR_S3_PREFIX/sources/{sha256}.pdf`; jobs reference the source and
page number. OCR checkpoints and results live under `OCR_S3_PREFIX/jobs/`.
Only changed artifacts are uploaded. The pipeline uses a disposable local
scratch directory while Poppler and Datalab processing need file paths.

The current queue uses in-process threads. AWS therefore runs one Gunicorn
process on one Elastic Beanstalk instance behind a load balancer (minimum 1,
maximum 1). Before enabling horizontal scaling,
move queue ownership to an external worker queue such as SQS. Database migration
starts with a clean OCR queue: queued/running/renaming jobs are not migrated.

---

## API (summary)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ocr/jobs/` | List jobs |
| POST | `/api/ocr/jobs/start/` | Idempotently create selected-page jobs using `requestId` |
| GET | `/api/ocr/jobs/{id}/` | Job detail |
| PUT | `/api/ocr/jobs/{id}/merged.json` | Save merged JSON (+ rename) |
| POST | `/api/ocr/jobs/{id}/import/` | Import to production |
| PATCH | `/api/ocr/jobs/{id}/import-status/` | Mark imported / not imported |
| POST | `/api/ocr/jobs/reconcile/` | Heal stuck jobs; optional Datalab re-fetch; return updated list |
| POST | `/api/ocr/jobs/batch-import/` | Batch import |
| GET | `/api/ocr/jobs/{id}/source.pdf` | Durable source PDF used by browser preview |

---

## Changelog (features)

| Date | Feature |
|------|---------|
| 2026-08 | In-repo OCR tab, pipeline, interactive editor |
| 2026-08 | Resizable scan/form split; independent panel scroll |
| 2026-08 | Year dropdown on date field (default 2025) |
| 2026-08 | History: Done + Imported/Not imported badges |
| 2026-08 | Save renames job folder from edited header |
| 2026-08 | Shift Records: View scan side panel |
| 2026-08 | `import_legacy_ocr_jobs` management command |
| 2026-08 | Cost/duration stats on job toolbar only (not history list); transparent page layout |
| 2026-08 | App layout: slate page background, white cards; stronger main tab active indicator |
| 2026-08 | Session re-auth dialog on 401 — retry API calls without page refresh |
| 2026-08 | Import matches machines ignoring extra/missing spaces |
| 2026-08 | Manually mark OCR history as imported or not imported |
| 2026-08 | Strip spaces from machine names on OCR scan/save/import |
| 2026-10 | Browser PDF rendering; content-addressed source deduplication; selective S3 artifact sync; DB-backed job polling |
| 2026-10 | Original PDF preview switched from PDF.js canvas rasterization to the browser's native PDF viewer so annotation/form appearance layers and fine writing are preserved |
| 2026-08 | Refresh app and OCR history from the database on every tab change |
| 2026-08 | Canonical machine names `aaa#bbb` after OCR extraction |
| 2026-08 | Re-import updates mapped shift records for the same OCR job |
| 2026-08 | Delete/Backspace clears selected spreadsheet cells |
| 2026-08 | Date cell year moves into the year dropdown |
| 2026-08 | Skip empty shifts (no NG and no downtime); NG counts from per-shift reason columns only |
| 2026-08 | OCR reconcile/refresh: resume stuck jobs from disk + Datalab check URLs (~1h) |
| 2026-10 | OCR durable storage moved from local/EFS paths to private S3; Poppler uses disposable scratch files |
| 2026-10 | Idempotent OCR start IDs, disabled submit button, saved Datalab submission resume, single-request UI polling, and environment-separated `dev/ocr` / `prod/ocr` prefixes |
