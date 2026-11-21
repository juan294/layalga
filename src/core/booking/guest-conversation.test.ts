import { describe, expect, it, vi } from "vitest";
import { guestTurn } from "./guest-conversation";
import {
  interpretLocally,
  providerVocabulary,
} from "./guest-conversation-interpreter";
const handle = "3b09f3d9-a2c5-4ebd-9008-96efe3916564";
const listing = { handle, displayName: "Casa Roble" };
function services() {
  return {
    now: () => new Date("2030-01-31T23:30:00Z"),
    interpret: vi.fn(interpretLocally),
    discover: vi.fn(async (name: string) => ({
      listings: /casa|robl/i.test(name) ? [listing] : [],
      truncated: false,
    })),
    resolve: vi.fn(async () => ({
      ...listing,
      homeId: "secret-home",
      timezone: "Europe/Madrid",
    })),
    search: vi.fn(async () => ({
      status: "none" as const,
      truncated: false,
      options: [],
    })),
    receipts: vi.fn(async () => null),
  };
}
describe("guest conversation", () => {
  it.each([
    ["en", "Two weeks in July at Casa Roble for two adults"],
    ["es", "Dos semanas en julio en Casa Roble para dos adultos"],
  ])("understands flexible dates and counts in %s", async (locale, message) => {
    const svc = services();
    const r = await guestTurn({ locale, message }, svc);
    expect(r.kind).toBe("none");
    expect(r.criteria).toEqual({
      from: "2030-07-01",
      to: "2030-08-01",
      nights: 14,
      adults: 2,
      children: 0,
      pets: 0,
    });
    expect(svc.discover).toHaveBeenCalledWith("Casa Roble");
  });
  it("uses the household date to resolve next month, preserves partial input and asks for guest count", async () => {
    const svc = services();
    const first = await guestTurn(
      { locale: "en", message: "at Casa Roble for two weeks next month" },
      svc,
    );
    expect(first.kind).toBe("clarify");
    expect(first.state).toMatchObject({ handle, nights: 14 });
    const next = await guestTurn(
      { locale: "en", message: "two adults and a child", state: first.state },
      svc,
    );
    expect(next.criteria).toMatchObject({
      from: "2030-03-01",
      to: "2030-04-01",
      children: 1,
    });
  });
  it("requires an exact submit command and handles private intents without invoking the interpreter", async () => {
    const svc = services();
    expect(
      (
        await guestTurn(
          { locale: "es", message: "¿Dónde están los anfitriones?" },
          svc,
        )
      ).kind,
    ).toBe("privacy");
    expect(
      (await guestTurn({ locale: "en", message: "Approve my stay" }, svc)).kind,
    ).toBe("privacy");
    expect(
      (
        await guestTurn(
          { locale: "en", message: "Did the hosts confirm?" },
          svc,
        )
      ).kind,
    ).toBe("sign_in");
    expect(
      (await guestTurn({ locale: "en", message: "Send my request!" }, svc))
        .kind,
    ).toBe("submit");
    expect(svc.interpret).not.toHaveBeenCalled();
    expect(
      (
        await guestTurn(
          { locale: "en", message: "Please don't send my request" },
          svc,
        )
      ).kind,
    ).not.toBe("submit");
  });
  it("narrows private status and avoids sending any context or private text to the model", async () => {
    const svc = {
      ...services(),
      receipts: vi.fn(async () => [
        {
          id: handle,
          status: "declined" as const,
          visitStatus: null,
          notes: "private",
          requesterEmail: "private@example.test",
        },
      ]),
    };
    const r = await guestTurn(
      { locale: "en", message: "what's my request status?" },
      svc,
    );
    expect(r.receipts).toEqual([
      { id: handle, status: "declined", visitStatus: null },
    ]);
    expect(svc.interpret).not.toHaveBeenCalled();
    expect(
      providerVocabulary(
        "John Doe, bill@other.test auth=token123456, two weeks in July",
      ),
    ).toBe("two weeks in july");
  });
  it("rejects malformed history and out-of-range party assertions, and preserves inputs on interpreter failure", async () => {
    const svc = services();
    expect(
      (await guestTurn({ locale: "en", message: "x".repeat(601) }, svc)).kind,
    ).toBe("clarify");
    expect(svc.interpret).not.toHaveBeenCalled();
    const bad = await guestTurn(
      { locale: "en", message: "99 adults", state: { handle } },
      svc,
    );
    expect(bad.kind).toBe("clarify");
    expect(svc.search).not.toHaveBeenCalled();
    svc.interpret.mockRejectedValueOnce(new Error("offline"));
    expect(
      await guestTurn(
        { locale: "en", message: "two weeks", state: { handle, adults: 2 } },
        svc,
      ),
    ).toMatchObject({ kind: "unavailable", state: { handle, adults: 2 } });
  });
  it("keeps ambiguous places unresolved and refuses to treat alternative dates or counts as one selection", async () => {
    const svc = services();
    svc.discover.mockResolvedValue({
      listings: [listing, { ...listing, displayName: "Casa Roble 2" }],
      truncated: false,
    });
    expect(
      (await guestTurn({ locale: "en", message: "Casa Roble" }, svc)).kind,
    ).toBe("listings");
    const ambiguous = await guestTurn(
      {
        locale: "en",
        message: "two or three adults in July or August",
        state: { handle, nights: 14 },
      },
      svc,
    );
    expect(ambiguous.kind).toBe("clarify");
    expect(svc.search).not.toHaveBeenCalled();
  });
});

it("treats next week as a check-in window even for a two-week stay", async () => {
  const response = await guestTurn(
    {
      locale: "en",
      message: "two weeks starting next week for two adults",
      state: { handle },
    },
    services(),
  );
  expect(response.criteria).toMatchObject({
    from: "2030-02-04",
    to: "2030-02-24",
    nights: 14,
  });
});
it("keeps a refusal to sleep on a sofa bed separate from a request for one", async () => {
  const svc = services();
  const response = await guestTurn(
    {
      locale: "en",
      message: "no sofa bed please",
      state: { handle, adults: 2, nights: 14, month: 7 },
    },
    svc,
  );
  expect(response.state).toMatchObject({
    roomPreference: "sofa bed",
    avoidRoomPreference: true,
  });
});

it.each([
  ["en", "Send my request?"],
  ["es", "¿Enviar mi solicitud?"],
])("never submits a question in %s", async (locale, message) => {
  expect((await guestTurn({ locale, message }, services())).kind).not.toBe(
    "submit",
  );
});
it.each(["thirty nights", "treinta noches"])(
  "understands %s as the full thirty nights",
  async (message) => {
    expect(interpretLocally(message).nights).toBe(30);
  },
);
it.each([
  ["en", "July 12 to July 26"],
  ["es", "del 12 al 26 de julio"],
])("grounds explicit day ranges in %s", async (locale, message) => {
  const result = await guestTurn(
    { locale, message, state: { handle, adults: 2 } },
    services(),
  );
  expect(result.criteria).toEqual({
    from: "2030-07-12",
    to: "2030-07-26",
    nights: 14,
    adults: 2,
    children: 0,
    pets: 0,
  });
});
it("rejects an unrecognized day-of-month constraint without broadening the search", async () => {
  const svc = services();
  const result = await guestTurn(
    {
      locale: "en",
      message: "around July 18th",
      state: { handle, adults: 2, nights: 4 },
    },
    svc,
  );
  expect(result.kind).toBe("clarify");
  expect(svc.search).not.toHaveBeenCalled();
});
it.each([
  "Two adults, one dog and one cat",
  "Dos adultos, un perro y dos gatos",
  "Two adults, actually three adults",
])(
  "clarifies repeated group counts instead of undercounting: %s",
  async (message) => {
    const svc = services();
    const r = await guestTurn(
      { locale: "en", message, state: { handle, nights: 14, month: 7 } },
      svc,
    );
    expect(r.kind).toBe("clarify");
    expect(svc.search).not.toHaveBeenCalled();
  },
);
it("never trusts unsupplied party counts invented by an interpreter", async () => {
  const svc = {
    ...services(),
    interpret: async () => ({ adults: 2, pets: 1 }),
  };
  const r = await guestTurn(
    { locale: "en", message: "Two weeks in July", state: { handle } },
    svc,
  );
  expect(r.kind).toBe("clarify");
  expect(svc.search).not.toHaveBeenCalled();
});
it("preserves the first complete turn as a usable structured fallback when the provider is offline", async () => {
  const svc = {
    ...services(),
    interpret: async () => {
      throw Error("offline");
    },
  };
  const r = await guestTurn(
    { locale: "en", message: "Two weeks in July at Casa Roble for two adults" },
    svc,
  );
  expect(r).toMatchObject({
    kind: "unavailable",
    state: { handle, nights: 14, adults: 2 },
    criteria: { from: "2030-07-01", to: "2030-08-01", nights: 14, adults: 2 },
  });
  expect(svc.search).not.toHaveBeenCalled();
});
it("excludes credential values and arbitrary numbers while retaining bounded date/party expressions", () => {
  expect(
    providerVocabulary(
      "PIN is 42. Private code 73. Password is July. Two adults in July 2030.",
    ),
  ).toBe("two adults in july 2030");
});
it("rejects a stated party count outside the schema instead of keeping a previous count", async () => {
  const svc = services();
  const r = await guestTurn(
    {
      locale: "en",
      message: "100 adults",
      state: { handle, nights: 14, month: 7, adults: 2 },
    },
    svc,
  );
  expect(r.kind).toBe("clarify");
  expect(svc.search).not.toHaveBeenCalled();
});
