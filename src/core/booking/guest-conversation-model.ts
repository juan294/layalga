import "@/core/server-only";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { parseServerEnvironment } from "@/lib/server/env";
import {
  interpretLocally,
  interpretation,
} from "./guest-conversation-interpreter";

export async function interpretGuestCriteria(schedulingWords: string) {
  const config = parseServerEnvironment();
  if (config.model === "scripted" || !schedulingWords)
    return interpretLocally(schedulingWords);
  const client = new BedrockRuntimeClient({
    region: config.awsRegion!,
    maxAttempts: 1,
  });
  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: config.bedrockModelId,
        system: [
          {
            text: 'Extract ONLY explicit guest search criteria from bilingual scheduling words. Return one JSON object. Optional numeric fields: nights,adults,children,pets,month (1-12),year. ISO calendar dates: from,to. Optional relative: today,tomorrow,next_week,this_week,next_month,this_month. A week means seven nights. Omit unspecified fields. For alternatives or contradictions return {"ambiguous":true}. No prose, guesses, tools or actions.',
          },
        ],
        messages: [{ role: "user", content: [{ text: schedulingWords }] }],
        inferenceConfig: { maxTokens: 180, temperature: 0 },
      }),
      { abortSignal: AbortSignal.timeout(8000) },
    );
    const content = response.output?.message?.content;
    if (content?.length !== 1 || !content[0]?.text)
      throw new Error("Invalid criteria response");
    return interpretation.parse(JSON.parse(content[0].text));
  } finally {
    client.destroy();
  }
}
