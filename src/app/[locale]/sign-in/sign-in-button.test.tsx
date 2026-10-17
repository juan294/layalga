import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setters: [] as ReturnType<typeof vi.fn>[],
  fetch: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: boolean) => {
    const setter = vi.fn();
    mocks.setters.push(setter);
    return [initial, setter];
  },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithOAuth: mocks.signInWithOAuth } }),
}));

import { SignInButton } from "./sign-in-button";

type ButtonProps = { onClick: () => Promise<void>; "data-testid": string };

/** Calls the component and returns the props of its sign-in button. */
function renderButton(nextPath?: string): ButtonProps {
  const tree = SignInButton({ locale: "en", nextPath }) as ReactElement<{
    children: ReactElement<ButtonProps>[];
  }>;
  return tree.props.children[0]!.props;
}

describe("SignInButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setters.length = 0;
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubGlobal("window", {
      location: { origin: "https://layalga.example" },
    });
    mocks.fetch.mockResolvedValue({ ok: true });
    mocks.signInWithOAuth.mockResolvedValue({ error: null });
  });

  it("always asks Google to show the account chooser", async () => {
    await renderButton("/en/rooms").onClick();

    expect(mocks.fetch).toHaveBeenCalledWith(
      "/auth/prepare",
      expect.objectContaining({
        body: JSON.stringify({ next: "/en/rooms" }),
      }),
    );
    expect(mocks.signInWithOAuth).toHaveBeenCalledOnce();
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://layalga.example/auth/callback",
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("does not force the consent screen again", async () => {
    await renderButton().onClick();

    const { options } = mocks.signInWithOAuth.mock.calls[0]![0] as {
      options: { queryParams: { prompt: string } };
    };
    expect(options.queryParams.prompt.split(" ")).not.toContain("consent");
  });

  it("does not start Google when the preparation request fails", async () => {
    mocks.fetch.mockResolvedValue({ ok: false });

    await renderButton().onClick();

    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
    // The first useState is the error flag; it is set to true on failure.
    expect(mocks.setters[0]).toHaveBeenLastCalledWith(true);
  });
});
