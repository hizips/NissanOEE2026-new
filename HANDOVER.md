# Nissan OEE 2026 - Agent Handover

Last updated: 2026-10-06 (Australia/Melbourne)

This document is intended for another coding agent continuing work in this
repository. Read `AGENTS.md`, `AWS_DEPLOYMENT.md`, and `docs/OCR_IMPORT.md`
before making changes.

## Repository and current state

- Working copy: `/Users/jiashunqiu/nissan2`
- Git remote: `https://github.com/hizips/NissanOEE2026-new.git`
- Branch at handover: `main`
- Base commit at handover: `98306d22bbbbb08e69b5bc879f05d0f0f856fcdb`
- The working tree contains substantial uncommitted application, OCR, AWS, and
  local database changes. Do not reset or discard them.
- Some tracked `__pycache__` files and `backend/db.sqlite3` are modified by
  local execution. Treat them carefully and do not assume all dirty files
  should be committed.
- Local frontend: `http://localhost:5173/`
- Local backend: `http://localhost:8000/`
- Local API: `http://localhost:8000/api/`
- Seed manager login is documented in `AGENTS.md`. Do not copy credentials,
  JWTs, `.env` values, or AWS secrets into logs or commits.

## User decisions already made

- Deploy in AWS Sydney (`ap-southeast-2`).
- Start with one `t3.small` Elastic Beanstalk backend instance.
- Reuse the existing RDS instance, but create a separate database/schema and a
  separate least-privilege database user for this application.
- Do not migrate or reuse the other application's authentication database.
- Deploy the OCR application, but do not migrate in-progress OCR jobs.
- OCR durable files must use S3 only; EFS is not required.
- The browser should render source PDFs. The backend must not generate or store
  preview PNGs.
- Keep the initial OCR worker in the same backend instance. Do not scale the
  backend to multiple instances until queue ownership is moved out of process.

## Work completed

### AWS deployment readiness

- Added production-aware Django settings for MySQL/RDS, CORS, CSRF, HTTPS,
  WhiteNoise, AWS region, S3 OCR storage, and Elastic Beanstalk operation.
- Added a database-independent `GET /health/` endpoint.
- Added Elastic Beanstalk packaging/configuration:
  - `backend/Procfile`
  - `backend/.ebignore`
  - `backend/.ebextensions/01_django.config`
  - `backend/.platform/hooks/prebuild/00_install_ocr_runtime.sh`
  - `backend/.platform/hooks/prebuild/01_install_rds_ca.sh`
  - `backend/requirements.aws.txt`
- Added `scripts/build-aws.sh`, which produces:
  - `.aws-build/backend.zip`
  - `.aws-build/frontend/`
- Added `frontend/.env.aws.example` and updated `backend/.env.example` with
  non-secret configuration examples.
- Added `AWS_DEPLOYMENT.md` with the target architecture, database migration
  plan, secret handling, network requirements, build instructions, and release
  checks.
- Added `infrastructure/ocr-storage.yml` for a private, encrypted, versioned S3
  OCR bucket. The template retains the bucket on stack removal, blocks public
  access, denies non-TLS requests, aborts incomplete multipart uploads after 7
  days, expires abandoned upload metadata after 1 day, and retains only one
  noncurrent version for 7 days.
- Added `infrastructure/application.yml` for the private frontend origin,
  CloudFront staging/API proxy and frontend-only SPA route rewrite, load-balanced one-instance Beanstalk backend,
  scoped instance/service roles, dedicated security groups, RDS ingress, log
  streaming, and a health alarm.
- Added `infrastructure/ocr-audit.yml` for prefix-scoped S3 data-event auditing
  in retained KMS-encrypted CloudTrail and CloudWatch destinations.
- Fixed the Gunicorn/nginx port contract at 8000 and changed the deployment from
  SingleInstance to LoadBalanced with minimum 1 and maximum 1.
- Separated object namespaces: new local setups default to `dev/ocr`, the
  existing checkout keeps its legacy local `ocr` history, and AWS uses
  `prod/ocr`.

Important: the infrastructure template changes have not been deployed to AWS.

### S3-only OCR storage

- Added `backend/ocr/storage.py`, an explicit boto3 S3 adapter with bounded
  adaptive retries, upload/download helpers, safe object keys, prefix listing,
  batch deletion, and conditional object creation.
- OCR source PDFs are now content-addressed:

  ```text
  {dev|prod}/ocr/sources/{sha256}.pdf
  ```

- Upload IDs are deterministic:

  ```text
  upl-{full-sha256}
  ```

- The upload path hashes the PDF, counts its pages, and creates the immutable
  source object using `If-None-Match: *`. Uploading identical bytes reuses the
  existing PDF and does not create a duplicate S3 object/version.
- New jobs store `source_key`, `source_sha256`, source page count, and selected
  page. They no longer copy a PDF into every job prefix.
- For OCR processing, the backend downloads the shared source PDF into
  disposable local scratch and extracts only the selected page with
  `pdfseparate`.
- Legacy jobs that have `jobs/{id}/input.pdf` remain readable.

### Browser-rendered PDF previews

- Added `frontend/src/components/ocr/PdfDocumentViewer.tsx`, which embeds the
  unchanged PDF blob in the browser's built-in PDF viewer.
- OCR upload staging shows the complete local PDF beside compact page-selection
  controls.
- Completed OCR jobs and Shift Records use the authenticated endpoint:

  ```text
  GET /api/ocr/jobs/{id}/source.pdf
  ```

- Completed-job and Shift Records previews open at the selected source page and
  use native PDF scrolling, zoom, text, form, and annotation rendering.
- The previous PDF.js canvas renderer was removed because rasterizing only the
  page display canvas could omit writing held in form/annotation appearance
  layers. Increasing its canvas resolution could not restore those layers.
- `pdfjs-dist` was removed from the frontend dependencies, reducing the shipped
  JavaScript and eliminating the frontend PDF-to-canvas path.
- Server thumbnail generation, thumbnail storage, and the old upload PNG route
  were removed. Requests to the old PNG route now return 404.
- Active-job polling retains the already loaded PDF rather than downloading it
  again every three seconds.
- Blob URLs are revoked when previews change or close.
- The selected OCR job toolbar includes a confirmed **Delete scan job** action.
  It removes the OCR row, job artifacts, extracted data, aliases, and scratch
  files while retaining already-imported production records. A content-addressed
  source PDF is removed only when no other job or staged upload references it.
- Completed jobs no longer show a redundant `Done` status badge; their import
  status remains visible.

`pdfinfo` and `pdfseparate` are still required. `pdftoppm` remains in a legacy
standalone deskew script but is no longer part of the web preview path.

### Reduced S3 requests and versions

- Added `OcrJobRecord.metadata` as a JSON field and migration:
  `backend/ocr/migrations/0002_ocrjobrecord_metadata.py`.
- Job-list polling now reads cached job metadata from the application database
  rather than performing S3 LIST plus GET operations every three seconds.
- Job IDs remain stable (`job-xxxxxx`). Extracted date/machine/product/die are
  display metadata instead of triggering S3 prefix copy/delete renames.
- Whole-job-directory synchronization was replaced with selective writes:
  - `_sync_meta()` writes small recovery checkpoints.
  - `_sync_artifact()` writes only the changed result artifact.
- Intermediate status changes update the database. S3 job metadata is written
  at job creation and terminal states instead of every poll/stage transition.
- Datalab request, submission, and result files are uploaded individually as
  soon as they are created, using callbacks added to the OCR helper scripts.
- Source PDFs, extracted input PDFs, and obsolete original PNGs are excluded
  from per-job artifact uploads.
- Reading merged data fetches only the merged JSON object.
- Job deletion no longer downloads the entire job prefix first.
- OCR start now carries a stable client request ID and derives deterministic
  per-page job IDs. Rapid clicks and network/auth retries return the same jobs.
- The Start button is disabled while submitting.
- Saved Datalab convert/extract submissions resume by polling their existing
  check URL instead of POSTing another paid request.
- The three-second UI loop now makes one database-backed request, not a job
  detail request plus two list requests. Automatic reconcile was removed from
  React mount; startup and explicit Refresh own reconciliation.
- WSGI startup initializes the single worker pool and runs recovery once.

### Other fixes

- Fixed unauthenticated OCR API handling: missing JWT now returns HTTP 401
  rather than raising a server error.
- Improved `scripts/dev-servers.sh`:
  - Supports start, stop, restart, and status.
  - Finds the available Poppler executables.
  - Requires only `pdfinfo` and `pdfseparate` for the web OCR path.
  - Uses launchctl/tmux/background runners as available.
  - Uses a portable, port-specific `lsof` fallback on macOS so restart really
    replaces stale processes.
- Updated `docs/OCR_IMPORT.md` for the new PDF, S3, job metadata, and polling
  behavior.

## Verification completed

Backend checks passed:

```bash
cd /Users/jiashunqiu/nissan2/backend
.venv/bin/python manage.py test
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
```

Observed result: 15 tests passed, no Django system issues, and no missing
migrations.

Frontend production build passed:

```bash
cd /Users/jiashunqiu/nissan2/frontend
npm run build
```

Vite still reports the existing large main-chunk warning.

All three CloudFormation templates passed the AWS CloudFormation
`ValidateTemplate` API in `ap-southeast-2`. `cfn-lint` and `cfn-guard` are not
installed locally, so those two optional validation layers were not run.

The final packaging smoke build is at
`/private/tmp/nissan-oee-aws-build-final` for this local session. The backend
archive excludes `.env`, SQLite, virtual environments, bytecode, and scratch
data, contains the 8000-port Procfile, and includes `python-dotenv` in the AWS
requirements.

Live local smoke checks passed after a real scripted restart:

- Frontend `/`: HTTP 200
- OCR job list without authentication: HTTP 401
- Authenticated OCR job list: HTTP 200
- Existing legacy job source PDF: HTTP 200, `application/pdf`
- Old PNG preview route: HTTP 404
- Backend and frontend process IDs changed during restart, confirming that the
  script actually restarted both services.

## Current local operation

Use the repository script rather than starting processes manually:

```bash
cd /Users/jiashunqiu/nissan2
./scripts/dev-servers.sh status
./scripts/dev-servers.sh start
./scripts/dev-servers.sh restart
./scripts/dev-servers.sh stop
```

If status and actual listeners disagree, inspect ports directly:

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

The last verified state had both services running. Recheck rather than assuming
they survived a new agent/session.

## AWS information already identified

- Region: `ap-southeast-2`
- Existing RDS instance referenced in the deployment notes: `b13b-sydney`
- Target VPC referenced in the deployment notes:
  `vpc-0235f161af4c44e98`
- Existing RDS security group referenced in the deployment notes:
  `sg-0b7fe7ebc049cdc33`
- Another website already uses Elastic Beanstalk and the same RDS instance.
- The new application should get its own Beanstalk application/environment,
  database/schema, database user, frontend bucket/distribution, and OCR bucket.

Treat these identifiers as context to verify in AWS, not permission to mutate
resources. Before AWS actions, follow the AWS rules in the workspace
`AGENTS.md`. Prefer the AWS MCP server and infrastructure as code.

## Secret handling requirements

- Never read or print secret values into agent context, logs, Markdown, source
  files, or commands.
- Follow the project AWS Agent Toolkit rule: load the Secrets Manager skill
  before any secret task and use runtime resolution through `asm-exec` /
  Secrets Manager dynamic references.
- Do not call `secretsmanager get-secret-value` or
  `batch-get-secret-value`.
- Production needs separate secrets for:
  - `DJANGO_SECRET_KEY`
  - `DB_PASSWORD`
  - `DATALAB_API_KEY`
- Map secret ARNs into Elastic Beanstalk secret-backed environment variables
  and grant the instance role access only to those ARNs.

## Planned work not yet completed

### 1. Review and commit the local implementation

- Inspect the entire dirty tree and separate intended source/config changes
  from runtime artifacts such as tracked `__pycache__` files and local SQLite
  mutations.
- Do not discard `backend/db.sqlite3` automatically; it contains user-provided
  current data. Decide with the user whether its local changes belong in the
  commit or only in the database migration/export procedure.
- Re-run all checks after cleanup.
- Commit and push only after explicit user authorization.

### 2. Deploy AWS infrastructure

- Confirm AWS authentication and account/region.
- Deploy the updated `infrastructure/ocr-storage.yml`, then
  `infrastructure/ocr-audit.yml`, in `ap-southeast-2`.
- Build and upload the backend bundle, then deploy
  `infrastructure/application.yml`. This template now defines the private
  frontend bucket, CloudFront OAC/API proxy, load-balanced Beanstalk environment
  fixed at one `t3.small`, instance/service roles, security groups, RDS ingress,
  log streaming, and health alarm.
- Supply existing VPC/subnet/RDS inputs, three secret ARNs, their KMS key ARN,
  the current supported Beanstalk Python platform ARN, and the bundle location.
- Use the CloudFront output as the staging URL. Custom production DNS/ACM and
  end-to-end HTTPS to a custom backend origin remain a deliberate cutover step.

### 3. Prepare the existing RDS instance safely

- Take an RDS snapshot before schema/user changes.
- Create a separate application database/schema and least-privilege user on the
  existing instance. Do not use the existing website's schema or credentials.
- Add RDS ingress on TCP 3306 only from the new Beanstalk instance security
  group.
- Use TLS with the RDS global CA installed by the prebuild hook.
- Run migrations against the new schema and test connectivity before importing
  data.

### 4. Migrate application data

- Export only `production` data from SQLite as described in
  `AWS_DEPLOYMENT.md`.
- Keep the export outside source control because it contains operational and
  account data.
- Load it into a staging copy of the new schema first.
- Do not migrate queued/running OCR jobs.
- If historical completed OCR scans are required, migrate only completed job
  artifacts/records using the legacy import command and verify their PDF
  previews from S3.

### 5. Build, release, and verify

- Build for the same-origin CloudFront API proxy:

  ```bash
  VITE_API_URL=/api ./scripts/build-aws.sh
  ```

- Publish the backend bundle as a new Beanstalk application version.
- Sync `.aws-build/frontend/` to the private frontend bucket.
- Invalidate at least `/index.html` in CloudFront.
- Run all production checks listed in `AWS_DEPLOYMENT.md`, including a complete
  PDF upload, page selection, OCR run, browser PDF preview, edit/save, import,
  Shift Records preview, duplicate upload, and S3 object/version inspection.
- Confirm no preview PNG objects are created and repeated UI polling does not
  generate repeated S3 LIST/GET/PUT traffic.

## Known limitations and follow-up improvements

- OCR workers are in-process Django threads. The deployment now enforces one
  instance, one Gunicorn process, and AllAtOnce rollout, and start requests are
  idempotent. Before horizontal scaling or rolling/immutable deployments, move
  work ownership to SQS plus a dedicated worker or an equivalent external queue.
- Staged metadata is kept for one day so a retried idempotent start can resolve
  the same content-addressed source. Cancelling a stage or deleting the last job
  removes an unreferenced source; a later conservative scheduled garbage
  collector is still useful for abnormal termination edge cases.
- Job reconciliation still performs an S3 inventory when explicitly requested
  or during startup recovery. Normal three-second job-list polling is database
  backed.
- The backend currently streams the complete source PDF through Django for
  authenticated previews. If preview traffic becomes material, consider short
  lived presigned GET URLs or an authenticated CloudFront design, while
  preserving private storage and authorization boundaries.
- The frontend main bundle exceeds Vite's 500 kB warning threshold; broader
  application chunking remains optional follow-up work.
- The legacy standalone `backend/ocr/scripts/ocr_pipeline.py` still supports an
  optional deskew-to-PNG CLI path. The production web path uses the source PDF
  and does not create preview PNGs.
- Add a regression test for unauthenticated OCR endpoints returning 401 if one
  is not already present when continuing test work.

## High-value files for the next agent

- `AGENTS.md` - repository operation and test rules
- `AWS_DEPLOYMENT.md` - deployment architecture and runbook
- `docs/OCR_IMPORT.md` - OCR behavior and API documentation
- `infrastructure/ocr-storage.yml` - OCR S3 CloudFormation stack
- `infrastructure/ocr-audit.yml` - scoped S3 data-event audit trail
- `infrastructure/application.yml` - frontend, CloudFront, Beanstalk, IAM,
  networking, RDS ingress, logs, and alarm
- `backend/config/settings.py` - local/AWS settings and RDS configuration
- `backend/ocr/storage.py` - S3 storage adapter
- `backend/ocr/pipeline/uploads.py` - content-addressed upload flow
- `backend/ocr/pipeline/jobs.py` - jobs, DB metadata cache, recovery, selective
  S3 synchronization
- `backend/ocr/views.py` and `backend/ocr/urls.py` - OCR REST endpoints
- `frontend/src/components/ocr/PdfDocumentViewer.tsx` - native browser PDF viewer wrapper
- `frontend/src/components/ocr/OcrImport.tsx` - OCR upload/history UI
- `frontend/src/components/ProductionRecordManagement.tsx` - Shift Records PDF
  preview
- `scripts/dev-servers.sh` - local service lifecycle
- `scripts/build-aws.sh` - AWS build packaging

## Safe continuation checklist

1. Read `AGENTS.md`, this file, `AWS_DEPLOYMENT.md`, and
   `docs/OCR_IMPORT.md`.
2. Run `git status --short` and inspect, rather than resetting, the dirty tree.
3. Run `./scripts/dev-servers.sh status` and verify ports with `lsof`.
4. Re-run backend tests/checks and the frontend build before further edits.
5. If changing OCR behavior, update `docs/OCR_IMPORT.md` in the same change.
6. For AWS work, load the relevant AWS skill first, use AWS MCP when available,
   and follow the secret-handling constraints above.
7. Clearly distinguish local implementation from infrastructure actually
   deployed in AWS. At this handover, no AWS deployment described here has been
   completed.
