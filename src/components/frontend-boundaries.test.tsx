import { readFile } from "node:fs/promises";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/app/[locale]/(host)/actions", () => ({
  captureInvitationAction: vi.fn(),
}));
vi.mock("@/app/[locale]/g/[token]/actions", () => ({
  findGuestOptions: vi.fn(),
  submitGuestVisit: vi.fn(),
}));

import {
  CaptureSuccessAnnouncement,
  CopyFeedback,
  copyButtonLabel,
} from "./host/capture-invitation-form";
import { buttonStyle } from "./host/host-styles";
import { shouldFocusGuestOptions } from "./guest/guest-invite-form";

describe("frontend boundary remediation", () => {
  test("focuses guest options only when a submitted search reveals the step", () => {
    expect(shouldFocusGuestOptions(false, true)).toBe(true);
    expect(shouldFocusGuestOptions(true, true)).toBe(false);
    expect(shouldFocusGuestOptions(true, false)).toBe(false);
    expect(shouldFocusGuestOptions(false, false)).toBe(false);
  });

  test("announces capture and clipboard outcomes politely and atomically", () => {
    const capture = renderToStaticMarkup(
      <CaptureSuccessAnnouncement label="Invitation captured" />,
    );
    const copied = renderToStaticMarkup(
      <CopyFeedback state="copied" copiedLabel="Copied" failedLabel="Failed" />,
    );
    const failed = renderToStaticMarkup(
      <CopyFeedback state="failed" copiedLabel="Copied" failedLabel="Failed" />,
    );

    for (const html of [capture, copied, failed]) {
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-atomic="true"');
    }
    expect(copied).toContain("Copied");
    expect(failed).toContain("Failed");
  });

  test("keeps copied feedback visible on the clipboard button", () => {
    expect(copyButtonLabel("idle", "Copy", "Copied")).toBe("Copy");
    expect(copyButtonLabel("failed", "Copy", "Copied")).toBe("Copy");
    expect(copyButtonLabel("copied", "Copy", "Copied")).toBe("Copied");
  });

  test("uses shared target sizes without preventing wrapped labels", async () => {
    const [globals, guestStyles] = await Promise.all([
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(
        new URL("./guest/guest-ledger.module.css", import.meta.url),
        "utf8",
      ),
    ]);

    expect(globals).toContain("--interactive-target: 2.75rem");
    expect(globals).toContain("--interactive-target-compact: 2.25rem");
    expect(globals).toMatch(
      /\.locale-switcher a \{[^}]*min-(?:block-)?size: var\(--interactive-target-compact\)/s,
    );
    expect(buttonStyle.minHeight).toBe("var(--interactive-target)");
    expect(buttonStyle.whiteSpace).toBe("normal");
    expect(guestStyles).toMatch(
      /\.primaryButton,[\s\S]*?\.secondaryButton \{[^}]*min-height: var\(--interactive-target\)/,
    );
    expect(guestStyles).toMatch(
      /\.primaryButton,[\s\S]*?\.secondaryButton \{[^}]*white-space: normal/,
    );
  });
});
