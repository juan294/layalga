import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureResultState } from "@/app/[locale]/(host)/actions";
import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  serverAction: vi.fn(),
  bind: vi.fn(),
  effects: [] as (() => void)[],
  ref: { current: null as string | null },
  state: { status: "idle" } as CaptureResultState,
  transition: vi.fn((callback: () => void) => callback()),
}));
vi.mock("@/app/[locale]/(host)/actions", () => ({
  retryCapturedInvitationAction: vi.fn(),
  captureInvitationAction: vi.fn(),
  revealCapturedInvitationAction: mocks.serverAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useActionState: (fn: unknown) => {
    mocks.bind(fn);
    return [mocks.state, mocks.action, false];
  },
  useRef: () => mocks.ref,
  useEffect: (effect: () => void) => {
    mocks.effects.push(effect);
  },
  startTransition: mocks.transition,
}));

import { CaptureCompletionForm } from "./capture-invitation-form";

const labels = { ...en.Host.capture, remembered: "Saved context" };

describe("explicit capture link recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects.length = 0;
    mocks.ref.current = null;
    mocks.state = { status: "idle" };
  });

  it("offers reveal on an explicit click and never requests a bearer on mount", () => {
    const body = renderToStaticMarkup(
      CaptureCompletionForm({ labels, locale: "en", runId: "first-run" }),
    );
    for (const effect of mocks.effects) effect();
    expect(mocks.action).not.toHaveBeenCalled();
    expect(body).toContain('data-testid="capture-reveal"');
    expect(body).not.toContain("/g/");
  });

  it("retries the same run after a transient action failure", async () => {
    CaptureCompletionForm({ labels, locale: "en", runId: "first-run" });
    const action = mocks.bind.mock.calls[0]![0];
    const form = new FormData();
    form.set("runId", "first-run");
    form.set("locale", "en");
    mocks.serverAction
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({
        status: "success",
        guestLink: "https://fixture.invalid/en/g/synthetic",
        structured: {},
      });
    const first = await action({ status: "idle" }, form);
    expect(first).toEqual({ status: "error" });
    expect((await action(first, form)).status).toBe("success");
    expect(
      mocks.serverAction.mock.calls.map(([, data]) => data.get("runId")),
    ).toEqual(["first-run", "first-run"]);
    form.set("keepLink", "yes");
    expect(await action({ status: "legacy" }, form)).toEqual({
      status: "idle",
    });
    expect(mocks.serverAction).toHaveBeenCalledTimes(2);
  });
  it("offers another reveal after a transient error", () => {
    mocks.state = { status: "error" };
    const body = renderToStaticMarkup(
      CaptureCompletionForm({ labels, locale: "en", runId: "first-run" }),
    );
    expect(body).toContain('data-testid="capture-reveal"');
    expect(body).toContain(labels.completionFailed);
  });
  it("requires separate confirmation for legacy replacements and allows keeping the current link", () => {
    mocks.state = { status: "legacy" };
    const body = renderToStaticMarkup(
      CaptureCompletionForm({ labels, locale: "en", runId: "legacy-run" }),
    );
    expect(body).toContain(labels.legacyWarning);
    expect(body).toContain('name="confirmReplacement"');
    expect(body).toContain('name="keepLink"');
    expect(body).not.toContain("/g/");
  });

  it.each(["expired", "revoked", "cancelled", "unknown"] as const)(
    "shows localized next steps and run reference for %s",
    (reason) => {
      mocks.state = { status: "unavailable", reason };
      const body = renderToStaticMarkup(
        CaptureCompletionForm({ labels, locale: "en", runId: "specific-run" }),
      );
      expect(body).toContain(labels[reason]);
      expect(body).toContain("specific-run");
      expect(body).toContain("/en#capture-invitation");
      expect(body).not.toContain("capture-reveal");
    },
  );
});
