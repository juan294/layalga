#!/usr/bin/env bash

set -euo pipefail

spike_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$spike_root"

mkdir -p dist
./node_modules/esbuild/bin/esbuild src/app.ts \
  --bundle \
  --packages=external \
  --platform=node \
  --target=node22 \
  --format=esm \
  --outfile=dist/app.js

deployment_dir=$(mktemp -d /tmp/layalga-agentcore-package.XXXXXX)
trap 'rm -rf "$deployment_dir"' EXIT

pnpm --config.node-linker=hoisted \
  --filter @layalga/agentcore-spike \
  deploy \
  --prod \
  --legacy \
  "$deployment_dir"
cp dist/app.js "$deployment_dir/app.js"
cp deployment-package.json "$deployment_dir/package.json"

(
  cd "$deployment_dir"
  zip -qry deployment_package.zip app.js package.json node_modules
)

mv "$deployment_dir/deployment_package.zip" dist/deployment_package.zip

printf 'PASS: created %s/dist/deployment_package.zip\n' "$spike_root"
