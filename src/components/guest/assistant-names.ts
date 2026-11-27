import type { AssistantName } from "@/core/assistant-access/clients";

/** Product and company names. They are the same in every language. */
export const ASSISTANTS: Record<
  AssistantName,
  { name: string; vendor: string }
> = {
  claude: { name: "Claude", vendor: "Anthropic" },
  chatgpt: { name: "ChatGPT", vendor: "OpenAI" },
};
