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
# When tmux is unavailable, the script uses launchctl on macOS or detached
# background processes tracked by PID files on other systems.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_SESSION="nissanoee-backend"
FRONTEND_SESSION="nissanoee-frontend"
BACKEND_PORT=8000
FRONTEND_PORT=5173
RUNTIME_DIR="${TMPDIR:-/tmp}/nissanoee-dev-servers-${UID:-user}"
NISSAN_NODE_BIN="$(command -v node || true)"
NISSAN_PDFINFO_BIN="$(command -v pdfinfo || true)"
NISSAN_POPPLER_BIN_DIR="${NISSAN_PDFINFO_BIN%/*}"
NISSAN_PDFSEPARATE_BIN="$(command -v pdfseparate || true)"
if [[ -z "$NISSAN_PDFSEPARATE_BIN" && \
      -x "$NISSAN_POPPLER_BIN_DIR/../../native/poppler/poppler/bin/pdfseparate" ]]; then
  NISSAN_PDFSEPARATE_BIN="$(
    cd "$NISSAN_POPPLER_BIN_DIR/../../native/poppler/poppler/bin" && pwd
  )/pdfseparate"
fi
NISSAN_PDFSEPARATE_BIN_DIR="${NISSAN_PDFSEPARATE_BIN%/*}"

has_tmux() {
  command -v tmux >/dev/null 2>&1
}

has_launchctl() {
  command -v launchctl >/dev/null 2>&1
}

tmux_cmd() {
  if [[ -f /exec-daemon/tmux.portal.conf ]]; then
    tmux -f /exec-daemon/tmux.portal.conf "$@"
  else
    tmux "$@"
  fi
}

pid_file() {
  echo "$RUNTIME_DIR/$1.pid"
}

log_file() {
  echo "$RUNTIME_DIR/$1.log"
}

launch_label() {
  echo "com.nissanoee.dev.${1#nissanoee-}"
}

launch_service_exists() {
  launchctl list "$(launch_label "$1")" >/dev/null 2>&1
}

background_process_exists() {
  local file
  file="$(pid_file "$1")"
  [[ -f "$file" ]] || return 1

  local pid
  pid="$(cat "$file" 2>/dev/null || true)"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
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
  if has_tmux; then
    tmux_cmd has-session -t "=$1" 2>/dev/null
  elif has_launchctl; then
    launch_service_exists "$1"
  else
    background_process_exists "$1"
  fi
}

start_session() {
  local name="$1"
  local dir="$2"
  local command="$3"

  if session_exists "$name"; then
    echo "  tmux session '$name' already exists (skipping create)"
    return 0
  fi

  if has_tmux; then
    tmux_cmd new-session -d -s "$name" -c "$dir" -- "${SHELL:-bash}" -l
    # Send command + Enter (C-m)
    tmux_cmd send-keys -t "$name:0.0" "$command" C-m
    return 0
  fi

  mkdir -p "$RUNTIME_DIR"
  local logfile
  logfile="$(log_file "$name")"

  if has_launchctl; then
    local label
    label="$(launch_label "$name")"
    launchctl submit -l "$label" -o "$logfile" -e "$logfile" -- \
      /bin/bash -lc "cd '$dir' && exec $command"
    echo "  started launchctl service '$label' (log: $logfile)"
    return 0
  fi

  local pidfile
  pidfile="$(pid_file "$name")"

  (
    cd "$dir"
    nohup bash -lc "exec $command" >"$logfile" 2>&1 &
    echo "$!" >"$pidfile"
  )
  echo "  started background process (log: $logfile)"
}

ensure_backend_deps() {
  if [[ ! -x "$BACKEND_DIR/.venv/bin/python" ]]; then
    echo "Backend virtualenv missing. Run from repo root:" >&2
    echo "  python3 -m venv backend/.venv" >&2
    echo "  backend/.venv/bin/pip install -r backend/requirements.txt" >&2
    exit 1
  fi

  if [[ -z "$NISSAN_PDFINFO_BIN" || ! -x "$NISSAN_PDFINFO_BIN" || \
        -z "$NISSAN_PDFSEPARATE_BIN" || ! -x "$NISSAN_PDFSEPARATE_BIN" ]]; then
    echo "Poppler executables pdfinfo and pdfseparate are required for OCR uploads." >&2
    exit 1
  fi
}

ensure_frontend_deps() {
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "Frontend node_modules missing. Run:" >&2
    echo "  npm install --prefix frontend" >&2
    exit 1
  fi

  if [[ -z "$NISSAN_NODE_BIN" || ! -x "$NISSAN_NODE_BIN" ]]; then
    echo "Node.js executable not found in PATH." >&2
    exit 1
  fi
}

start_backend() {
  if port_in_use "$BACKEND_PORT"; then
    echo "Backend already listening on port $BACKEND_PORT"
    return 0
  fi

  ensure_backend_deps
  echo "Starting backend (Django)..."
  start_session "$BACKEND_SESSION" "$BACKEND_DIR" \
    "env PATH='$NISSAN_PDFSEPARATE_BIN_DIR:$NISSAN_POPPLER_BIN_DIR:$PATH' PYTHONDONTWRITEBYTECODE=1 .venv/bin/python manage.py runserver --noreload 0.0.0.0:${BACKEND_PORT}"
  wait_for_port "$BACKEND_PORT" "Backend"
}

start_frontend() {
  if port_in_use "$FRONTEND_PORT"; then
    echo "Frontend already listening on port $FRONTEND_PORT"
    return 0
  fi

  ensure_frontend_deps
  echo "Starting frontend (Vite)..."
  start_session "$FRONTEND_SESSION" "$FRONTEND_DIR" \
    "'$NISSAN_NODE_BIN' ./node_modules/vite/bin/vite.js --host 0.0.0.0 --port ${FRONTEND_PORT}"
  wait_for_port "$FRONTEND_PORT" "Frontend"
}

stop_session() {
  local name="$1"
  if has_tmux && session_exists "$name"; then
    tmux_cmd kill-session -t "$name"
    echo "  stopped tmux session '$name'"
    return 0
  fi

  if ! has_tmux && has_launchctl && launch_service_exists "$name"; then
    local label
    label="$(launch_label "$name")"
    launchctl remove "$label"
    echo "  stopped launchctl service '$label'"
    return 0
  fi

  if ! has_tmux && ! has_launchctl && background_process_exists "$name"; then
    local pidfile pid
    pidfile="$(pid_file "$name")"
    pid="$(cat "$pidfile")"
    kill "$pid" 2>/dev/null || true

    for _ in {1..20}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done

    rm -f "$pidfile"
    echo "  stopped background process '$name'"
  elif ! has_tmux && ! has_launchctl; then
    rm -f "$(pid_file "$name")"
  fi
}

stop_port_listener() {
  local port="$1"
  local pids=""

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      while IFS= read -r pid; do
        [[ "$pid" =~ ^[0-9]+$ ]] && kill "$pid" 2>/dev/null || true
      done <<< "$pids"
    fi
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  fi

  for _ in {1..20}; do
    port_in_use "$port" || return 0
    sleep 0.1
  done

  echo "  ERROR: listener on port $port did not stop" >&2
  return 1
}

stop_backend() {
  if port_in_use "$BACKEND_PORT"; then
    echo "Stopping backend on port $BACKEND_PORT..."
    stop_session "$BACKEND_SESSION"
    # Fallback if the process was started outside the tracked runner.
    if port_in_use "$BACKEND_PORT"; then
      stop_port_listener "$BACKEND_PORT"
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
    if port_in_use "$FRONTEND_PORT"; then
      stop_port_listener "$FRONTEND_PORT"
    fi
  else
    stop_session "$FRONTEND_SESSION"
    echo "Frontend not running"
  fi
}

lan_ipv4() {
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^192\.168\.2\.' | head -n 1
  fi
}

print_status() {
  local runner
  if has_tmux; then
    runner="tmux-session"
  elif has_launchctl; then
    runner="launchctl-service"
  else
    runner="background-process"
  fi

  echo "NissanOEE dev servers"
  echo "  Backend  ($BACKEND_PORT): $(port_in_use "$BACKEND_PORT" && echo UP || echo DOWN)  $runner=$(session_exists "$BACKEND_SESSION" && echo yes || echo no)"
  echo "  Frontend ($FRONTEND_PORT): $(port_in_use "$FRONTEND_PORT" && echo UP || echo DOWN)  $runner=$(session_exists "$FRONTEND_SESSION" && echo yes || echo no)"
  echo ""
  echo "URLs (this machine):"
  echo "  API:  http://localhost:${BACKEND_PORT}/api/"
  echo "  App:  http://localhost:${FRONTEND_PORT}/"
  echo "  Admin: http://localhost:${BACKEND_PORT}/admin/"
  local lan
  lan="$(lan_ipv4 || true)"
  if [[ -n "${lan}" ]]; then
    echo ""
    echo "LAN (192.168.2.0/24):"
    echo "  App:  http://${lan}:${FRONTEND_PORT}/"
    echo "  API:  http://${lan}:${BACKEND_PORT}/api/"
    echo "  Admin: http://${lan}:${BACKEND_PORT}/admin/"
  fi
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
