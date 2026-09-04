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
// Packages the runtime needs but esbuild never sees as a static import, so
// they are absent from the bundle's metafile. ADOT for Node is activated
// out-of-band via NODE_OPTIONS=--require .../register in the deployed
// runtime environment (see deploy-agentcore.sh); its own package.json
// dependencies pull in the rest of its OTel SDK and exporter tree when
// pnpm installs the derived bundle package below.
const explicitRuntimeDependencyNames = [
  "@aws/aws-distro-opentelemetry-node-autoinstrumentation",
];
const runtimeDependencyNames = [
  ...new Set([
    ...Object.values(result.metafile.outputs)
      .flatMap((output) => output.imports)
      .filter((entry) => entry.external && !builtins.has(entry.path))
      .map((entry) => packageName(entry.path)),
    ...explicitRuntimeDependencyNames,
  ]),
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

# Excludes @strands-agents/sdk's optional @tobilu/qmd dependency (an unused
# local embeddings/search feature) and its native tree-sitter / better-sqlite3
# / node-llama-cpp payload, which otherwise dominates the bundle with runtime
# code this deployment never imports. A blanket `pnpm install --no-optional`
# cannot be used here: ADOT's own (unrelated) optional dependency chain --
# @opentelemetry/auto-instrumentations-node -> resource-detector-gcp ->
# gcp-metadata -> gaxios -> rimraf -> glob -> jackspeak's optional
# @pkgjs/parseargs -- trips a pnpm resolver bug when optional dependencies are
# pruned globally (ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY, reproducible even
# with a single ADOT dependency and no lockfile on disk). A package-scoped
# `overrides` entry in a workspace file local to the build dir sidesteps that
# bug by removing only the one package we intend to drop.
cat > "$build_dir/pnpm-workspace.yaml" <<'WORKSPACE'
overrides:
  "@tobilu/qmd": "false"
WORKSPACE

pnpm --dir "$build_dir" install \
  --prod \
  --no-lockfile \
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
