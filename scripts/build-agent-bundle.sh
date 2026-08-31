#!/usr/bin/env bash

set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
bundle_dir=${AGENT_BUNDLE_DIR:-"$project_root/dist/agent"}
bundle_zip=${AGENT_BUNDLE_ZIP:-"$project_root/dist/deployment_package.zip"}
build_dir=$(mktemp -d "${TMPDIR:-/tmp}/layalga-agent-build.XXXXXX")
previous_parent=""

cleanup() {
  if [[ -n "$build_dir" && -d "$build_dir" ]]; then
    rm -rf -- "$build_dir"
  fi
  if [[ -n "$previous_parent" && -d "$previous_parent" ]]; then
    rm -rf -- "$previous_parent"
  fi
}
trap cleanup EXIT

mkdir -p "$(dirname "$bundle_dir")" "$(dirname "$bundle_zip")"

AGENT_ENTRY="$project_root/src/agent/runtime/agentcore.ts" \
  AGENT_OUTFILE="$build_dir/app.js" \
  ROOT_PACKAGE="$project_root/package.json" \
  BUNDLE_PACKAGE="$build_dir/package.json" \
  node --input-type=module <<'NODE'
import { builtinModules } from "node:module";
import { readFile, writeFile } from "node:fs/promises";

import { build } from "esbuild";

const result = await build({
  entryPoints: [process.env.AGENT_ENTRY],
  bundle: true,
  format: "esm",
  metafile: true,
  packages: "external",
  platform: "node",
  target: "node22",
  outfile: process.env.AGENT_OUTFILE,
});

const rootPackage = JSON.parse(await readFile(process.env.ROOT_PACKAGE, "utf8"));
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const runtimeDependencyNames = [
  ...new Set(
    Object.values(result.metafile.outputs)
      .flatMap((output) => output.imports)
      .filter((entry) => entry.external && !builtins.has(entry.path))
      .map((entry) => packageName(entry.path)),
  ),
].sort();
const dependencies = Object.fromEntries(
  runtimeDependencyNames.map((name) => {
    const version = rootPackage.dependencies?.[name];
    if (!version) {
      throw new Error(`Missing AgentCore runtime dependency: ${name}`);
    }
    return [name, version];
  }),
);
const bundlePackage = {
  name: "layalga-agent-runtime",
  private: true,
  type: "module",
  engines: { node: ">=22" },
  dependencies,
};

await writeFile(
  process.env.BUNDLE_PACKAGE,
  `${JSON.stringify(bundlePackage, null, 2)}\n`,
  "utf8",
);

function packageName(importPath) {
  const parts = importPath.split("/");
  return importPath.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
NODE

pnpm --dir "$build_dir" install \
  --prod \
  --no-lockfile \
  --ignore-workspace \
  --ignore-scripts \
  --config.node-linker=hoisted

if [[ -d "$bundle_dir" ]]; then
  previous_parent=$(mktemp -d "${TMPDIR:-/tmp}/layalga-agent-previous.XXXXXX")
  mv "$bundle_dir" "$previous_parent/agent"
fi
mv "$build_dir" "$bundle_dir"
build_dir=""

rm -f "$bundle_zip"
(
  cd "$bundle_dir"
  zip -qr "$bundle_zip" app.js package.json node_modules
)

printf 'Agent bundle written to %s and %s\n' "$bundle_dir" "$bundle_zip"
