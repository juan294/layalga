import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DisconnectResult } from "@/lib/auth/connected-assistants";

import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useActionState: () => [mocks.result, "/submit"],
}));
vi.mock("@/app/[locale]/assistants/actions", () => ({ disconnect: vi.fn() }));

import { ConnectedAssistants } from "./connected-assistants";

const row = {
  clientId: "5b88d492-348d-4f5a-8c00-55a8dfe0aee4",
  name: "Claude",
  recognized: true,
  connectedOn: "Nov 25, 2026",
};

function render(
  status: DisconnectResult["status"] | null,
  connections = [row],
) {
  mocks.result = status && { status };
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ConnectedAssistants connections={connections} />
    </NextIntlClientProvider>,
  );
}

describe("connected assistants list", () => {
  it("keeps the row and asks to try again after a failed disconnect", () => {
    const html = render("failed");
    expect(html).toContain(`<p role="alert">${en.Assistants.list.failed}</p>`);
    expect(html).toContain("<strong>Claude</strong>");
    expect(html).toContain('data-testid="assistant-disconnect"');
  });

  it("confirms a disconnect after the last row is gone", () => {
    const html = render("disconnected", []);
    expect(html).toContain(
      `<p role="status">${en.Assistants.list.disconnected}</p>`,
    );
    expect(html).toContain(en.Assistants.list.empty);
  });

  it("says nothing before an action", () => {
    const html = render(null);
    expect(html).not.toContain("role=");
    expect(html).toContain('aria-label="Disconnect Claude"');
  });

  it("names an unrecognized client as such, also for a screen reader", () => {
    const html = render(null, [{ ...row, recognized: false }]);
    expect(html).toContain("<strong>Claude</strong> (unrecognized)");
    expect(html).toContain('aria-label="Disconnect Claude (unrecognized)"');
  });
});
