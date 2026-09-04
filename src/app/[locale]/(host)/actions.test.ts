import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  revalidatePath: vi.fn(),
  reportActionError: vi.fn(),
  requireHost: vi.fn(),
  database: {},
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/core/db/client", () => ({
  getDatabaseConnection: () => ({ db: mocks.database }),
  sqlClient: () => mocks.sql,
}));
vi.mock("@/lib/auth/current-host", () => ({ requireHost: mocks.requireHost }));
vi.mock("@/lib/server/action-errors", () => ({
  reportActionError: mocks.reportActionError,
  reportedActionError: (code: string) => new Error(code),
}));

import { updateEmailPingsAction } from "./actions";

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
