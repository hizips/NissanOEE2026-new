# Nissan OEE Local Development Guide

This file is a handover for another chat or developer working on the project locally. It describes how to run the application on this Mac and safely inspect or edit the local SQLite database.

## Read this first

- Repository: `/Users/jiashunqiu/nissan2`
- Project instructions: read `AGENTS.md` before making changes.
- Backend: Django 6 and Django REST Framework.
- Frontend: React 18, TypeScript, and Vite.
- Local database: `/Users/jiashunqiu/nissan2/backend/db.sqlite3`.
- Production database: Amazon RDS MySQL. Do not connect local maintenance commands to RDS unless the user explicitly requests it.
- OCR document storage: S3 in both local and production environments. The SQLite database stores OCR job metadata, not PDF contents.
- The working tree contains user changes. Inspect `git status` before editing and never reset, replace, or discard unrelated changes.
- `backend/db.sqlite3` is tracked by Git and currently contains local data. Treat changes to it as user data, not disposable build output.

## Local architecture

```text
Browser
  |
  | http://localhost:5173
  v
Vite React frontend
  |
  | http://localhost:8000/api
  v
Django REST API
  |                         |
  | local application data | OCR PDFs/results
  v                         v
backend/db.sqlite3          private S3 bucket + Datalab OCR API
```

Local development uses SQLite by default because `backend/config/settings.py` defaults `DB_ENGINE` to `sqlite`. Production requires `APP_ENV=production` and `DB_ENGINE=mysql`.

## Current toolchain on this machine

At the time this guide was written, the machine had:

- Python 3.13.9
- Node.js 25.9.0
- npm 11.12.1
- SQLite CLI 3.43.2
- Poppler 26.05.0, including `pdfinfo` and `pdfseparate`

The repository already has `backend/.venv` and `frontend/node_modules`. Check that they still exist before reinstalling anything.

## Environment files

Local Django loads both of these ignored files when `APP_ENV` is not `production`:

- `backend/.env`
- `backend/.env.s3`

The frontend loads:

- `frontend/.env`

Expected local keys are:

```dotenv
# backend/.env
DATALAB_API_KEY=...

# backend/.env.s3
AWS_REGION=ap-southeast-2
OCR_S3_BUCKET=...
OCR_S3_PREFIX=dev/ocr

# frontend/.env
VITE_API_URL=http://localhost:8000/api
```

Do not print, paste, commit, or expose the values from these files. They are ignored by Git. Boto3 uses the normal AWS credential provider chain on the machine for S3 access; do not hard-code AWS access keys in either the project or this guide.

To run without the OCR routes, set `ENABLE_OCR=false` in the backend environment. Ordinary production-data screens can still use SQLite. To exercise OCR locally, the Datalab API key, S3 bucket configuration, AWS authorization, and Poppler executables must all be available.

## First-time dependency setup

Skip this section if the existing virtual environment and `node_modules` work.

From the repository root:

```bash
cd /Users/jiashunqiu/nissan2

python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt

npm install --prefix frontend
```

Use `npm install`, not `npm ci`, for this checkout. Poppler is also required for PDF upload processing. On a new macOS setup it can normally be installed with Homebrew:

```bash
brew install poppler
```

For a fresh or empty SQLite file, apply migrations:

```bash
cd /Users/jiashunqiu/nissan2/backend
.venv/bin/python manage.py migrate
```

Do not run `seed_data` as routine setup against an existing database. Its behavior is destructive and is documented below.

## Start and stop the development application

Use the repository script from the repository root:

```bash
cd /Users/jiashunqiu/nissan2

./scripts/dev-servers.sh start
./scripts/dev-servers.sh status
./scripts/dev-servers.sh restart
./scripts/dev-servers.sh stop
```

The script starts both services and checks that their ports open:

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173/` |
| API | `http://localhost:8000/api/` |
| Django admin | `http://localhost:8000/admin/` |
| Health check | `http://localhost:8000/health/` |

The services bind to `0.0.0.0`, and the script prints a `192.168.2.x` LAN URL when one is available. The frontend automatically uses the same LAN host for the backend when opened from a LAN URL.

The runner prefers tmux. If tmux is unavailable on macOS, it uses `launchctl`; otherwise it uses tracked background processes. For tmux:

```bash
tmux attach-session -t nissanoee-backend
tmux attach-session -t nissanoee-frontend
```

Press `Ctrl-b`, then `d`, to detach without stopping a tmux service.

Manual startup is available for debugging:

```bash
cd /Users/jiashunqiu/nissan2/backend
.venv/bin/python manage.py runserver --noreload 0.0.0.0:8000
```

In another terminal:

```bash
cd /Users/jiashunqiu/nissan2/frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

The repository script is preferred because it also makes the Poppler executable directories available to Django.

## Local development login

The committed development database was originally seeded with these development-only accounts:

| Role | Username | Password |
|---|---|---|
| Manager | `admin` | `admin` |
| Operator | `operator` | `operator_password` |

If a local password has changed, do not replace the database. Reset only the intended local account:

```bash
cd /Users/jiashunqiu/nissan2/backend
.venv/bin/python manage.py changepassword admin
```

Never assume these development credentials work in AWS, and never reuse them for production.

## Verify a local change

Useful checks from the repository root are:

```bash
backend/.venv/bin/python backend/manage.py check
backend/.venv/bin/python backend/manage.py test
npm run build --prefix frontend
npm run lint --prefix frontend
curl http://localhost:8000/health/
```

The frontend lint command is known to report pre-existing application-source issues. Report whether new errors were introduced rather than claiming the repository has a clean historical lint baseline.

## Local database rules

The local SQLite database is:

```text
/Users/jiashunqiu/nissan2/backend/db.sqlite3
```

Confirm Django is targeting SQLite before editing:

```bash
cd /Users/jiashunqiu/nissan2/backend
.venv/bin/python manage.py shell -c \
  "from django.conf import settings; print(settings.DATABASES['default']['ENGINE']); print(settings.DATABASES['default']['NAME'])"
```

Expected output includes:

```text
django.db.backends.sqlite3
/Users/jiashunqiu/nissan2/backend/db.sqlite3
```

Stop immediately if it prints the MySQL backend or an RDS host. Check that `APP_ENV` is not `production` and `DB_ENGINE` is not `mysql`.

### Back up SQLite before data changes

Create a consistent backup with SQLite's backup command:

```bash
cd /Users/jiashunqiu/nissan2
mkdir -p .local-backups
sqlite3 backend/db.sqlite3 \
  ".backup '.local-backups/local-sqlite-before-edit.sqlite3'"
```

`.local-backups/` is ignored by Git. If that filename already exists, choose a new explicit filename rather than overwriting a backup. To restore, first stop both services and verify the exact source file. Restoring replaces all current local data, so do it only with explicit user approval.

### Preferred method: Django ORM

Use Django's ORM for writes. It respects model relationships and is less likely to leave inconsistent data than raw SQL.

Open a shell:

```bash
cd /Users/jiashunqiu/nissan2/backend
.venv/bin/python manage.py shell
```

Inspect records without exposing password hashes or other secrets:

```python
from production.models import Machine, Part, Operator, ProductionRecord

Machine.objects.count()
Part.objects.count()
Operator.objects.values("id", "employee_id", "name", "active").order_by("id")
Machine.objects.values("id", "machine_id", "name", "type", "status").order_by("id")
ProductionRecord.objects.values("id", "machine_id", "date", "shift").order_by("-id")[:20]
```

Create or update a machine without creating duplicates:

```python
from production.models import Machine

machine, created = Machine.objects.update_or_create(
    machine_id="LOCAL-TEST-01",
    defaults={
        "name": "Local test machine",
        "type": "casting",
        "ideal_cycle_time": 2.5,
        "default_shift_time": 480,
        "status": "idle",
        "active": True,
    },
)
print(machine.id, created)
```

Edit an existing row:

```python
machine = Machine.objects.get(machine_id="LOCAL-TEST-01")
machine.status = "running"
machine.save(update_fields=["status"])
```

Manage a many-to-many relationship:

```python
from production.models import Machine, Part

machine = Machine.objects.get(machine_id="LOCAL-TEST-01")
part = Part.objects.get(part_number="CH-001")
machine.supported_parts.add(part)
machine.supported_parts.remove(part)
```

Use a transaction for related changes:

```python
from django.db import transaction
from production.models import Machine, Operator

with transaction.atomic():
    Machine.objects.filter(machine_id="LOCAL-TEST-01").update(status="idle")
    Operator.objects.filter(employee_id="unknown").update(active=True)
```

Preview a delete before executing it:

```python
from production.models import Machine

targets = Machine.objects.filter(machine_id="LOCAL-TEST-01")
print(list(targets.values("id", "machine_id", "name")))
# Run only after confirming that this exact record should be removed:
# targets.delete()
```

Important delete behavior from the Django models:

- Deleting a machine cascades to its production records, part-production history, downtime history, scheduled downtime, and relationship rows.
- Deleting a part sets historical `part_id` values to null, while many-to-many links are removed.
- Deleting a parent downtime reason cascades to its child reason items.
- Production-history `operator_name`, `die`, and `ocr_job_id` fields are text snapshots, not foreign keys.
- Deleting an OCR database row directly does not guarantee that the related S3 objects are removed. Use the application's OCR delete endpoint/UI for complete OCR-job deletion.

### Read SQLite directly

The SQLite CLI is useful for inspection:

```bash
cd /Users/jiashunqiu/nissan2
sqlite3 backend/db.sqlite3
```

Then:

```sql
.headers on
.mode column
.tables
.schema production_machine
SELECT id, machine_id, name, type, status, active
FROM production_machine
ORDER BY id;
.quit
```

Prefer the Django ORM for writes. Raw SQLite writes bypass Django validation and signals. The SQLite CLI also does not reliably enable foreign-key enforcement by default. If a direct SQL write is genuinely required, back up first, enable foreign keys, use a transaction, and verify the affected rows before committing:

```sql
PRAGMA foreign_keys = ON;
PRAGMA foreign_keys;
BEGIN IMMEDIATE;
UPDATE production_machine
SET status = 'idle'
WHERE machine_id = 'LOCAL-TEST-01';
SELECT changes();
SELECT id, machine_id, status
FROM production_machine
WHERE machine_id = 'LOCAL-TEST-01';
COMMIT;
```

Use `ROLLBACK;` instead of `COMMIT;` if the verification is not correct.

### Change the schema

The model definitions are primarily in:

- `backend/production/models.py`
- `backend/ocr/models.py`

After intentionally editing models:

```bash
cd /Users/jiashunqiu/nissan2/backend
.venv/bin/python manage.py makemigrations
.venv/bin/python manage.py showmigrations
.venv/bin/python manage.py migrate
.venv/bin/python manage.py check
```

Review generated migration files before applying or committing them. Back up `db.sqlite3` before a non-trivial migration. A migration intended for deployment must work on both local SQLite and production MySQL.

### Seed command warning

The following command is not a harmless "add missing defaults" operation:

```bash
backend/.venv/bin/python backend/manage.py seed_data
```

It deletes all local downtime-event history, scheduled downtime, production records, part-production history, machines, and operators before recreating seed/reference data. It also creates the development login accounts when they are absent. Run it only when the user explicitly wants a local data reset and only after creating a backup.

## Database model summary

Local SQLite follows the Django models and migrations. The main application tables are:

- Reference data: `production_machine`, `production_part`, `production_die`, `production_operator`.
- Reason configuration: `production_defectreason`, `production_downtimereasonitem`, `production_processreason`.
- Operational data: `production_productionrecord`, `production_partproductionhistory`, `production_downtimeeventhistory`, `production_scheduleddowntime`.
- Relationships: `production_machine_supported_parts`, `production_part_dies`.
- OCR metadata: `ocr_ocrjobrecord`.
- Authentication/framework: `auth_*` and `django_*` tables.

See `DATABASE_STRUCTURE.md` for a detailed table and relationship explanation. That report was generated from the deployed MySQL database, while the authoritative source for local schema changes remains the Django models and migration files.

## OCR development notes

- The original PDF is uploaded to S3 and displayed by the frontend's PDF viewer.
- The application no longer depends on a server-generated preview PNG workflow.
- Poppler's `pdfinfo` and `pdfseparate` are still required for PDF validation and page handling in the OCR submission workflow.
- Datalab performs OCR; local Django orchestrates the job and stores job metadata in SQLite.
- Temporary scratch files use a temporary local directory, while durable OCR artifacts use S3.
- `OCR_S3_PREFIX=dev/ocr` keeps local-development objects separate from production objects.
- Do not point local development at the production OCR prefix.
- Do not delete OCR rows with raw SQL when S3 cleanup is expected. Use the application deletion flow.

More OCR-specific behavior is documented in `docs/OCR_IMPORT.md`.

## Safe workflow for another chat

1. Read `AGENTS.md`, this guide, and any feature-specific documentation.
2. Run `git status --short` and preserve all existing user changes.
3. Run `./scripts/dev-servers.sh status` before starting another process.
4. Confirm Django's database engine and path before any database edit.
5. Back up `backend/db.sqlite3` before writes, migrations, imports, or destructive tests.
6. Prefer Django ORM operations wrapped in `transaction.atomic()`.
7. Preview the exact rows before update or delete operations.
8. Use the app/API for OCR deletion so S3 objects and SQLite metadata stay consistent.
9. Run backend checks/tests and the frontend build after code changes.
10. Report changed files, database changes, commands run, and any verification limitations to the user.

## Troubleshooting

### Backend does not start

```bash
cd /Users/jiashunqiu/nissan2
./scripts/dev-servers.sh status
backend/.venv/bin/python backend/manage.py check
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

Check that `backend/.venv` exists and that local environment files have not set production/MySQL mode accidentally.

### Frontend does not start

```bash
cd /Users/jiashunqiu/nissan2
test -d frontend/node_modules && echo "node_modules present"
npm run build --prefix frontend
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

### OCR reports a missing `pdfseparate` or `pdfinfo`

```bash
command -v pdfinfo
command -v pdfseparate
./scripts/dev-servers.sh restart
```

Install Poppler if either executable is absent. Prefer starting through `scripts/dev-servers.sh`, which adds the detected Poppler directories to the backend process path.

### SQLite is locked

- Stop background imports or writes.
- Stop the backend before a bulk maintenance operation.
- Avoid opening multiple write transactions.
- Keep write transactions short.
- Do not delete SQLite journal or WAL files manually.

### Local changes are not visible

The backend starts with `--noreload`, so Python changes require:

```bash
./scripts/dev-servers.sh restart
```

Vite normally reloads frontend source changes automatically.
