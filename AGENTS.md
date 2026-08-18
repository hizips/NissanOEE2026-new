# AGENTS.md

## Cursor Cloud specific instructions

This repository is a two-tier OEE (Overall Equipment Effectiveness) manufacturing
monitoring app:

- `backend/` — Django 6 + Django REST Framework API (JWT auth), SQLite database
  (`backend/db.sqlite3`, committed with seed data).
- `frontend/` — React 18 + TypeScript + Vite 6 SPA (Tailwind v4, Radix, MUI).

### Services

| Service  | Dir         | Run command (dev)                                    | URL                     |
| -------- | ----------- | ---------------------------------------------------- | ----------------------- |
| Backend  | `backend/`  | `.venv/bin/python manage.py runserver 0.0.0.0:8000`  | http://localhost:8000   |
| Frontend | `frontend/` | `npm run dev`                                         | http://localhost:5173   |

**Quick start (both servers):** from repo root run `./scripts/dev-servers.sh`.
Subcommands: `start` (default), `stop`, `restart`, `status`. Servers run in tmux
sessions `nissanoee-backend` and `nissanoee-frontend`.

Both must run for end-to-end use. The frontend reads `VITE_API_URL` from
`frontend/.env` (defaults to `http://localhost:8000/api`). On a `192.168.2.*`
page load it calls `http://<that-host>:8000/api` instead so LAN clients work.
Backend `ALLOWED_HOSTS` / CORS / CSRF allow `192.168.2.0/24`. Dev servers bind
`0.0.0.0` (see `./scripts/dev-servers.sh status` for this machine’s LAN URLs).

### Lint / test / build

- Frontend lint: `npm run lint` (in `frontend/`). Note: the repo currently has
  many pre-existing lint errors in app source — the command runs, it just reports
  them.
- Frontend build: `npm run build` (in `frontend/`) — runs `tsc -b` then `vite build`.
- Backend tests: `.venv/bin/python manage.py test` (in `backend/`). There are no
  real tests yet (`production/tests.py` is an empty stub).

### Non-obvious gotchas

- Python: use the backend virtualenv at `backend/.venv`. The system needs the
  `python3.12-venv` apt package to create it (already installed in the environment
  snapshot). Django 6.0 requires Python 3.12+.
- The frontend `package.json` did not originally declare `react`, `react-dom`, and
  the TypeScript/ESLint toolchain even though the lockfile pinned them; these were
  restored so `npm run lint` and `npm run build` work. Run `npm install` (not
  `npm ci`) in `frontend/`.
- `backend/config/settings.py` hard-codes `DEBUG = False` (intentional). Admin CSS/JS
  are served by WhiteNoise from `STATIC_ROOT` — after clone or a Django upgrade run
  `cd backend && .venv/bin/python manage.py collectstatic --noinput`. Error pages
  remain non-verbose; do not flip `DEBUG` for local admin styling.
- Login credentials seeded in the committed DB: manager `admin` / `admin` and
  operator `operator` / `operator_password`. To (re)seed a fresh DB run
  `.venv/bin/python manage.py migrate` then `.venv/bin/python manage.py seed_data`.
- `backend/db.sqlite3` is committed and tracked — avoid committing local data
  changes made while testing (revert it before committing).

### Data changes / testing preference

- For data setup and verification, **edit the database directly** (Django shell,
  `manage.py`, or SQLite) rather than driving the web UI. Example:

  ```bash
  cd backend && .venv/bin/python manage.py shell
  ```

  ```python
  from production.models import Operator, ProductionRecord, PartProductionHistory
  ProductionRecord.objects.all().delete()
  PartProductionHistory.objects.all().delete()
  Operator.objects.all().delete()
  Operator.objects.create(name='unknown', employee_id='unknown', role='Operator')
  ```

- Verify via API (`curl` against `/api/operators/`, etc.) instead of browser
  walkthroughs unless the task is explicitly UI-related.

### OCR Import documentation

OCR behaviour and feature notes live in [`docs/OCR_IMPORT.md`](docs/OCR_IMPORT.md).
When you add or change an important OCR feature (UI or backend), update that file
in the same change (workflow, naming, import rules, API, changelog table).

### Session re-authentication

API clients (`frontend/src/services/api.ts`, `ocrApi.ts`) open a re-login dialog on
401 / “Authentication required” instead of reloading the page. Implementation:
`authSession.ts`, `ReauthDialog.tsx`. Failed requests retry once after sign-in.
