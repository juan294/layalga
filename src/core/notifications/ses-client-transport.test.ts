import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ handle: vi.fn() }));
// Exercise the installed SDK's retry middleware; replace only the network.
vi.mock("@aws-sdk/client-sesv2", async (importOriginal) => {
  const aws = await importOriginal<typeof import("@aws-sdk/client-sesv2")>();
  return {
    ...aws,
    SESv2Client: class extends aws.SESv2Client {
      constructor(options: import("@aws-sdk/client-sesv2").SESv2ClientConfig) {
        super({
          ...options,
          credentials: { accessKeyId: "fixture", secretAccessKey: "fixture" },
          requestHandler: { handle: transport.handle },
        });
      }
    },
  };
});

import { sesSend } from "./ses-client";
const message = {
  fromAddress: "from@example.test",
  toAddress: "to@example.test",
  subject: "Fixture",
  text: "Fixture",
  html: "Fixture",
};
beforeEach(() => {
  transport.handle.mockReset();
});

describe("SES transport attempts", () => {
  it("never replays a request after a lost response", async () => {
    transport.handle.mockRejectedValue(
      Object.assign(new Error("lost response"), { code: "ECONNRESET" }),
    );
    await expect(sesSend(message, { AWS_REGION: "us-east-1" })).rejects.toThrow(
      "lost response",
    );
    expect(transport.handle).toHaveBeenCalledTimes(1);
  });
  it("returns an explicit rejection to the durable retry owner after one attempt", async () => {
    transport.handle.mockResolvedValue({
      response: {
        statusCode: 429,
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(
          JSON.stringify({
            __type: "TooManyRequestsException",
            message: "throttled",
          }),
        ),
      },
    });
    await expect(
      sesSend(message, { AWS_REGION: "us-east-1" }),
    ).rejects.toMatchObject({ name: "EmailNotSentError" });
    expect(transport.handle).toHaveBeenCalledTimes(1);
  });
});
