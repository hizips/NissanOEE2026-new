#!/usr/bin/env bash
# Start or stop NissanOEE dev servers (Django backend + Vite frontend).
#
# Usage:
#   ./scripts/dev-servers.sh          # start (default)
#   ./scripts/dev-servers.sh start
#   ./scripts/dev-servers.sh stop
#   ./scripts/dev-servers.sh status
#   ./scripts/dev-servers.sh restart
#
# Servers run in tmux sessions so humans and agents can detach and reconnect:
#   tmux attach-session -t nissanoee-backend
#   tmux attach-session -t nissanoee-frontend

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_SESSION="nissanoee-backend"
FRONTEND_SESSION="nissanoee-frontend"
BACKEND_PORT=8000
FRONTEND_PORT=5173

tmux_cmd() {
  if [[ -f /exec-daemon/tmux.portal.conf ]]; then
    tmux -f /exec-daemon/tmux.portal.conf "$@"
  else
    tmux "$@"
  fi
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tln | grep -q ":${port} "
  else
    lsof -i ":${port}" -sTCP:LISTEN >/dev/null 2>&1
  fi
}

wait_for_port() {
  local port="$1"
  local label="$2"
  local tries="${3:-30}"

  for ((i = 1; i <= tries; i++)); do
    if port_in_use "$port"; then
      echo "  $label ready on port $port"
      return 0
    fi
    sleep 1
  done

  echo "  ERROR: $label did not start on port $port within ${tries}s" >&2
  return 1
}

session_exists() {
  tmux_cmd has-session -t "=$1" 2>/dev/null
}

start_session() {
  local name="$1"
  local dir="$2"
  local command="$3"

  if session_exists "$name"; then
    echo "  tmux session '$name' already exists (skipping create)"
    return 0
  fi

  tmux_cmd new-session -d -s "$name" -c "$dir" -- "${SHELL:-bash}" -l
  # Send command + Enter (C-m)
  tmux_cmd send-keys -t "$name:0.0" "$command" C-m
}

ensure_backend_deps() {
  if [[ ! -x "$BACKEND_DIR/.venv/bin/python" ]]; then
    echo "Backend virtualenv missing. Run from repo root:" >&2
    echo "  python3 -m venv backend/.venv" >&2
    echo "  backend/.venv/bin/pip install -r backend/requirements.txt" >&2
    exit 1
  fi
}

ensure_frontend_deps() {
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "Frontend node_modules missing. Run:" >&2
    echo "  npm install --prefix frontend" >&2
    exit 1
  fi
}

start_backend() {
  if port_in_use "$BACKEND_PORT"; then
    echo "Backend already listening on port $BACKEND_PORT"
    return 0
  fi

  ensure_backend_deps
  echo "Starting backend (Django) in tmux session '$BACKEND_SESSION'..."
  start_session "$BACKEND_SESSION" "$BACKEND_DIR" \
    ".venv/bin/python manage.py runserver 0.0.0.0:${BACKEND_PORT}"
  wait_for_port "$BACKEND_PORT" "Backend"
}

start_frontend() {
  if port_in_use "$FRONTEND_PORT"; then
    echo "Frontend already listening on port $FRONTEND_PORT"
    return 0
  fi

  ensure_frontend_deps
  echo "Starting frontend (Vite) in tmux session '$FRONTEND_SESSION'..."
  start_session "$FRONTEND_SESSION" "$FRONTEND_DIR" \
    "npm run dev -- --host 127.0.0.1 --port ${FRONTEND_PORT}"
  wait_for_port "$FRONTEND_PORT" "Frontend"
}

stop_session() {
  local name="$1"
  if session_exists "$name"; then
    tmux_cmd kill-session -t "$name"
    echo "  stopped tmux session '$name'"
  fi
}

stop_backend() {
  if port_in_use "$BACKEND_PORT"; then
    echo "Stopping backend on port $BACKEND_PORT..."
    stop_session "$BACKEND_SESSION"
    # Fallback if process outlived tmux
    if port_in_use "$BACKEND_PORT" && command -v fuser >/dev/null 2>&1; then
      fuser -k "${BACKEND_PORT}/tcp" 2>/dev/null || true
    fi
  else
    stop_session "$BACKEND_SESSION"
    echo "Backend not running"
  fi
}

stop_frontend() {
  if port_in_use "$FRONTEND_PORT"; then
    echo "Stopping frontend on port $FRONTEND_PORT..."
    stop_session "$FRONTEND_SESSION"
    if port_in_use "$FRONTEND_PORT" && command -v fuser >/dev/null 2>&1; then
      fuser -k "${FRONTEND_PORT}/tcp" 2>/dev/null || true
    fi
  else
    stop_session "$FRONTEND_SESSION"
    echo "Frontend not running"
  fi
}

print_status() {
  echo "NissanOEE dev servers"
  echo "  Backend  ($BACKEND_PORT): $(port_in_use "$BACKEND_PORT" && echo UP || echo DOWN)  session=$(session_exists "$BACKEND_SESSION" && echo yes || echo no)"
  echo "  Frontend ($FRONTEND_PORT): $(port_in_use "$FRONTEND_PORT" && echo UP || echo DOWN)  session=$(session_exists "$FRONTEND_SESSION" && echo yes || echo no)"
  echo ""
  echo "URLs:"
  echo "  API:  http://localhost:${BACKEND_PORT}/api/"
  echo "  App:  http://localhost:${FRONTEND_PORT}/"
  echo "  Admin: http://localhost:${BACKEND_PORT}/admin/"
}

cmd_start() {
  echo "==> Starting NissanOEE dev servers from $ROOT"
  start_backend
  start_frontend
  echo ""
  print_status
}

cmd_stop() {
  echo "==> Stopping NissanOEE dev servers"
  stop_backend
  stop_frontend
  echo "Done."
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

ACTION="${1:-start}"

case "$ACTION" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_restart ;;
  status) print_status ;;
  *)
    echo "Unknown command: $ACTION" >&2
    echo "Usage: $0 [start|stop|restart|status]" >&2
    exit 1
    ;;
esac
