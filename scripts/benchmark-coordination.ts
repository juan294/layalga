import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { chromium, expect } from "@playwright/test";
import postgres from "postgres";

import { DEMO_SEED } from "./seed-demo";
import { isDirectExecution } from "./release-helpers";
import {
  assertBenchmarkHealth,
  benchmarkConfiguration,
  isBenchmarkRequestAllowed,
  summarizeBenchmarkActions,
  type BenchmarkAction,
  type BenchmarkActor,
  type BenchmarkCategory,
  type BenchmarkConfiguration,
} from "./benchmark-coordination-helpers";

const WAIT_MS = 120_000;
const pause = (milliseconds: number) =>
  new Promise<void>((done) => setTimeout(done, milliseconds));

async function reserveFreePort(config: BenchmarkConfiguration) {
  const url = new URL(config.baseUrl);
  if (url.protocol !== "http:" || !url.port || Number(url.port) < 1024) {
    throw new Error(
      "The owned benchmark server requires HTTP and an explicit unprivileged port",
    );
  }
  const hostname = url.hostname === "[::1]" ? "::1" : url.hostname;
  const socket = createServer();
  await new Promise<void>((done, reject) => {
    socket.once("error", reject);
    socket.listen(Number(url.port), hostname, () =>
      socket.close((error) => (error ? reject(error) : done())),
    );
  });
  return { hostname, port: url.port };
}

async function startServer(
  config: BenchmarkConfiguration,
  revision: string,
): Promise<ChildProcess> {
  const { hostname, port } = await reserveFreePort(config);
  const child = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      hostname,
      "--port",
      port,
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "development",
        VERCEL_ENV: "development",
        VERCEL_GIT_COMMIT_SHA: revision,
        APP_URL: config.baseUrl,
        DATABASE_URL: config.databaseUrl,
        NEXT_PUBLIC_SUPABASE_URL: config.supabaseUrl,
        MODEL: "scripted",
        AGENT_RUNTIME: "local",
        AGENT_EXECUTION_RUNTIME: "",
        EMAIL: "none",
        MEMORY: "none",
        SCHEDULER: "none",
        DEMO_MODE: "true",
        OTEL_SDK_DISABLED: "true",
        AWS_EC2_METADATA_DISABLED: "true",
      },
      stdio: "ignore",
    },
  );
  let spawnFailed = false;
  child.once("error", () => {
    spawnFailed = true;
  });
  try {
    const deadline = performance.now() + WAIT_MS;
    while (performance.now() < deadline) {
      if (spawnFailed || child.exitCode !== null)
        throw new Error("Owned benchmark server exited before readiness");
      try {
        const response = await fetch(`${config.baseUrl}/api/health`, {
          redirect: "error",
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          assertBenchmarkHealth(await response.json(), revision);
          return child;
        }
      } catch {
        // Compilation may not have reached the health route yet.
      }
      await pause(200);
    }
    throw new Error("Owned benchmark server did not become healthy");
  } catch (error) {
    await stopServer(child);
    throw error;
  }
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  child.kill("SIGTERM");
  await Promise.race([exited, pause(3000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, pause(1000)]);
  }
}

interface Checkpoint {
  name: string;
  scenario: "vega" | "otero";
  simulatedNow: string;
  visitStatuses: string[];
  invitationCancelled: boolean;
  invitationRevoked: boolean;
  occupiedRooms: number;
  outstandingJobs: number;
  pendingDecisions: number;
  approvedDecisions: number;
  unfinishedRuns: number;
  localRuns: number;
  notifications: { chase: number; escalation: number };
  guestEmailAccepted: number;
  hostEmailSent: number;
}

async function readCheckpoint(
  sql: postgres.Sql,
  name: string,
  scenario: "vega" | "otero",
): Promise<Checkpoint> {
  const invitationId =
    DEMO_SEED.parties[scenario === "vega" ? 0 : 1].invitation.id;
  const homeId = DEMO_SEED.home.id;
  const [row] = await sql<
    {
      simulated_now: Date;
      invitation_status: string;
      revoked: boolean;
      occupied: number;
      jobs: number;
      pending: number;
      approved: number;
      unfinished: number;
      local_runs: number;
      remote_runs: number;
      chase: number;
      escalation: number;
      guest_email: number;
      host_email: number;
    }[]
  >`
    select clock.now as simulated_now, invitation.status as invitation_status,
      invitation.link_token_revoked_at is not null as revoked,
      (select count(*)::int from public.visit_rooms occupancy join public.visits visit on visit.id=occupancy.visit_id where visit.invitation_id=invitation.id) as occupied,
      (select count(*)::int from public.scheduled_jobs job join public.visits visit on visit.id=job.visit_id where visit.invitation_id=invitation.id and job.status not in ('done','cancelled')) as jobs,
      (select count(*)::int from public.pending_decisions decision where decision.home_id=home.id and decision.status='pending') as pending,
      (select count(*)::int from public.pending_decisions decision where decision.home_id=home.id and decision.status='approved') as approved,
      (select count(*)::int from public.runs run where run.home_id=home.id and run.status in ('queued','running','interrupted')) as unfinished,
      (select count(*)::int from public.runs run where run.home_id=home.id and run.result->>'executedOn'='local') as local_runs,
      (select count(*)::int from public.runs run where run.home_id=home.id and run.result->>'executedOn'='agentcore') as remote_runs,
      (select count(*)::int from public.notifications notification join public.visits visit on visit.id=notification.visit_id where visit.invitation_id=invitation.id and notification.kind='reconfirm_chase') as chase,
      (select count(*)::int from public.notifications notification join public.visits visit on visit.id=notification.visit_id where visit.invitation_id=invitation.id and notification.kind='reconfirm_escalation') as escalation,
      (select count(*)::int from public.guest_email_attempts attempt where attempt.home_id=home.id and attempt.status='accepted') as guest_email,
      (select count(*)::int from public.host_email_pings ping where ping.home_id=home.id and ping.sent_at is not null) as host_email
    from public.invitations invitation
    join public.homes home on home.id=invitation.home_id and home.demo
    join public.demo_clock clock on clock.home_id=home.id and clock.enabled
    where invitation.id=${invitationId} and home.id=${homeId}
  `;
  assert.ok(row, "Synthetic checkpoint authority is missing");
  assert.equal(row.remote_runs, 0, "Benchmark observed a remote run");
  assert.equal(row.guest_email, 0, "Benchmark observed guest email acceptance");
  assert.equal(row.host_email, 0, "Benchmark observed host email sending");
  const visits = await sql<
    { status: string }[]
  >`select status from public.visits where invitation_id=${invitationId} and home_id=${homeId} order by created_at,id`;
  return {
    name,
    scenario,
    simulatedNow: new Date(row.simulated_now).toISOString(),
    visitStatuses: visits.map((visit) => visit.status),
    invitationCancelled: row.invitation_status === "cancelled",
    invitationRevoked: row.revoked,
    occupiedRooms: row.occupied,
    outstandingJobs: row.jobs,
    pendingDecisions: row.pending,
    approvedDecisions: row.approved,
    unfinishedRuns: row.unfinished,
    localRuns: row.local_runs,
    notifications: { chase: row.chase, escalation: row.escalation },
    guestEmailAccepted: row.guest_email,
    hostEmailSent: row.host_email,
  };
}

export async function runCoordinationBenchmark() {
  const config = benchmarkConfiguration(process.env);
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.equal(
    execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
      encoding: "utf8",
    }).trim(),
    "",
    "Commit reviewed tracked changes before measuring",
  );
  assert.equal(
    execFileSync(
      "git",
      [
        "ls-files",
        "--others",
        "--exclude-standard",
        "src",
        "scripts",
        "messages",
        "supabase",
      ],
      { encoding: "utf8" },
    ).trim(),
    "",
    "Commit benchmark and application source before measuring",
  );
  const sql = postgres(config.databaseUrl, { prepare: false, max: 2 });
  const actions: BenchmarkAction[] = [];
  const checkpoints: Checkpoint[] = [];
  const clockSteps: {
    scenario: "vega" | "otero";
    action: "chase" | "escalation";
    outcome: string;
    before: string;
    after: string;
    simulatedAdvanceMs: number;
  }[] = [];
  let server: ChildProcess | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let blockedRequest = false;
  const startup = performance.now();
  try {
    const [home] = await sql<
      { demo: boolean }[]
    >`select demo from public.homes where id=${DEMO_SEED.home.id}`;
    assert.equal(
      home?.demo,
      true,
      "Seed the disposable local demo before benchmarking",
    );
    server = await startServer(config, revision);
    browser = await chromium.launch();
    const context = await browser.newContext({
      baseURL: config.baseUrl,
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (
        !isBenchmarkRequestAllowed(
          config,
          request.url(),
          request.isNavigationRequest(),
        )
      ) {
        blockedRequest = true;
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(WAIT_MS);
    const startupDurationMs =
      Math.round((performance.now() - startup) * 100) / 100;
    const measuredStart = performance.now();
    const startedAt = new Date().toISOString();

    async function action(
      name: string,
      actor: BenchmarkActor,
      category: BenchmarkCategory,
      execute: () => Promise<unknown>,
    ) {
      const start = performance.now();
      let success = false;
      try {
        await execute();
        assert.equal(
          blockedRequest,
          false,
          "Benchmark blocked an unexpected request or redirect",
        );
        success = true;
      } finally {
        actions.push({
          name,
          actor,
          category,
          durationMs: Math.round((performance.now() - start) * 100) / 100,
          success,
        });
      }
    }
    async function checkpoint(
      name: string,
      scenario: "vega" | "otero",
      status?: string,
    ) {
      const result = await readCheckpoint(sql, name, scenario);
      if (status)
        assert.deepEqual(
          result.visitStatuses,
          [status],
          `Unexpected persisted outcome at ${name}`,
        );
      checkpoints.push(result);
      return result;
    }
    async function host(scenario: string) {
      await action(
        `${scenario}: return to host`,
        "host",
        "navigation",
        async () => {
          await page.goto("/en");
          await expect(page.getByTestId("guided-demo-panel")).toBeVisible();
        },
      );
    }
    async function guest(scenario: string) {
      await action(
        `${scenario}: open guest visit`,
        "guest",
        "navigation",
        async () => {
          await page.goto("/en/guest");
          await expect(page.getByTestId("guest-status")).toBeVisible();
        },
      );
    }
    async function begin(scenario: "vega" | "otero") {
      await action(
        `${scenario}: reset shared demo and enter guest`,
        "operator",
        "setup",
        async () => {
          await page.getByTestId(`guided-demo-start-${scenario}`).click();
          await page.waitForURL(`${config.baseUrl}/en/guest`);
          await expect(page.getByTestId("demo-guest-guide")).toHaveAttribute(
            "data-scenario",
            scenario,
          );
        },
      );
      await checkpoint("fresh scenario", scenario);
      await action(
        `${scenario}: search suggested dates`,
        "guest",
        "interaction",
        async () => {
          await expect(
            page.locator(
              'form[data-webmcp-guest-search][data-hydrated="true"]',
            ),
          ).toBeVisible();
          await page.getByTestId("find-options").click();
          await expect(page.getByTestId("guest-submit-form")).toBeVisible();
        },
      );
      if (scenario === "otero") {
        for (const checkbox of await page
          .getByTestId("guest-room-option")
          .all()) {
          if (await checkbox.isChecked())
            await action(
              "otero: remove suggested room",
              "guest",
              "interaction",
              () => checkbox.uncheck(),
            );
        }
        await action(
          "otero: select ground-floor Garage Room",
          "guest",
          "interaction",
          () =>
            page
              .locator(`[name="roomIds"][value="${DEMO_SEED.rooms[1].id}"]`)
              .check(),
        );
      } else {
        await expect(page.locator('[name="roomIds"]:checked')).toHaveCount(2);
      }
      await action(
        `${scenario}: submit selected rooms`,
        "guest",
        "decision",
        async () => {
          await page.getByTestId("guest-submit").click();
          await expect(page.getByTestId("run-status")).toHaveAttribute(
            "data-status",
            scenario === "vega" ? "completed" : "interrupted",
          );
        },
      );
    }
    async function clock(
      scenario: "vega" | "otero",
      kind: "chase" | "escalation",
      expected: "advanced" | "no_eligible",
    ) {
      const before = await readCheckpoint(sql, "clock source", scenario);
      await action(
        `${scenario}: ${kind}${expected === "no_eligible" ? " repeated" : ""}`,
        "operator",
        "demo_clock",
        async () => {
          const pending = page.waitForResponse(
            (response) =>
              response.url() === `${config.baseUrl}/api/demo/clock` &&
              response.request().method() === "POST",
          );
          await page.getByTestId(`demo-clock-${kind}`).click();
          const response = await pending;
          assert.equal(response.ok(), true);
          const body = (await response.json()) as {
            outcome: string;
            now: string;
          };
          assert.equal(body.outcome, expected);
          await expect(page.getByTestId(`demo-clock-${kind}`)).toBeEnabled();
          if (expected === "advanced")
            await expect(
              page
                .getByTestId("host-outcomes")
                .locator(
                  `[data-visit-outcome="${kind === "chase" ? "reconfirm_pending" : "escalated"}"]`,
                ),
            ).toHaveCount(1);
          clockSteps.push({
            scenario,
            action: kind,
            outcome: body.outcome,
            before: before.simulatedNow,
            after: body.now,
            simulatedAdvanceMs:
              new Date(body.now).getTime() -
              new Date(before.simulatedNow).getTime(),
          });
        },
      );
    }

    await action("open public demo sign-in", "operator", "navigation", () =>
      page.goto("/en/sign-in"),
    );
    await action("enter synthetic host", "operator", "setup", async () => {
      await page.getByTestId("demo-enter-host").click();
      await expect(page.getByTestId("guided-demo-panel")).toBeVisible();
    });
    await begin("vega");
    const routine = await checkpoint(
      "routine booking confirmed",
      "vega",
      "confirmed",
    );
    assert.equal(routine.occupiedRooms, 2);
    assert.equal(routine.pendingDecisions, 0);
    assert.ok(
      routine.outstandingJobs > 0,
      "Cancellation proof needs outstanding real reminder work",
    );
    await guest("vega cancellation");
    await action("vega: open cancellation review", "guest", "interaction", () =>
      page.locator("#cancel-request summary").click(),
    );
    await action(
      "vega: acknowledge cancellation consequences",
      "guest",
      "interaction",
      () => page.locator('#cancel-request [name="confirmed"]').check(),
    );
    await action(
      "vega: confirm cancellation",
      "guest",
      "decision",
      async () => {
        await page.getByTestId("confirm-cancellation").click();
        await page.waitForURL(`${config.baseUrl}/en/cancellation-complete`);
      },
    );
    const cancelled = await checkpoint(
      "cancelled and work retired",
      "vega",
      "cancelled",
    );
    assert.equal(
      cancelled.invitationCancelled && cancelled.invitationRevoked,
      true,
    );
    assert.equal(
      cancelled.occupiedRooms +
        cancelled.outstandingJobs +
        cancelled.pendingDecisions +
        cancelled.unfinishedRuns,
      0,
    );
    await host("vega reconfirmation");
    await begin("vega");
    await checkpoint("fresh routine booking confirmed", "vega", "confirmed");
    await host("vega");
    await clock("vega", "chase", "advanced");
    await checkpoint("routine reminder requested", "vega", "reconfirm_pending");
    await guest("vega");
    await action("vega: reconfirm visit", "guest", "decision", async () => {
      await page.getByTestId("reconfirm-yes").click();
      await expect(page.getByTestId("guest-status")).toHaveAttribute(
        "data-status",
        "reconfirmed",
      );
    });
    await checkpoint("routine visit reconfirmed", "vega", "reconfirmed");
    await host("otero");
    await begin("otero");
    const interrupted = await checkpoint("access request awaits host", "otero");
    assert.equal(interrupted.pendingDecisions, 1);
    await host("otero");
    await action(
      "otero: host approves access request",
      "host",
      "decision",
      async () => {
        await page.getByTestId("approve-decision").click();
        await expect(page.getByTestId("run-status")).toHaveAttribute(
          "data-status",
          "completed",
        );
      },
    );
    const approved = await checkpoint(
      "exception booking confirmed",
      "otero",
      "confirmed",
    );
    assert.equal(approved.approvedDecisions, 1);
    assert.equal(approved.pendingDecisions, 0);
    await host("otero");
    await clock("otero", "chase", "advanced");
    await checkpoint(
      "exception reminder requested",
      "otero",
      "reconfirm_pending",
    );
    await clock("otero", "chase", "no_eligible");
    await clock("otero", "escalation", "advanced");
    const escalated = await checkpoint(
      "unanswered request escalated",
      "otero",
      "escalated",
    );
    assert.equal(escalated.notifications.chase, 1);
    assert.equal(escalated.notifications.escalation, DEMO_SEED.hosts.length);
    await clock("otero", "escalation", "no_eligible");
    const repeated = await checkpoint(
      "repeated escalation adds no work",
      "otero",
      "escalated",
    );
    assert.deepEqual(repeated.notifications, escalated.notifications);
    assert.equal(repeated.outstandingJobs, 0);
    const automationWallTimeMs =
      Math.round((performance.now() - measuredStart) * 100) / 100;
    return {
      schemaVersion: 1,
      evidenceKind: "local-scripted-synthetic",
      sourceRevision: revision,
      startedAt,
      completedAt: new Date().toISOString(),
      configuration: config.publicConfiguration,
      serverConfigurationEvidence:
        "Owned child process with explicit modes; HTTP health verifies readiness and served revision. Modes are not exposed by health.",
      startupDurationMs,
      automationWallTimeMs,
      actions,
      summary: summarizeBenchmarkActions(actions),
      checkpoints,
      clockSteps,
      limitations: [
        "No human effort or time savings measured",
        "No real model, memory, email or adoption evidence",
        "Independent scenarios reset shared synthetic state",
        "Demo time advances are not elapsed human time",
      ],
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "benchmark_incomplete",
        lastAction: actions.at(-1)?.name,
        lastCheckpoint: checkpoints.at(-1)?.name,
        attemptedActions: actions.length,
      }),
    );
    throw error;
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        if (server) await stopServer(server);
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--output"))
    throw new Error("Usage: benchmark-coordination.ts [--output file.json]");
  const output = args[1] ?? "docs/submission/coordination-benchmark.json";
  const evidence = await runCoordinationBenchmark();
  await writeFile(output, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  console.log(
    JSON.stringify(
      {
        artifact: output,
        sourceRevision: evidence.sourceRevision,
        summary: evidence.summary,
      },
      null,
      2,
    ),
  );
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch(() => {
    console.error(
      "Coordination benchmark failed; no successful evidence artifact was written.",
    );
    process.exitCode = 1;
  });
}
