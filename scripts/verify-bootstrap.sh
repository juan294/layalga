#!/usr/bin/env bash

set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$project_root"

required_files=(
  AGENTS.md
  CLAUDE.md
  LICENSE
  README.md
  package.json
  pnpm-lock.yaml
  tsconfig.json
  next.config.ts
  eslint.config.mjs
  vitest.config.ts
  playwright.config.ts
  .env.example
  vercel.json
  src/app/[locale]/layout.tsx
  src/app/[locale]/\(host\)/page.tsx
  src/app/api/health/route.ts
  .claude/settings.json
  .claude/cc-rpi-sync.json
  .claude/hooks/guard-bash.sh
  .claude/hooks/verify-edit.sh
  .claude/commands/brainstorm.md
  .claude/commands/plan.md
  .claude/commands/implement.md
  .claude/commands/validate.md
  docs/research/2026-08-29-agents-for-humans-hackathon-assessment.md
  docs/release/e2e-pro-playbook.md
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    printf 'BLOCKED: required bootstrap file is missing: %s\n' "$file" >&2
    exit 1
  fi
done

jq -e '.lastSyncCommit == "2229ac2c3e0830e333dfec5b25033311b7d4dd0a" and .blueprintVersion == "v1.28.2"' .claude/cc-rpi-sync.json >/dev/null
jq -e '.hooks.PreToolUse and .hooks.PostToolUse and .permissions.allow' .claude/settings.json >/dev/null
jq -e '.engines.node == "24.x" and .scripts.typecheck == "next typegen && tsc --noEmit" and .scripts.lint == "eslint ." and (.scripts.test | startswith("vitest run"))' package.json >/dev/null

dev_port=3008
jq -e --arg command "next dev --port $dev_port" '.scripts.dev == $command' package.json >/dev/null
grep -q "^APP_URL=http://localhost:$dev_port$" .env.example
grep -q "site_url = \"http://127.0.0.1:$dev_port\"" supabase/config.toml
if grep -R -n --exclude=verify-bootstrap.sh -E 'localhost:3000|127\.0\.0\.1:3000' \
  .env.example README.md playwright.config.ts scripts src supabase .github docs/release; then
  printf 'BLOCKED: a runtime or test URL still uses the unfixed default port 3000.\n' >&2
  exit 1
fi

bash -n .claude/hooks/guard-bash.sh
bash -n .claude/hooks/verify-edit.sh

if grep -R -n -E '\[PROJECT NAME\]|<path-to-your-cc-rpi-clone>|<cc-rpi-path>' CLAUDE.md AGENTS.md README.md docs/release .claude/commands; then
  printf 'BLOCKED: unresolved bootstrap placeholder found.\n' >&2
  exit 1
fi

if ! grep -q 'layalga.thecreativetoken.com' CLAUDE.md README.md docs/decisions/0001-bootstrap-scope.md docs/release/e2e-pro-playbook.md; then
  printf 'BLOCKED: intended public hostname is not recorded.\n' >&2
  exit 1
fi

printf "PASS: L'Ayalga cc-rpi bootstrap is internally consistent.\n"
