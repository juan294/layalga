import {
  Message,
  Model,
  TextBlock,
  type BaseModelConfig,
  type ModelStreamEvent,
} from "@strands-agents/sdk";
import { describe, expect, it } from "vitest";

import {
  minimizeProviderPrompt,
  PromptMinimizingModel,
} from "./prompt-minimization";

describe("external model prompt minimization", () => {
  it("removes host and family names while retaining task-critical free text", () => {
    expect(
      minimizeProviderPrompt(
        'Nel pasted this invitation (locale es): """Marta needs step-free access""". Structure it with capture_invitation.',
      ),
    ).toBe(
      'The host pasted this invitation (locale es): """Marta needs step-free access""". Structure it with capture_invitation.',
    );
    expect(
      minimizeProviderPrompt(
        "Party Familia Vega (invitation invite-1) chose 2026-09-18 to 2026-09-21, 2 adults, 2 children, 0 pets, arrival 18:00, notes: Marta needs step-free access. Place a hold, then confirm it.",
      ),
    ).toBe(
      "The invited party (invitation invite-1) chose 2026-09-18 to 2026-09-21, 2 adults, 2 children, 0 pets. Place a hold, then confirm it.",
    );
    expect(
      minimizeProviderPrompt(
        "Party Familia Vega (invitation invite-1) chose dates, 2 adults, arrival 18:00, notes: first line\nsecond line. Place a hold, then confirm it.",
      ),
    ).toBe(
      "The invited party (invitation invite-1) chose dates, 2 adults. Place a hold, then confirm it.",
    );
    expect(
      minimizeProviderPrompt(
        'Party Familia Vega asks to change visit visit-1: """Move us one day later""". Use find_visit_options.',
      ),
    ).toBe(
      'The invited party asks to change visit visit-1: """Move us one day later""". Use find_visit_options.',
    );
  });

  it("minimizes only text sent to the provider and preserves tool blocks", async () => {
    const delegate = new RecordingModel();
    const model = new PromptMinimizingModel(delegate);
    const toolUse = {
      type: "toolUseBlock" as const,
      toolUseId: "tool-1",
      name: "notify",
      input: { recipientId: "party-1" },
      toJSON: () => ({
        toolUse: {
          toolUseId: "tool-1",
          name: "notify",
          input: { recipientId: "party-1" },
        },
      }),
    };
    const original = new Message({
      role: "user",
      content: [
        new TextBlock("Visit visit-1 for Familia Vega starts 2026-09-18."),
        toolUse,
      ],
    });

    for await (const event of model.stream([original])) {
      expect.fail(`Unexpected recording event: ${JSON.stringify(event)}`);
    }

    expect(delegate.messages[0]?.content[0]).toMatchObject({
      text: "Visit visit-1 starts 2026-09-18.",
    });
    expect(delegate.messages[0]?.content[1]).toBe(toolUse);
    expect(original.content[0]).toMatchObject({
      text: "Visit visit-1 for Familia Vega starts 2026-09-18.",
    });
  });
});

class RecordingModel extends Model<BaseModelConfig> {
  messages: Message[] = [];

  updateConfig(): void {}

  getConfig(): BaseModelConfig {
    return { modelId: "recording" };
  }

  async *stream(messages: Message[]): AsyncIterable<ModelStreamEvent> {
    this.messages = messages;
  }
}
