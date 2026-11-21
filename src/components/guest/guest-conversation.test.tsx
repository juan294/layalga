import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { GuestConversation } from "./guest-conversation";
import { structuredStayPath } from "./structured-stay-path";
vi.mock("@/app/[locale]/stays/conversation-actions", () => ({
  guestConversationTurn: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/[locale]/requests/actions", () => ({
  prepareStayRequest: vi.fn(),
}));
describe("guest booking conversation", () => {
  it("keeps private turns out of URLs and exposes the structured alternative", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
        <GuestConversation locale="en" />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('method="post"');
    expect(html).toContain('maxLength="600"');
    expect(html).toContain('href="#structured-stay-search"');
    expect(html).not.toContain('name="message"');
  });
  it("carries only public dates and counts into the matching structured home", () => {
    const handle = "5cce56f7-ecb4-44df-ad7a-ed9430381451";
    const link = structuredStayPath("es", {
      handle,
      name: "private search text",
      from: "2030-07-01",
      to: "2030-08-01",
      nights: 14,
      adults: 2,
      children: 0,
      pets: 0,
    });
    expect(link).toBe(
      `/es/stays/${handle}?from=2030-07-01&to=2030-08-01&nights=14&adults=2&children=0&pets=0#structured-stay-search`,
    );
    expect(structuredStayPath("en", { name: "private search text" })).toBe(
      "#structured-stay-search",
    );
  });
});
