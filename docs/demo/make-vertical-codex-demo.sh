#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/docs/demo:$PATH"
SOURCE_TRIM_SECONDS="40"
FINAL_SPEED="1.5"
BROWSER_OUT="docs/videos/agentpad-browser-human-codex.webm"
CAST_OUT="docs/videos/agentpad-codex-terminal.cast"
GIF_OUT="docs/videos/agentpad-codex-terminal.gif"
FINAL_OUT="docs/videos/agentpad-vertical-codex-demo.mp4"

mkdir -p docs/videos
rm -f /tmp/agentpad-human-comment-created
rm -f "$BROWSER_OUT" "$CAST_OUT" "$GIF_OUT"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$BROWSER_OUT" "$CAST_OUT" "$GIF_OUT"
}
trap cleanup EXIT

docs/demo/reset-demo-state.sh

AGENTPAD_CONFIG=docs/demo/agentpad.demo.toml agentpad serve > /tmp/agentpad-vertical-codex-demo.log 2>&1 &
SERVER_PID=$!

for _ in {1..60}; do
  if curl -fsS http://127.0.0.1:8081/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

curl -fsS http://127.0.0.1:8081/api/health >/dev/null

node docs/demo/record-browser-human-codex-demo.mjs &
BROWSER_PID=$!

docs/demo/capture-codex-terminal-asciinema.sh
wait "$BROWSER_PID"

ffmpeg -y \
  -i "$BROWSER_OUT" \
  -ignore_loop 1 -i "$GIF_OUT" \
  -filter_complex "\
[0:v]fps=25,scale=1600:-2,tpad=stop_mode=clone:stop_duration=120[top];\
[1:v]fps=25,scale=1600:-2[bottom];\
[top][bottom]vstack=inputs=2[stack];\
[stack]trim=duration=${SOURCE_TRIM_SECONDS},setpts=PTS/${FINAL_SPEED},fps=25[v]" \
  -map "[v]" \
  -pix_fmt yuv420p \
  -c:v libx264 \
  "$FINAL_OUT"
