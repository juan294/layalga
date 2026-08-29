#!/usr/bin/env bash

set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
bundle_dir=${AGENT_BUNDLE_DIR:-"$project_root/dist/agent"}

mkdir -p "$bundle_dir"

AGENT_ENTRY="$project_root/src/agent/runtime/agentcore.ts" \
  AGENT_OUTFILE="$bundle_dir/app.js" \
  node --input-type=module <<'NODE'
import { build } from "esbuild";

await build({
  entryPoints: [process.env.AGENT_ENTRY],
  bundle: true,
  format: "esm",
  packages: "external",
  platform: "node",
  target: "node22",
  outfile: process.env.AGENT_OUTFILE,
});
NODE

ROOT_PACKAGE="$project_root/package.json" BUNDLE_PACKAGE="$bundle_dir/package.json" node <<'NODE'
import { readFile, writeFile } from "node:fs/promises";

const rootPackage = JSON.parse(await readFile(process.env.ROOT_PACKAGE, "utf8"));
const bundlePackage = {
  name: "layalga-agent-runtime",
  private: true,
  type: "module",
  engines: { node: ">=22" },
  dependencies: rootPackage.dependencies,
};

await writeFile(
  process.env.BUNDLE_PACKAGE,
  `${JSON.stringify(bundlePackage, null, 2)}\n`,
  "utf8",
);
NODE

printf 'Agent bundle written to %s\n' "$bundle_dir"
