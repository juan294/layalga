import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const host = vi.hoisted(() => vi.fn());
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
  getTranslations: async () => (key: string) => key,
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
});

it.each(["en", "es"])(
  "preserves the exact %s request path when signing in",
  async (locale) => {
    host.mockResolvedValue(null);
    const html = renderToStaticMarkup(await open(locale));
    expect(html).toContain(`data-return-to="/${locale}/review-stay/${id}"`);
    expect(html).toContain(`data-locale="${locale}"`);
    expect(html).not.toContain("#stay-request-");
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
