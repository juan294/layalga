import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-sesv2", () => {
  class FakeClient {
    send = mocks.send;
  }
  class SendEmailCommand {
    constructor(public readonly input: Record<string, unknown>) {}
  }
  return { SESv2Client: FakeClient, SendEmailCommand };
});

import { sesSend } from "./ses-client";

const message = {
  fromAddress: "from@example.test",
  toAddress: "to@example.test",
  subject: "Subject",
  text: "Plain text",
  html: "<p>HTML</p>",
};

beforeEach(() => {
  mocks.send.mockReset();
});

describe("SES email adapter", () => {
  it.each([
    { name: "TooManyRequestsException", $metadata: { httpStatusCode: 429 } },
    { name: "MessageRejected", $metadata: { httpStatusCode: 400 } },
    { name: "Error", code: "ECONNREFUSED" },
    { name: "Error", code: "EAI_AGAIN" },
    { name: "CredentialsProviderError" },
  ])(
    "identifies definite rejection or pre-send failure: $name $code",
    async (details) => {
      mocks.send.mockRejectedValue(
        Object.assign(new Error("private detail"), details),
      );
      await expect(
        sesSend(message, { AWS_REGION: "us-east-1" }),
      ).rejects.toMatchObject({ name: "EmailNotSentError" });
    },
  );

  it.each([
    { name: "TimeoutError" },
    { name: "Error", code: "ECONNRESET" },
    { name: "InternalServerError", $metadata: { httpStatusCode: 500 } },
    { name: "RequestTimeout", $metadata: { httpStatusCode: 400 } },
  ])(
    "does not call an ambiguous outcome definitely unsent: $name $code",
    async (details) => {
      const error = Object.assign(new Error("response unavailable"), details);
      mocks.send.mockRejectedValue(error);
      await expect(sesSend(message, { AWS_REGION: "us-east-1" })).rejects.toBe(
        error,
      );
    },
  );

  it("requires a configured region", async () => {
    await expect(sesSend(message, {})).rejects.toThrow(
      "SES_REGION or AWS_REGION is required",
    );
  });

  it("sends both text and HTML bodies and returns the message ID", async () => {
    mocks.send.mockResolvedValue({ MessageId: "message-1" });

    await expect(
      sesSend(message, { SES_REGION: "eu-west-1", AWS_REGION: "us-east-1" }),
    ).resolves.toEqual({ messageId: "message-1" });
    expect(mocks.send.mock.calls[0]?.[0].input).toEqual({
      FromEmailAddress: message.fromAddress,
      Destination: { ToAddresses: [message.toAddress] },
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: message.text, Charset: "UTF-8" },
            Html: { Data: message.html, Charset: "UTF-8" },
          },
        },
      },
    });
  });

  it("falls back to AWS_REGION and fails closed without a message ID", async () => {
    mocks.send.mockResolvedValue({});
    await expect(sesSend(message, { AWS_REGION: "us-east-1" })).rejects.toThrow(
      "without a message ID",
    );
  });
});
