#!/usr/bin/env bash
# Smoke of the assistant routes on the production server. Run it after
# `pnpm run build`. It starts `next start` twice on a task-owned port: first
# with no ASSISTANT_ACCESS (every URL is 404 and the privacy notice has no
# assistant section), then with `on` (metadata JSON, a 401 challenge and the
# section). The server is always stopped.
#
# The environment is synthetic and nothing connects to it: a request without a
# token is refused before any database, key or Auth read.
#
# Usage: SMOKE_PORT=<free port> bash scripts/smoke-assistant-routes.sh
set -euo pipefail

port="${SMOKE_PORT:?Set SMOKE_PORT to a free, task-owned port}"
base="http://127.0.0.1:${port}"
public="https://layalga.thecreativetoken.com"
auth="https://smoke.supabase.example"
metadata_paths=(
  "/.well-known/oauth-protected-resource"
  "/.well-known/oauth-protected-resource/api/mcp"
)
log="$(mktemp -t smoke-assistant-routes)"
pid=""
failures=0

if [[ ! -f .next/BUILD_ID ]]; then
  printf 'BLOCKED: no production build; run pnpm run build first.\n' >&2
  exit 1
fi
# `next start` also reads these files, which could switch assistants on or
# load real credentials. Run the smoke from a worktree without them.
for file in .env .env.local .env.production .env.production.local; do
  if [[ -e "$file" ]]; then
    printf 'BLOCKED: %s exists; run the smoke where next start reads no env file.\n' "$file" >&2
    exit 1
  fi
done
if curl -s -o /dev/null --max-time 2 "${base}/"; then
  printf 'BLOCKED: port %s is already in use.\n' "$port" >&2
  exit 1
fi

stop() {
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  pid=""
}
trap 'stop; rm -f "$log"' EXIT

start() {
  # `env -i`: no inherited value, so the first run proves the default.
  env -i PATH="$PATH" HOME="$HOME" \
    NODE_ENV=production \
    APP_URL="$public" \
    DATABASE_URL="postgresql://smoke@127.0.0.1:1/none" \
    NEXT_PUBLIC_SUPABASE_URL="$auth" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_smoke" \
    LINK_TOKEN_SECRET="smoke-link-secret-0123456789abcdef" \
    CALENDAR_FEED_SECRET="smoke-feed-secret-0123456789abcdef" \
    AGENT_ROUTE_SECRET="smoke-agent-secret-0123456789abcde" \
    CRON_SECRET="smoke-cron-secret-0123456789abcdefg" \
    AGENT_RUNTIME=local MODEL=bedrock BEDROCK_MODEL_ID=smoke \
    AWS_REGION=us-east-1 SCHEDULER=none \
    "$@" ./node_modules/.bin/next start --hostname 127.0.0.1 --port "$port" \
    >"$log" 2>&1 &
  pid=$!
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null --max-time 2 "${base}/api/health"; then return 0; fi
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep 0.5
  done
  printf 'FAIL: next start did not answer on port %s.\n' "$port" >&2
  sed -n '1,40p' "$log" >&2
  exit 1
}

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf 'ok   %s\n' "$name"
  else
    printf 'FAIL %s: expected %s, got %s\n' "$name" "$expected" "$actual" >&2
    failures=$((failures + 1))
  fi
}

# The privacy notice: the dated assistant section follows the switch.
privacy_section="<h2>$(jq -r '.Privacy.connectedAssistantsTitle' messages/en.json)</h2>"
privacy_dated="$(jq -r '.Privacy.updatedAssistants' messages/en.json)"
privacy() {
  local html
  html="$(curl -s --max-time 20 "${base}/en/privacy")"
  if [[ "$html" == *"$privacy_section"* && "$html" == *"$privacy_dated"* ]]; then
    printf 'shown'
  elif [[ "$html" == *"$privacy_section"* || "$html" == *"$privacy_dated"* ]]; then
    printf 'partial'
  elif [[ "$html" == *"<h1"* ]]; then
    printf 'absent'
  else
    printf 'no page'
  fi
}

status() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"; }
post() {
  curl -s --max-time 10 -X POST "${base}/api/mcp" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' "$@"
}

start
for path in "${metadata_paths[@]}"; do
  check "dark ${path}" 404 "$(status "${base}${path}")"
done
check "dark POST /api/mcp" 404 "$(post -o /dev/null -w '%{http_code}')"
check "dark GET /api/mcp" 404 "$(status "${base}/api/mcp")"
check "dark privacy section" absent "$(privacy)"
stop

start ASSISTANT_ACCESS=on
for path in "${metadata_paths[@]}"; do
  body="$(curl -s --max-time 10 "${base}${path}")"
  check "on ${path} resource" "${public}/api/mcp" \
    "$(jq -r '.resource' <<<"$body" 2>/dev/null || true)"
  check "on ${path} server" "${auth}/auth/v1" \
    "$(jq -r '.authorization_servers | join(",")' <<<"$body" 2>/dev/null || true)"
done
headers="$(post -D - -o /dev/null)"
check "on POST /api/mcp status" 401 \
  "$(awk 'NR == 1 { print $2 }' <<<"$headers")"
check "on POST /api/mcp challenge" \
  "www-authenticate: Bearer resource_metadata=\"${public}/.well-known/oauth-protected-resource/api/mcp\", scope=\"openid\"" \
  "$(grep -i '^www-authenticate:' <<<"$headers" | tr -d '\r' | sed 's/^[Ww][Ww][Ww]-[Aa]uthenticate:/www-authenticate:/')"
check "on GET /api/mcp" 405 "$(status "${base}/api/mcp")"
check "on privacy section" shown "$(privacy)"
stop

if ((failures)); then
  printf 'FAIL: %d assistant route checks failed.\n' "$failures" >&2
  exit 1
fi
printf 'PASS: assistant routes are dark by default and answer when switched on.\n'
