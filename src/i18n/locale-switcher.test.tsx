import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import en from "../../messages/en.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ month: "2026-09" }),
}));
vi.mock("./navigation", () => ({
  Link: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { locale?: string }) => {
    const { locale, ...anchor } = props;
    return (
      <a {...anchor} data-link-locale={locale}>
        {children}
      </a>
    );
  },
  usePathname: () => "/calendar",
}));

import {
  closeOnEscape,
  LocaleOptions,
  LocaleSwitcher,
} from "./locale-switcher";

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("LocaleSwitcher disclosure", () => {
  test("is a disclosure button, not a listbox popup", () => {
    const html = render(<LocaleSwitcher />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="locale-switcher-menu"');
    expect(html).toContain('data-testid="locale-switcher-trigger"');
    expect(html).not.toContain("aria-haspopup");
    expect(html).not.toContain("listbox");
  });

  test("lists ordinary links that keep the route and mark the current language", () => {
    const html = render(<LocaleOptions locale="en" onNavigate={() => {}} />);
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain('role="option"');
    expect(html).not.toContain("aria-selected");
    expect(html).toContain('id="locale-switcher-menu"');
    expect(html).toContain('href="/calendar?month=2026-09"');
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*lang="en"/);
    expect(html).toContain('data-testid="locale-switch-es"');
  });
});

describe("closeOnEscape", () => {
  test("closes the menu and returns focus to the trigger", () => {
    const close = vi.fn();
    const restoreFocus = vi.fn();
    expect(closeOnEscape({ key: "Escape" }, close, restoreFocus)).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(restoreFocus).toHaveBeenCalledOnce();
  });

  test("ignores other keys so Tab keeps its normal navigation", () => {
    const close = vi.fn();
    const restoreFocus = vi.fn();
    expect(closeOnEscape({ key: "Tab" }, close, restoreFocus)).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(restoreFocus).not.toHaveBeenCalled();
  });
});
