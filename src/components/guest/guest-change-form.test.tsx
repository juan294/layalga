import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GuestChangeState } from "@/core/booking/guest-action-input";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

const mocks = vi.hoisted(() => ({
  state: { status: "idle" } as GuestChangeState,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useActionState: () => [mocks.state, vi.fn(), false],
}));

import { GuestChangeForm } from "./guest-change-form";

function render(locale: "en" | "es" = "en") {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : es}
      timeZone="UTC"
    >
      <GuestChangeForm action={vi.fn()} locale={locale} token="guest-token" />
    </NextIntlClientProvider>,
  );
}

describe("guest change request form", () => {
  beforeEach(() => {
    mocks.state = { status: "idle" };
  });

  it("shows the character limit and no error before submission", () => {
    const html = render();
    expect(html).toContain('maxLength="2000"');
    expect(html).toContain("2000");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-invalid="true"');
  });

  it.each([
    ["empty", "Write what needs to change before sending."],
    ["too_long", "Shorten your request to 2000 characters or fewer."],
  ] as const)("shows a localized inline %s error", (error, text) => {
    mocks.state = { status: "error", error };
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(text);
  });

  it("localizes the error in Spanish", () => {
    mocks.state = { status: "error", error: "empty" };
    expect(render("es")).toContain(es.Guest.requestChangeEmpty);
  });
});
