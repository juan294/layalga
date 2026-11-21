import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const host = vi.hoisted(() => vi.fn());
const outcome = vi.hoisted(() => vi.fn());
vi.mock("@/core/booking/stay-requests", () => ({
  getHostStayRequestOutcome: outcome,
}));
vi.mock("@/lib/auth/current-host", () => ({ getCurrentHost: host }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: { name: string }) =>
    values ? key + " " + values.name : key,
}));
vi.mock("@/app/[locale]/sign-in/sign-in-button", () => ({
  SignInButton: ({
    locale,
    nextPath,
  }: {
    locale: string;
    nextPath: string;
  }) => (
    <button data-locale={locale} data-return-to={nextPath}>
      Google
    </button>
  ),
}));

import ReviewStay from "./page";

const id = "4b808fc4-57f8-4d8c-b926-26c74ef35dc4";
const open = (locale: string, request = id) =>
  ReviewStay({ params: Promise.resolve({ locale, id: request }) });
beforeEach(() => {
  host.mockReset();
  outcome.mockReset().mockResolvedValue({ status: "pending", actor: null });
});

it.each(["en", "es"])(
  "preserves the exact %s request path when signing in",
  async (locale) => {
    host.mockResolvedValue(null);
    const html = renderToStaticMarkup(await open(locale));
    expect(html).toContain(`data-return-to="/${locale}/review-stay/${id}"`);
    expect(html).toContain(`data-locale="${locale}"`);
    expect(html).not.toContain("#stay-request-");
    expect(outcome).not.toHaveBeenCalled();
  },
);
it.each(["en", "es"])(
  "takes the signed-in host to the exact %s dashboard card",
  async (locale) => {
    host.mockResolvedValue({ id: "host", homeId: "home" });
    await expect(open(locale)).rejects.toThrow(
      `redirect /${locale}#stay-request-${id}`,
    );
  },
);
it.each([
  ["de", id],
  ["es", "invalid-id"],
])(
  "rejects an invalid locale or request ID before checking host identity",
  async (locale, request) => {
    await expect(open(locale, request)).rejects.toThrow("not found");
    expect(host).not.toHaveBeenCalled();
  },
);

it("shows the decision and actor when the host reopens a settled notification", async () => {
  host.mockResolvedValue({ id: "host", homeId: "home" });
  outcome.mockResolvedValue({ status: "declined", actor: "Ana" });
  const html = renderToStaticMarkup(await open("es"));
  expect(outcome).toHaveBeenCalledWith({ id: "host", homeId: "home" }, id);
  expect(html).toContain("status.declined");
  expect(html).toContain("decidedBy Ana");
});
it("uses a generic not-found response for requests outside the host household", async () => {
  host.mockResolvedValue({ id: "host", homeId: "other" });
  outcome.mockResolvedValue(null);
  await expect(open("en")).rejects.toThrow("not found");
});
