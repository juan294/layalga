import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";

import {
  EMAIL_AUTH_DISABLED_MESSAGE,
  LOCAL_ONLY_MESSAGE,
  signInAsHost,
} from "./host-session";

const sql = (() => {
  throw new Error("the database must not be touched");
}) as unknown as Sql;

function context() {
  return { addCookies: vi.fn() };
}

describe("signInAsHost", () => {
  it("refuses a hosted Supabase URL before creating any user", async () => {
    const createClient = vi.fn();
    await expect(
      signInAsHost(
        context(),
        { sql, hostId: "host" },
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://hyyrnpyidipkuhakeiyb.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "key",
        },
        createClient as never,
      ),
    ).rejects.toThrow(LOCAL_ONLY_MESSAGE);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("names the local email provider setting when sign-up returns no session", async () => {
    const browser = context();
    const createClient = vi.fn(() => ({
      auth: {
        signUp: async () => ({
          data: { session: null, user: null },
          error: { message: "Email signups are disabled" },
        }),
      },
    }));
    const failure = signInAsHost(
      browser,
      { sql, hostId: "host" },
      {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54621",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "key",
      },
      createClient as never,
    );
    await expect(failure).rejects.toThrow(EMAIL_AUTH_DISABLED_MESSAGE);
    await expect(failure).rejects.toThrow("[auth.email]");
    expect(browser.addCookies).not.toHaveBeenCalled();
  });

  it("names the local email provider setting when confirmations withhold the session", async () => {
    const createClient = vi.fn(() => ({
      auth: {
        signUp: async () => ({
          data: { session: null, user: { id: "user" } },
          error: null,
        }),
      },
    }));
    await expect(
      signInAsHost(
        context(),
        { sql, hostId: "host" },
        {
          NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54621",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "key",
        },
        createClient as never,
      ),
    ).rejects.toThrow(EMAIL_AUTH_DISABLED_MESSAGE);
  });
});
