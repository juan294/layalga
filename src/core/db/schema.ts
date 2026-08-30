import {
  customType,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type Locale = "en" | "es";
export type InvitationStatus = "tentative" | "sent" | "converted" | "cancelled";
export type VisitStatus =
  | "hold"
  | "confirmed"
  | "reconfirm_pending"
  | "reconfirmed"
  | "escalated"
  | "cancelled";
export type DecisionStatus = "pending" | "approved" | "declined";
export type RunStatus =
  "queued" | "running" | "completed" | "interrupted" | "failed";
export type ScheduledJobKind = "reconfirm_chase" | "reconfirm_escalate";
export type ScheduledJobStatus =
  "scheduled" | "running" | "done" | "cancelled" | "quarantined";
export type RecipientKind = "host" | "party";
export type StayRange = readonly [start: string, end: string];

function parseDateRange(value: string): StayRange {
  const match = /^\[([^,]+),([^\)]+)\)$/.exec(value);

  if (!match) {
    throw new Error(`Unsupported daterange value: ${value}`);
  }

  return [match[1], match[2]];
}

export const dateRange = customType<{
  data: StayRange;
  driverData: string;
}>({
  dataType() {
    return "daterange";
  },
  fromDriver(value) {
    return parseDateRange(value);
  },
  toDriver(value) {
    return `[${value[0]},${value[1]})`;
  },
});

const bytea = customType<{
  data: Uint8Array;
  driverData: Uint8Array;
}>({
  dataType() {
    return "bytea";
  },
});

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow();

export const homes = pgTable("homes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  timezone: text("timezone").notNull(),
  petsTogetherAllowed: boolean("pets_together_allowed")
    .notNull()
    .default(false),
  maxFamiliesWithChildren: integer("max_families_with_children")
    .notNull()
    .default(1),
  demo: boolean("demo").notNull().default(false),
  createdAt: createdAt(),
});

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  beds: integer("beds").notNull(),
  createdAt: createdAt(),
});

export const hosts = pgTable("hosts", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  locale: text("locale").$type<Locale>().notNull(),
  authUserId: uuid("auth_user_id"),
  createdAt: createdAt(),
});

export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  familyName: text("family_name").notNull(),
  locale: text("locale").$type<Locale>().notNull(),
  linkToken: text("link_token").unique(),
  linkTokenExpiresAt: timestamp("link_token_expires_at", {
    withTimezone: true,
    mode: "date",
  }),
  authUserId: uuid("auth_user_id"),
  createdAt: createdAt(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id, { onDelete: "cascade" }),
  rawMessage: text("raw_message").notNull(),
  structured: jsonb("structured")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  status: text("status")
    .$type<InvitationStatus>()
    .notNull()
    .default("tentative"),
  linkToken: text("link_token").unique(),
  linkTokenExpiresAt: timestamp("link_token_expires_at", {
    withTimezone: true,
    mode: "date",
  }).default(sql`now() + interval '30 days'`),
  linkTokenRevokedAt: timestamp("link_token_revoked_at", {
    withTimezone: true,
    mode: "date",
  }),
  createdAt: createdAt(),
});

export const hostIdentityClaims = pgTable("host_identity_claims", {
  normalizedEmail: text("normalized_email").primaryKey(),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  homeId: uuid("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  authUserId: uuid("auth_user_id").unique(),
  createdAt: createdAt(),
  claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
});

export const visits = pgTable("visits", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id, { onDelete: "cascade" }),
  invitationId: uuid("invitation_id")
    .notNull()
    .references(() => invitations.id, { onDelete: "cascade" }),
  stay: dateRange("stay").notNull(),
  adults: integer("adults").notNull(),
  children: integer("children").notNull().default(0),
  pets: integer("pets").notNull().default(0),
  specialRequests: text("special_requests").array().notNull().default([]),
  status: text("status").$type<VisitStatus>().notNull().default("hold"),
  holdExpiresAt: timestamp("hold_expires_at", {
    withTimezone: true,
    mode: "date",
  }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
  reconfirmRequestedAt: timestamp("reconfirm_requested_at", {
    withTimezone: true,
    mode: "date",
  }),
  reconfirmedAt: timestamp("reconfirmed_at", {
    withTimezone: true,
    mode: "date",
  }),
  escalatedAt: timestamp("escalated_at", { withTimezone: true, mode: "date" }),
  approvalStayHash: text("approval_stay_hash"),
  createdAt: createdAt(),
});

export const visitRooms = pgTable("visit_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  visitId: uuid("visit_id")
    .notNull()
    .references(() => visits.id, { onDelete: "cascade" }),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  homeId: uuid("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  stay: dateRange("stay").notNull(),
  createdAt: createdAt(),
});

export const agentSessions = pgTable("agent_sessions", {
  key: text("key").primaryKey(),
  sessionId: text("session_id").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  task: text("task").notNull(),
  status: text("status").$type<RunStatus>().notNull().default("running"),
  payload: jsonb("payload")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  result: jsonb("result").$type<Record<string, unknown>>(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true, mode: "date" }),
  deadlineAt: timestamp("deadline_at", { withTimezone: true, mode: "date" }),
  queueAvailableAt: timestamp("queue_available_at", {
    withTimezone: true,
    mode: "date",
  }),
  queueClaimedAt: timestamp("queue_claimed_at", {
    withTimezone: true,
    mode: "date",
  }),
  queueClaimToken: uuid("queue_claim_token"),
  executionAttemptCount: integer("execution_attempt_count")
    .notNull()
    .default(0),
  lastError: text("last_error"),
});

export const pendingDecisions = pgTable("pending_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  visitId: uuid("visit_id").references(() => visits.id, {
    onDelete: "cascade",
  }),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  agentSessionId: text("agent_session_id").notNull(),
  interruptId: text("interrupt_id").notNull(),
  interruptName: text("interrupt_name").notNull(),
  reason: jsonb("reason").$type<Record<string, unknown>>().notNull(),
  status: text("status").$type<DecisionStatus>().notNull().default("pending"),
  decidedByHostId: uuid("decided_by_host_id").references(() => hosts.id, {
    onDelete: "set null",
  }),
  decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
  note: text("note"),
  applicationError: text("application_error"),
  appliedRunId: uuid("applied_run_id").references(() => runs.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeId: uuid("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
  actor: text("actor").notNull(),
  kind: text("kind").notNull(),
  payload: jsonb("payload")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: createdAt(),
});

export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ScheduledJobKind>().notNull(),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(),
    status: text("status")
      .$type<ScheduledJobStatus>()
      .notNull()
      .default("scheduled"),
    externalRef: text("external_ref"),
    scheduleClaimedAt: timestamp("schedule_claimed_at", {
      withTimezone: true,
      mode: "date",
    }),
    scheduleClaimToken: uuid("schedule_claim_token"),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
    claimToken: uuid("claim_token"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    quarantinedAt: timestamp("quarantined_at", {
      withTimezone: true,
      mode: "date",
    }),
    runId: uuid("run_id").references(() => runs.id, {
      onDelete: "set null",
    }),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("scheduled_jobs_one_open_kind_per_visit_idx")
      .on(table.visitId, table.kind)
      .where(sql`${table.status} in ('scheduled', 'running')`),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    recipientKind: text("recipient_kind").$type<RecipientKind>().notNull(),
    recipientId: uuid("recipient_id").notNull(),
    visitId: uuid("visit_id").references(() => visits.id, {
      onDelete: "cascade",
    }),
    scheduledJobId: uuid("scheduled_job_id").references(
      () => scheduledJobs.id,
      { onDelete: "set null" },
    ),
    kind: text("kind").notNull(),
    bodyEn: text("body_en").notNull(),
    bodyEs: text("body_es").notNull(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("notifications_reconfirmation_delivery_idx")
      .on(
        table.scheduledJobId,
        table.recipientKind,
        table.recipientId,
        table.kind,
      )
      .where(
        sql`${table.scheduledJobId} is not null and ${table.kind} in ('reconfirm_chase', 'reconfirm_escalation')`,
      ),
  ],
);

export const demoClock = pgTable("demo_clock", {
  homeId: uuid("home_id")
    .primaryKey()
    .references(() => homes.id, { onDelete: "cascade" }),
  now: timestamp("now", { withTimezone: true, mode: "date" }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
});
