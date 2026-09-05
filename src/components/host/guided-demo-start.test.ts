import { describe, expect, it, vi } from "vitest";

import { performGuidedDemoStart } from "./guided-demo-start";

const homeId = "00000000-0000-4000-8000-000000000001";
const invitationId = "00000000-0000-4000-8000-000000000401";

describe("explicit guided demo start", () => {
  it("resets the shared household before entering the selected guest through POST", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    expect(await performGuidedDemoStart(homeId, invitationId, "es", request)).toBe("ready");
    expect(request).toHaveBeenCalledTimes(2);
    const [resetUrl, reset] = request.mock.calls[0]!;
    expect(resetUrl).toBe("/api/demo/reset");
    expect(reset?.method).toBe("POST");
    expect(JSON.parse(String(reset?.body))).toEqual({ homeId });
    const [entryUrl, entry] = request.mock.calls[1]!;
    expect(entryUrl).toBe("/es/demo-enter-guest");
    expect(entry?.method).toBe("POST");
    expect((entry?.body as FormData).get("invitationId")).toBe(invitationId);
  });

  it("does not enter a stale guest scenario when the shared reset is rejected", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 409 }));
    expect(await performGuidedDemoStart(homeId, invitationId, "en", request)).toBe("reset_failed");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an entry failure after a successful reset", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await performGuidedDemoStart(homeId, invitationId, "en", request)).toBe("entry_failed");
  });

  it("keeps network failures recoverable without claiming the scenario started", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    expect(await performGuidedDemoStart(homeId, invitationId, "en", request)).toBe("reset_failed");
  });
});
