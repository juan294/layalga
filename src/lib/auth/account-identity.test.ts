import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { toAccountIdentity } from "./account-identity";

const PICTURE = "https://lh3.googleusercontent.com/a/photo=s96-c";

function userWith(overrides: Record<string, unknown> = {}): User {
  return {
    id: "00000000-0000-4000-8000-0000000000aa",
    email: "ana@example.com",
    email_confirmed_at: "2026-10-17T10:00:00.000Z",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-10-17T10:00:00.000Z",
    identities: [
      {
        provider: "google",
        identity_data: { picture: PICTURE },
      },
    ],
    ...overrides,
  } as unknown as User;
}

function googleIdentity(identityData: Record<string, unknown>) {
  return [{ provider: "google", identity_data: identityData }];
}

describe("toAccountIdentity", () => {
  it("returns the verified email, the Google avatar and a monogram", () => {
    expect(toAccountIdentity(userWith())).toEqual({
      email: "ana@example.com",
      avatarUrl: PICTURE,
      initial: "A",
    });
  });

  it("returns null without a user, without an email or with an unconfirmed email", () => {
    expect(toAccountIdentity(null)).toBeNull();
    expect(toAccountIdentity(userWith({ email: undefined }))).toBeNull();
    expect(toAccountIdentity(userWith({ email: "" }))).toBeNull();
    expect(
      toAccountIdentity(userWith({ email_confirmed_at: undefined })),
    ).toBeNull();
  });

  it.each([
    ["élena@example.com", "É"],
    ["zoe@example.com", "Z"],
    ["\u{1D49C}na@example.com", "\u{1D49C}"],
    ["ßa@example.com", "S"],
  ])(
    "uses the first letter of %s as a single-letter monogram",
    (email, initial) => {
      expect(toAccountIdentity(userWith({ email }))?.initial).toBe(initial);
    },
  );

  it("finds the Google identity when it is not the first one", () => {
    const identity = toAccountIdentity(
      userWith({
        identities: [
          { provider: "email", identity_data: {} },
          { provider: "google", identity_data: { picture: PICTURE } },
        ],
      }),
    );

    expect(identity?.avatarUrl).toBe(PICTURE);
  });

  it.each([
    ["http scheme", "http://lh3.googleusercontent.com/a/photo"],
    ["javascript scheme", "javascript:alert(1)"],
    ["another host", "https://evil.example/x.png"],
    ["a lookalike suffix host", "https://googleusercontent.com.evil.example/x"],
    ["the bare apex domain", "https://googleusercontent.com/x"],
    [
      "a host with a userinfo trick",
      "https://lh3.googleusercontent.com@evil.example/x",
    ],
    ["not a URL", "not a url"],
  ])("drops the avatar for %s", (_label, picture) => {
    const identity = toAccountIdentity(
      userWith({ identities: googleIdentity({ picture }) }),
    );

    expect(identity).toMatchObject({
      email: "ana@example.com",
      avatarUrl: null,
    });
  });

  it.each([
    ["a number", 42],
    ["an object", { url: PICTURE }],
    ["null", null],
    ["a missing field", undefined],
  ])("drops the avatar when picture is %s", (_label, picture) => {
    const identity = toAccountIdentity(
      userWith({ identities: googleIdentity({ picture }) }),
    );

    expect(identity?.avatarUrl).toBeNull();
  });

  it("never reads the avatar from user-writable metadata", () => {
    const identity = toAccountIdentity(
      userWith({
        identities: [],
        user_metadata: { avatar_url: PICTURE, picture: PICTURE },
      }),
    );

    expect(identity).toEqual({
      email: "ana@example.com",
      avatarUrl: null,
      initial: "A",
    });
  });

  it("ignores a picture on a non-Google identity", () => {
    const identity = toAccountIdentity(
      userWith({
        identities: [
          { provider: "email", identity_data: { picture: PICTURE } },
        ],
      }),
    );

    expect(identity?.avatarUrl).toBeNull();
  });

  it("gives a monogram when the user has no identities array", () => {
    const identity = toAccountIdentity(userWith({ identities: undefined }));

    expect(identity).toEqual({
      email: "ana@example.com",
      avatarUrl: null,
      initial: "A",
    });
  });
});
