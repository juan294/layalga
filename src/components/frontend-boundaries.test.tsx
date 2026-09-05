import { readFile } from "node:fs/promises";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/app/[locale]/(host)/actions", () => ({
  captureInvitationAction: vi.fn(),
  revealCapturedInvitationAction: vi.fn(),
}));
vi.mock("@/app/[locale]/g/[token]/actions", () => ({
  findGuestOptions: vi.fn(),
  submitGuestVisit: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  CaptureFormBoundary,
  CaptureSuccessAnnouncement,
  CopyFeedback,
  captureStatusHref,
  captureSubmitDisabled,
  copyButtonLabel,
} from "./host/capture-invitation-form";
import { buttonStyle } from "./host/host-styles";
import { DemoClockPanel } from "./host/demo-clock-panel";
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

  test("keeps queued capture and completion forms as DOM siblings", () => {
    const html = renderToStaticMarkup(
      <CaptureFormBoundary
        captureForm={<form data-testid="capture-submit" />}
        resultPanel={<form data-testid="capture-completion" />}
      />,
    );

    expect(html.match(/<form/g)).toHaveLength(2);
    expect(html).toMatch(
      /capture-submit[^>]*><\/form><form[^>]*capture-completion/,
    );
  });

  test("guards a queued capture until that exact run becomes terminal", () => {
    expect(captureSubmitDisabled(false, "run-1", null)).toBe(true);
    expect(captureSubmitDisabled(false, "run-1", "run-1")).toBe(false);
    expect(captureSubmitDisabled(true, null, null)).toBe(true);
    expect(captureSubmitDisabled(false, null, null)).toBe(false);
    expect(captureStatusHref("es", "run-1")).toBe(
      "/es/runs/run-1/status?returnTo=%2Fes",
    );
  });

  test("hydrates the demo clock with server-formatted household text", () => {
    const html = renderToStaticMarkup(
      <DemoClockPanel
        current="2026-09-07T08:00:00.000Z"
        currentLabel="SERVER CLOCK TEXT"
        homeId="home-1"
        labels={{
          current: "Current",
          chase: "Chase",
          escalation: "Escalate",
          custom: "Custom",
          set: "Set",
          working: "Working",
          error: "Error",
          noEligible: "No visit needs this step",
          alreadyDue: "Already due",
          advanced: "Advanced",
          backward: "Cannot move backwards",
        }}
        locale="en"
        timeZone="Europe/Madrid"
      />,
    );

    expect(html).toContain("SERVER CLOCK TEXT");
    expect(html).not.toContain("Sep 7");
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
