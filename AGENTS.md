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

Both must run for end-to-end use. The frontend reads `VITE_API_URL` from
`frontend/.env` (defaults to `http://localhost:8000/api`). Backend CORS already
allows `http://localhost:5173`.

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
- `backend/config/settings.py` hard-codes `DEBUG = False`. The JSON API works fine
  with this, but Django `runserver` will not serve the admin's static CSS and error
  pages are non-verbose. This is intentional in the repo; do not change it for dev.
- Login credentials seeded in the committed DB: manager `admin` / `admin` and
  operator `operator` / `operator_password`. To (re)seed a fresh DB run
  `.venv/bin/python manage.py migrate` then `.venv/bin/python manage.py seed_data`.
- `backend/db.sqlite3` is committed and tracked — avoid committing local data
  changes made while testing (revert it before committing).
