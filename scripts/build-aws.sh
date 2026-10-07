#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
output_dir="${1:-$repo_root/.aws-build}"

if [[ -z "${VITE_API_URL:-}" ]]; then
  echo "VITE_API_URL is required, for example https://api-oee.example.com/api" >&2
  exit 1
fi

mkdir -p "$output_dir"

echo "Building frontend with OCR enabled..."
(
  cd "$repo_root/frontend"
  npm install --no-audit --no-fund
  VITE_API_URL="$VITE_API_URL" VITE_ENABLE_OCR=true npm run build
)

frontend_output="$output_dir/frontend"
rm -rf "$frontend_output"
mkdir -p "$frontend_output"
cp -R "$repo_root/frontend/dist/." "$frontend_output/"

backend_stage="$(mktemp -d)"
trap 'rm -rf "$backend_stage"' EXIT

echo "Packaging Elastic Beanstalk backend with OCR enabled..."
rsync -a "$repo_root/backend/" "$backend_stage/" \
  --exclude '.DS_Store' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.venv/' \
  --exclude 'venv/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude 'db.sqlite3' \
  --exclude 'db.sqlite3-journal' \
  --exclude 'ocr/data/' \
  --exclude 'staticfiles/' \
  --exclude '*.log'

cp "$repo_root/backend/requirements.aws.txt" "$backend_stage/requirements.txt"
backend_output="$output_dir/backend.zip"
rm -f "$backend_output"
(
  cd "$backend_stage"
  zip -qr "$backend_output" .
)

echo "AWS artifacts ready:"
echo "  Frontend: $frontend_output"
echo "  Backend:  $backend_output"
