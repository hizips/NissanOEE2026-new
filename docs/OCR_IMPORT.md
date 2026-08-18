# OCR Import

Manager-only workflow for uploading scanned daily production sheets (PDF), running
OCR extraction, reviewing/editing the spreadsheet, and importing data into the OEE
production database.

**UI:** Manager tab **OCR Import** · **API:** `/api/ocr/` · **Job files:**
`backend/ocr/data/jobs/` (gitignored at runtime)

When adding important OCR behaviour, extend this document in the same PR.

---

## Access

- Visible only to manager accounts (`admin` / `admin` in seed data).
- Operators (`operator`) receive HTTP 403 on OCR API routes.

---

## Workflow

1. **Upload PDF** — multi-page PDFs are staged; select which pages to process.
2. **OCR pipeline** (server-side, Datalab API):
   - Render page → `original.png`
   - Convert PDF → markdown checkpoint
   - Parallel extract: downtime schema + rejects/cast-quantity schema
   - Merge into `extract_merged_clean.json`
   - Rename job folder from header (see [Job naming](#job-naming))
3. **Review** — resizable split view: original scan (left) and interactive form (right). Each panel scrolls independently.
4. **Save** — persist edits to `extract_merged_clean.json`; may rename job (see below).
5. **Import** — write production records, part history (rejects), and downtime events into SQLite. Operator is always `unknown` unless overridden via API.

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

Folder slug: segments joined with `__`, sanitized (e.g. `2-10_2250_1_R24G_2`).

**Automatic rename happens:**

1. When OCR finishes (`backend/ocr/pipeline/jobs.py` — `run_job`).
2. When the user **Save**s the interactive form after editing header fields (`save_merged`). The API returns the updated job id/name; the UI refreshes history.

Old folder ids are kept as aliases in `backend/ocr/data/jobs/.aliases/` so existing links (e.g. shift record notes) still resolve.

---

## Job tracking & recovery

Jobs are listed from folders under `backend/ocr/data/jobs/` (each with `meta.json`):

| List | When it appears |
|------|-----------------|
| **In progress** | Upload/start creates `meta.json` immediately (`queued` → `running`) |
| **Ready** | Pipeline wrote `extract_merged_clean.json` and set `status=done` (not the same as imported into production) |

OCR workers are **in-process threads**. If the Django process dies mid-poll, Datalab may still finish, but the UI stays stuck until recovery.

**Refresh** (history sidebar) calls `POST /api/ocr/jobs/reconcile/`, which:

1. Syncs `OcrJobRecord` from on-disk `meta.json`
2. Finalizes jobs that already have merged/extract result files but incomplete status
3. Re-GETs saved Datalab `request_check_url`s when result files are missing (**Datalab deletes results ~1 hour after completion**)
4. Re-queues incomplete jobs; the pipeline **resumes** and skips stages that already have local results

On backend startup, the same reconcile runs once in the background.

**Re-obtain from Datalab:** Yes, via `GET /api/v1/convert|{extract}/{request_id}` using IDs stored in `11_convert_submit.json` / `21_*_extract_submit.json` (also copied into `meta.datalab` when present). After the retention window, only local files remain — re-upload the PDF to run OCR again.

---

## Import options

Checkboxes (both default **on**):

- **Rejects & production counts** — part production history + shift gross/defect/good counts
- **Downtime events** — downtime event history rows

**Batch import** — select multiple done jobs in the sidebar history, then **Batch import**.

**Mark imported / not imported** — toggle the history flag without writing production data. Click the red/green import badge in History, or use **Mark imported** / **Mark not imported** on the selected job. This only updates the job’s import status; it does not create or delete shift records.

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
replaced. Job folder renames retarget the mapping automatically.

---

## History sidebar badges

For each job:

| Badge | Meaning |
|-------|---------|
| **Done** (green) | OCR pipeline finished successfully |
| **Imported** (green) | Imported into production DB and merge hash matches |
| **Not imported** (red) | Done but never imported |
| **Stale — re-import** (orange) | Imported, then merge was edited; re-import recommended |

Cost is **not** shown in history; duration/cost/convert/extract appear on the selected job toolbar above **Save / Revert / Import**.

---

## Shift Records integration

Imported production records get `notes`: `OCR import from {job_folder}`.

On **Shift Records**:

- **OCR Imported** badge on matching rows
- **View scan** opens a sticky side panel with `original.png`; shift records keep normal page scroll

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
| `backend/ocr/models.py` | `OcrJobRecord` — import status, merge hash |
| `backend/ocr/pipeline/jobs.py` | Job CRUD, pipeline, save/rename |
| `backend/ocr/views.py` | REST endpoints |
| `backend/production/ocr_import_service.py` | DB import logic |
| `backend/production/ocr_import_utils.py` | Date parsing, shift mapping |

**Env:** `DATALAB_API_KEY` in `backend/.env` (required for live OCR).

---

## API (summary)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ocr/jobs/` | List jobs |
| GET | `/api/ocr/jobs/{id}/` | Job detail |
| PUT | `/api/ocr/jobs/{id}/merged.json` | Save merged JSON (+ rename) |
| POST | `/api/ocr/jobs/{id}/import/` | Import to production |
| PATCH | `/api/ocr/jobs/{id}/import-status/` | Mark imported / not imported |
| POST | `/api/ocr/jobs/reconcile/` | Heal stuck jobs; optional Datalab re-fetch; return updated list |
| POST | `/api/ocr/jobs/batch-import/` | Batch import |
| GET | `/api/ocr/jobs/{id}/original.png` | Original scan image |

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
| 2026-08 | Refresh app and OCR history from the database on every tab change |
| 2026-08 | Canonical machine names `aaa#bbb` after OCR extraction |
| 2026-08 | Re-import updates mapped shift records for the same OCR job |
| 2026-08 | Delete/Backspace clears selected spreadsheet cells |
| 2026-08 | Date cell year moves into the year dropdown |
| 2026-08 | Skip empty shifts (no NG and no downtime); NG counts from per-shift reason columns only |
| 2026-08 | OCR reconcile/refresh: resume stuck jobs from disk + Datalab check URLs (~1h) |
