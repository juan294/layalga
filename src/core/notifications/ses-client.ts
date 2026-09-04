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

let client: SESv2Client | undefined;

function sesClient(region: string): SESv2Client {
  client ??= new SESv2Client({ region });
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
    throw new Error("SES_REGION or AWS_REGION is required to send email");
  }

  const response = await sesClient(region).send(
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
  if (!response.MessageId) {
    throw new Error("SES accepted the request without a message ID");
  }
  return { messageId: response.MessageId };
}
