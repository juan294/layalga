import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

export interface EmailMessage {
  fromAddress: string;
  toAddress: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSendResult {
  messageId: string;
}

export type EmailSender = (message: EmailMessage) => Promise<EmailSendResult>;

/** The provider did not accept this attempt; the durable outbox may retry it. */
export class EmailNotSentError extends Error {
  override name = "EmailNotSentError";
}

const SES_REJECTIONS = new Set([
  "AccountSuspendedException",
  "BadRequestException",
  "LimitExceededException",
  "MailFromDomainNotVerifiedException",
  "MessageRejected",
  "NotFoundException",
  "SendingPausedException",
  "TooManyRequestsException",
]);

function definitelyNotSent(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const failure = error as Error & {
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  // DNS, refused connection, and credential resolution fail before SES receives
  // the request. Resets/timeouts and unspecified 4xx/5xx remain ambiguous.
  if (
    ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(failure.code ?? "") ||
    failure.name === "CredentialsProviderError"
  )
    return true;
  const status = failure.$metadata?.httpStatusCode;
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    SES_REJECTIONS.has(failure.name)
  );
}

let client: SESv2Client | undefined;

function sesClient(region: string): SESv2Client {
  // SendEmail has no idempotency token; only the durable outbox may retry.
  client ??= new SESv2Client({ region, maxAttempts: 1 });
  return client;
}

/**
 * Sends one plain-text-plus-HTML email through Amazon SES. Region comes from
 * `SES_REGION`, falling back to `AWS_REGION` so a single AWS region setting
 * covers both Bedrock and SES unless the operator needs to split them.
 */
export async function sesSend(
  message: EmailMessage,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<EmailSendResult> {
  const region = env.SES_REGION ?? env.AWS_REGION;
  if (!region) {
    throw new EmailNotSentError(
      "SES_REGION or AWS_REGION is required to send email",
    );
  }

  let response;
  try {
    response = await sesClient(region).send(
      new SendEmailCommand({
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
      }),
    );
  } catch (error) {
    if (definitelyNotSent(error)) {
      throw new EmailNotSentError("Email was not sent", { cause: error });
    }
    throw error;
  }
  if (!response.MessageId) {
    throw new Error("SES accepted the request without a message ID");
  }
  return { messageId: response.MessageId };
}
