import { beforeEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: class {
    send = sdk.send;
    destroy = sdk.destroy;
  },
  ConverseCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
vi.mock("@/lib/server/env", () => ({
  parseServerEnvironment: () => ({
    model: "bedrock",
    awsRegion: "local",
    bedrockModelId: "fixture",
  }),
}));
import { interpretGuestCriteria } from "./guest-conversation-model";
import { guestTurn } from "./guest-conversation";
vi.mock("./public-listings", () => ({
  discoverPublicListings: vi.fn(),
  resolvePublicListing: async (handle: string) => ({
    handle,
    displayName: "Public fixture",
    homeId: "private-home",
    timezone: "Europe/Madrid",
  }),
}));
const id = "575d86b5-6772-4557-974b-8895d194d24f";
beforeEach(() => vi.clearAllMocks());
it("sends only scheduling vocabulary to one tool-free model call and rejects a fabricated mutation", async () => {
  sdk.send.mockResolvedValue({
    output: {
      message: {
        content: [{ text: '{"action":"approve","requesterId":"invented"}' }],
      },
    },
  });
  const result = await guestTurn({
    locale: "en",
    message:
      "Jane Smith, jane@example.test wants two weeks in July. https://secret.test/private",
    state: { handle: id, name: "Private household label", adults: 2 },
  });
  expect(result).toMatchObject({
    kind: "unavailable",
    state: { handle: id, adults: 2 },
  });
  expect(sdk.send).toHaveBeenCalledTimes(1);
  const request = sdk.send.mock.calls[0]![0].input;
  expect(request).not.toHaveProperty("toolConfig");
  expect(request.messages).toEqual([
    { role: "user", content: [{ text: "two weeks in july" }] },
  ]);
  expect(sdk.destroy).toHaveBeenCalledOnce();
});
it("accepts only typed bounded criteria and always closes the client", async () => {
  sdk.send.mockResolvedValueOnce({
    output: { message: { content: [{ text: '{"nights":14,"month":7}' }] } },
  });
  expect(await interpretGuestCriteria("two weeks in july")).toEqual({
    nights: 14,
    month: 7,
  });
  sdk.send.mockResolvedValueOnce({
    output: { message: { content: [{ text: '{"nights":90}' }] } },
  });
  await expect(interpretGuestCriteria("ninety nights")).rejects.toThrow();
  expect(sdk.destroy).toHaveBeenCalledTimes(2);
});
