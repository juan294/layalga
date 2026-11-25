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
  connectedAt: "2026-11-25T23:44:08.553565Z",
};

function render(
  status: DisconnectResult["status"] | null,
  connections = [row],
) {
  mocks.result = status && { status };
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ConnectedAssistants locale="en" connections={connections} />
    </NextIntlClientProvider>,
  );
}

const statusText = (html: string) =>
  html.match(/<p[^>]*role="status"[^>]*>(.*?)<\/p>/)?.[1];

describe("connected assistants list", () => {
  it.each(["disconnected", "failed", "unconfirmed", "gone"] as const)(
    "announces the result in the element that was there before: %s",
    (status) => {
      expect(statusText(render(status))).toBe(
        en.Assistants.list[status].replace("{assistant}", "Assistant"),
      );
      expect(statusText(render(null))).toBe("");
    },
  );

  it("confirms a disconnect after the last row is gone", () => {
    const html = render("disconnected", []);
    expect(statusText(html)).toContain("Disconnected");
    expect(html).toContain(en.Assistants.list.empty);
  });

  it("dates a connection in one zone until the viewer's zone is known", () => {
    expect(render(null)).toContain(
      '<time dateTime="2026-11-25T23:44:08.553565Z">Nov 25, 2026</time>',
    );
  });

  it("names an unrecognized client as such, also for a screen reader", () => {
    const html = render(null, [{ ...row, recognized: false }]);
    expect(html).toContain("<strong>Claude</strong> (unrecognized)");
    expect(html).toContain('aria-label="Disconnect Claude (unrecognized)"');
  });
});
