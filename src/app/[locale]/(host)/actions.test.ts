import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  revalidatePath: vi.fn(),
  reportActionError: vi.fn(),
  requireHost: vi.fn(),
  forgetPartyMemory: vi.fn(),
  parseServerEnvironment: vi.fn(),
  database: {},
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: mocks.database }),
  sqlClient: () => mocks.sql,
}));
vi.mock("@/core/memory/forget", () => ({
  forgetPartyMemory: mocks.forgetPartyMemory,
}));
vi.mock("@/lib/auth/current-host", () => ({ requireHost: mocks.requireHost }));
vi.mock("@/lib/server/env", () => ({
  parseServerEnvironment: mocks.parseServerEnvironment,
}));
vi.mock("@/lib/server/action-errors", () => ({
  reportActionError: mocks.reportActionError,
  reportedActionError: (code: string) => new Error(code),
}));

import { forgetPartyMemoryAction, updateEmailPingsAction } from "./actions";

const host = {
  id: "00000000-0000-4000-8000-000000000201",
  homeId: "00000000-0000-4000-8000-000000000001",
};
const otherHostId = "00000000-0000-4000-8000-000000000202";

function pingsForm(emailPings: boolean) {
  const form = new FormData();
  form.set("locale", "en");
  form.set("emailPings", String(emailPings));
  return form;
}

describe("updateEmailPingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHost.mockResolvedValue(host);
    mocks.sql.mockResolvedValue([]);
    mocks.parseServerEnvironment.mockReturnValue({
      memory: "agentcore",
      memoryId: "mem-test",
      awsRegion: "us-east-1",
    });
  });

  it("writes the authenticated host's own row, never a caller-supplied one", async () => {
    await updateEmailPingsAction(pingsForm(false));

    expect(mocks.requireHost).toHaveBeenCalledWith("en");
    expect(mocks.sql).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mocks.sql.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join("?")).toContain("host_notification_settings");
    expect(values).toContain(host.id);
    expect(values).toContain(host.homeId);
    expect(values).not.toContain(otherHostId);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en");
  });

  it("reports and swallows a database failure instead of throwing", async () => {
    mocks.sql.mockRejectedValueOnce(new Error("db down"));

    await expect(
      updateEmailPingsAction(pingsForm(true)),
    ).resolves.toBeUndefined();
    expect(mocks.reportActionError).toHaveBeenCalledWith(
      "email_settings_update_failed",
      expect.any(Error),
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("forgetPartyMemoryAction", () => {
  const partyId = "44444444-4444-4444-8444-444444444444";
  const otherPartyId = "55555555-5555-4555-8555-555555555555";

  function forgetForm(id: string) {
    const form = new FormData();
    form.set("locale", "en");
    form.set("partyId", id);
    return form;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHost.mockResolvedValue(host);
    mocks.parseServerEnvironment.mockReturnValue({
      memory: "agentcore",
      memoryId: "mem-test",
      awsRegion: "us-east-1",
    });
  });

  it("forgets a party of the caller's own home and revalidates the page", async () => {
    mocks.sql.mockResolvedValue([{ id: partyId }]);
    mocks.forgetPartyMemory.mockResolvedValue({
      deletedRecords: 2,
      deletedEvents: 1,
    });

    await forgetPartyMemoryAction(forgetForm(partyId));

    expect(mocks.requireHost).toHaveBeenCalledWith("en");
    const [strings, ...values] = mocks.sql.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join("?")).toContain("public.parties");
    expect(values).toContain(partyId);
    expect(values).toContain(host.homeId);
    expect(mocks.forgetPartyMemory).toHaveBeenCalledWith(
      mocks.database,
      host.homeId,
      partyId,
      "mem-test",
      "us-east-1",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/en");
  });

  it("does nothing when the party does not belong to the caller's home", async () => {
    mocks.sql.mockResolvedValue([]);

    await forgetPartyMemoryAction(forgetForm(otherPartyId));

    expect(mocks.forgetPartyMemory).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does nothing when MEMORY is not agentcore", async () => {
    mocks.parseServerEnvironment.mockReturnValue({ memory: "none" });

    await forgetPartyMemoryAction(forgetForm(partyId));

    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.forgetPartyMemory).not.toHaveBeenCalled();
  });

  it("rejects a malformed partyId without querying the database", async () => {
    await forgetPartyMemoryAction(forgetForm("not-a-uuid"));

    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.forgetPartyMemory).not.toHaveBeenCalled();
  });

  it("reports and swallows a forget failure instead of throwing", async () => {
    mocks.sql.mockResolvedValue([{ id: partyId }]);
    mocks.forgetPartyMemory.mockRejectedValue(new Error("aws down"));

    await expect(
      forgetPartyMemoryAction(forgetForm(partyId)),
    ).resolves.toBeUndefined();
    expect(mocks.reportActionError).toHaveBeenCalledWith(
      "memory_forget_failed",
      expect.any(Error),
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
