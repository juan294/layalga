import {
  Message,
  Model,
  TextBlock,
  type BaseModelConfig,
  type CountTokensOptions,
  type ModelStreamEvent,
  type StreamOptions,
} from "@strands-agents/sdk";

export function minimizeProviderPrompt(prompt: string): string {
  return prompt
    .replace(/^.+? pasted this invitation /, "The host pasted this invitation ")
    .replace(/^Party .+? \(invitation /, "The invited party (invitation ")
    .replace(/^Party .+? asks to change visit /, "The invited party asks to change visit ")
    .replace(/^(Visit \S+) for .+? starts /, "$1 starts ")
    .replace(/^(Visit \S+) for .+? was /, "$1 was ")
    .replace(/, arrival [\s\S]*?, notes: [\s\S]*?(?=\. Place a hold)/, "");
}

export class PromptMinimizingModel<
  Config extends BaseModelConfig,
> extends Model<Config> {
  constructor(private readonly delegate: Model<Config>) {
    super();
  }

  override get stateful(): boolean {
    return this.delegate.stateful;
  }

  updateConfig(modelConfig: Config): void {
    this.delegate.updateConfig(modelConfig);
  }

  getConfig(): Config {
    return this.delegate.getConfig();
  }

  stream(
    messages: Message[],
    options?: StreamOptions,
  ): AsyncIterable<ModelStreamEvent> {
    return this.delegate.stream(messages.map(minimizeMessage), options);
  }

  override countTokens(
    messages: Message[],
    options?: CountTokensOptions,
  ): Promise<number> {
    return this.delegate.countTokens(messages.map(minimizeMessage), options);
  }
}

function minimizeMessage(message: Message): Message {
  let changed = false;
  const content = message.content.map((block) => {
    if (!(block instanceof TextBlock)) return block;
    const text = minimizeProviderPrompt(block.text);
    if (text === block.text) return block;
    changed = true;
    return new TextBlock(text);
  });

  return changed
    ? new Message({
        role: message.role,
        content,
        trackingId: message.trackingId,
        metadata: message.metadata,
      })
    : message;
}
