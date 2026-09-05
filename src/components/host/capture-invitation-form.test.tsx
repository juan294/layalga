import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  effects: [] as (() => void)[],
  ref: { current: null as string | null },
  state: { status: "idle" } as { status: "idle" | "error" },
  transition: vi.fn((callback: () => void) => callback()),
}));
vi.mock("@/app/[locale]/(host)/actions", () => ({
  captureInvitationAction: vi.fn(),
  revealCapturedInvitationAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useActionState: () => [mocks.state, mocks.action, false],
  useRef: () => mocks.ref,
  useEffect: (effect: () => void) => {
    mocks.effects.push(effect);
  },
  startTransition: mocks.transition,
}));

import { CaptureCompletionForm } from "./capture-invitation-form";

const labels = { ...en.Host.capture, remembered: "Saved context" };

describe("automatic post-capture handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects.length = 0;
    mocks.ref.current = null;
    mocks.state = { status: "idle" };
  });

  it("resolves the exact completed run once through a transition even when its effect repeats", () => {
    CaptureCompletionForm({ labels, locale: "es", runId: "completed-run" });
    const effect = mocks.effects[0]!;
    effect();
    effect();
    expect(mocks.action).toHaveBeenCalledTimes(1);
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    const form = mocks.action.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries(form)).toEqual({
      locale: "es",
      runId: "completed-run",
    });
  });

  it("offers retry only after failure and does not automatically repeat a failed attempt", () => {
    const idle = CaptureCompletionForm({
      labels,
      locale: "en",
      runId: "completed-run",
    });
    mocks.effects[0]!();
    expect(renderToStaticMarkup(idle)).not.toContain(
      'data-testid="capture-reveal"',
    );
    mocks.state = { status: "error" };
    const failed = CaptureCompletionForm({
      labels,
      locale: "en",
      runId: "completed-run",
    });
    mocks.effects.at(-1)!();
    expect(mocks.action).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(failed)).toContain(
      'data-testid="capture-reveal"',
    );
  });
});
