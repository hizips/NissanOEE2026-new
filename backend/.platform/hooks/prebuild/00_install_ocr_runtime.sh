#!/usr/bin/env bash
set -euo pipefail

# OCR counts PDF pages and extracts the selected page before sending it to Datalab.
dnf install -y poppler-utils
