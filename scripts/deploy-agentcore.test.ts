import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("AgentCore artifact selection", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "layalga-deploy-test-"));
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "bin"));
    mkdirSync(join(root, "dist"));
    copyFileSync(
      "scripts/deploy-agentcore.sh",
      join(root, "scripts/deploy-agentcore.sh"),
    );
    writeFileSync(
      join(root, "runtime.env"),
      [
        "DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture",
        "BEDROCK_MODEL_ID=fixture",
        "AWS_REGION=us-east-1",
        "MODEL=bedrock",
        "APP_URL=http://127.0.0.1:3008",
        "LINK_TOKEN_SECRET=fixture-only-secret-at-least-32-bytes",
      ].join("\n"),
    );
    // The real script runs in a disposable tree. Only external AWS/pnpm calls
    // are replaced; these programs cannot reach a provider or build an artifact.
    writeFileSync(
      join(root, "bin/aws"),
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({tool:'aws', args})+'\\n');
let result;
switch(args[0]+' '+args[1]) {
  case 's3api put-object': result={VersionId:'uploaded-version'}; break;
  case 'bedrock-agentcore-control list-agent-runtimes': result={agentRuntimes:[{agentRuntimeName:'layalga_agent',agentRuntimeId:'fixture-runtime'}]}; break;
  case 'bedrock-agentcore-control update-agent-runtime': result={agentRuntimeId:'fixture-runtime'}; break;
  case 'bedrock-agentcore-control get-agent-runtime': result={status:'READY',agentRuntimeId:'fixture-runtime',agentRuntimeArn:'fixture-arn',agentRuntimeVersion:'43'}; break;
  default: process.exit(64);
}
process.stdout.write(JSON.stringify(result));
`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(root, "bin/pnpm"),
      `#!${process.execPath}
require('node:fs').appendFileSync(process.env.CALL_LOG, JSON.stringify({tool:'pnpm',args:process.argv.slice(2)})+'\\n');
`,
      { mode: 0o700 },
    );
    writeFileSync(join(root, "calls.jsonl"), "");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function run(args: string[]) {
    return spawnSync(
      "/bin/bash",
      [
        join(root, "scripts/deploy-agentcore.sh"),
        "--profile",
        "fixture",
        "--env-file",
        join(root, "runtime.env"),
        ...args,
      ],
      {
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          PATH: `${join(root, "bin")}:${process.env.PATH}`,
          TMPDIR: root,
          CALL_LOG: join(root, "calls.jsonl"),
        },
        timeout: 10_000,
      },
    );
  }
  function calls(): { tool: string; args: string[] }[] {
    return readFileSync(join(root, "calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  it("uses an existing S3 version without a local ZIP, build, or upload", () => {
    const result = run(["--s3-version-id", "existing-version"]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).s3VersionId).toBe("existing-version");
    const invoked = calls();
    expect(
      invoked.some((call) => call.tool === "pnpm" || call.args[0] === "s3api"),
    ).toBe(false);
    const update = invoked.find(
      (call) => call.args[1] === "update-agent-runtime",
    )!;
    const artifact = JSON.parse(
      update.args[update.args.indexOf("--agent-runtime-artifact") + 1]!,
    );
    expect(artifact.codeConfiguration.code.s3.versionId).toBe(
      "existing-version",
    );
  });

  it.each([{ args: [] }, { args: ["--skip-bundle"] }])(
    "rejects missing ZIP on upload path $args before AWS",
    ({ args }) => {
      const result = run(args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("deployment package not found");
      expect(calls().some((call) => call.tool === "aws")).toBe(false);
      expect(calls().filter((call) => call.tool === "pnpm")).toHaveLength(
        args.length ? 0 : 1,
      );
    },
  );

  it("uploads an existing local ZIP and uses the returned version", () => {
    writeFileSync(
      join(root, "dist/deployment_package.zip"),
      "fixture artifact",
    );
    const result = run(["--skip-bundle"]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).s3VersionId).toBe("uploaded-version");
    expect(calls().filter((call) => call.args[0] === "s3api")).toHaveLength(1);
  });
});
