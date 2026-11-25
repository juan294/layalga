import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";

import { googleUser, webSession } from "@/test-support/web-session";

const getUser = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => webSession(getUser),
}));

import { getAuthUser, lookUpAuthUser } from "./current-user";

beforeEach(() => getUser.mockReset());

it("gives a rendered page the signed-in user", async () => {
  getUser.mockResolvedValue({ data: { user: googleUser } });
  expect(await getAuthUser()).toBe(googleUser);
  expect(await lookUpAuthUser()).toEqual({
    status: "signed_in",
    user: googleUser,
  });
});

it("gives no user without a session or while Auth is down, and tells them apart", async () => {
  for (const [error, status] of [
    [null, "signed_out"],
    [new AuthRetryableFetchError("down", 503), "unavailable"],
  ]) {
    getUser.mockResolvedValue({ data: { user: null }, error });
    expect(await getAuthUser()).toBeNull();
    expect(await lookUpAuthUser()).toEqual({ status });
  }
});
