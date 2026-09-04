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

  it("leaves the name-free host_capture and guest_change prompts unchanged (D7)", () => {
    const hostCapturePrompt =
      'The host pasted this invitation (locale es): """Marta needs step-free access""". Structure it with capture_invitation and reply with a one-line summary for the host. The application will deliver the private link outside the model transcript.';
    const searchMemoryInstruction =
      " Before doing anything else, call search_memory to check what this household remembers about this family (arrival habits, room needs, pets, accessibility), and take any relevant preference into account. Facts from search_memory never change adults, children, pets, dates, arrival time, or specialRequests: only what the message you were given states goes into those fields.";
    const rememberedContextInstruction =
      " Put what the house remembers into rememberedContext and mention it in the one-line summary.";
    const hostCaptureWithSearch = `${hostCapturePrompt}${searchMemoryInstruction}${rememberedContextInstruction}`;
    const guestChangePrompt =
      'The invited party asks to change visit visit-1: """Move us one day later""". Use find_visit_options if dates are unclear, then reschedule_visit.';

    expect(minimizeProviderPrompt(hostCapturePrompt)).toBe(hostCapturePrompt);
    expect(minimizeProviderPrompt(hostCaptureWithSearch)).toBe(
      hostCaptureWithSearch,
    );
    expect(minimizeProviderPrompt(guestChangePrompt)).toBe(guestChangePrompt);
  });

  it("leaves the name-free guest_submit search-memory addition unchanged, still stripping arrival/notes (D7)", () => {
    const searchMemoryInstruction =
      " Before doing anything else, call search_memory to check what this household remembers about this family (arrival habits, room needs, pets, accessibility), and take any relevant preference into account. Facts from search_memory never change adults, children, pets, dates, arrival time, or specialRequests: only what the message you were given states goes into those fields.";
    const guestSubmitWithSearch = `The invited party (invitation invite-1) chose 2026-09-18 to 2026-09-21, 2 adults, 2 children, 0 pets, arrival 18:00, notes: Marta needs step-free access. Place a hold, then confirm it, and tell the guest what happens next in their language.${searchMemoryInstruction}`;

    expect(minimizeProviderPrompt(guestSubmitWithSearch)).toBe(
      `The invited party (invitation invite-1) chose 2026-09-18 to 2026-09-21, 2 adults, 2 children, 0 pets. Place a hold, then confirm it, and tell the guest what happens next in their language.${searchMemoryInstruction}`,
    );
  });

  it("leaves the name-free no-notify instruction unchanged on guest_submit and guest_change prompts", () => {
    const noNotifyInstruction =
      " Do not call notify. The application delivers the outcome through the private link.";
    const guestSubmitPrompt = `The invited party (invitation invite-1) chose 2026-09-18 to 2026-09-21, 2 adults, 2 children, 0 pets, arrival not given, notes: none. Place a hold, then confirm it, and tell the guest what happens next in their language.${noNotifyInstruction}`;
    const guestChangePrompt = `The invited party asks to change visit visit-1: """Move us one day later""". Use find_visit_options if dates are unclear, then reschedule_visit.${noNotifyInstruction}`;

    // The arrival/notes segment is still stripped as before; only the
    // no-notify addition at the end is asserted to survive untouched.
    expect(minimizeProviderPrompt(guestSubmitPrompt)).toBe(
      `The invited party (invitation invite-1) chose 2026-09-18 to 2026-09-21, 2 adults, 2 children, 0 pets. Place a hold, then confirm it, and tell the guest what happens next in their language.${noNotifyInstruction}`,
    );
    expect(minimizeProviderPrompt(guestChangePrompt)).toBe(guestChangePrompt);
    expect(guestSubmitPrompt).not.toMatch(/\b(Vega|Marta|Nel)\b/);
    expect(guestChangePrompt).not.toMatch(/\b(Vega|Marta|Nel)\b/);
  });

  it("leaves the name-free memory-name-steer instruction unchanged on guest_submit and guest_change prompts", () => {
    const nameSteerInstruction =
      ' Memory search results and earlier turns in this conversation may contain personal names. In your own reply, refer to this family only as "this family", never by name.';
    const noNotifyInstruction =
      " Do not call notify. The application delivers the outcome through the private link.";
    const guestSubmitPrompt = `The invited party (invitation invite-1) chose 2026-09-18 to 2026-09-21, 2 adults, 2 children, 0 pets, arrival not given, notes: none. Place a hold, then confirm it, and tell the guest what happens next in their language.${nameSteerInstruction}${noNotifyInstruction}`;
    const guestChangePrompt = `The invited party asks to change visit visit-1: """Move us one day later""". Use find_visit_options if dates are unclear, then reschedule_visit.${nameSteerInstruction}${noNotifyInstruction}`;

    expect(minimizeProviderPrompt(guestSubmitPrompt)).toBe(
      `The invited party (invitation invite-1) chose 2026-09-18 to 2026-09-21, 2 adults, 2 children, 0 pets. Place a hold, then confirm it, and tell the guest what happens next in their language.${nameSteerInstruction}${noNotifyInstruction}`,
    );
    expect(minimizeProviderPrompt(guestChangePrompt)).toBe(guestChangePrompt);
    expect(guestSubmitPrompt).not.toMatch(/\b(Vega|Marta|Nel)\b/);
    expect(guestChangePrompt).not.toMatch(/\b(Vega|Marta|Nel)\b/);
  });

  it("still strips arrival and notes from a name-free guest_submit prompt", () => {
    const prompt =
      "The invited party (invitation invite-1) chose 2026-09-18 to 2026-09-21, 2 adults, 2 children, 0 pets, arrival 18:00, notes: Marta needs step-free access. Place a hold, then confirm it, and tell the guest what happens next in their language.";
    expect(minimizeProviderPrompt(prompt)).toBe(
      "The invited party (invitation invite-1) chose 2026-09-18 to 2026-09-21, 2 adults, 2 children, 0 pets. Place a hold, then confirm it, and tell the guest what happens next in their language.",
    );
    expect(minimizeProviderPrompt(prompt)).not.toContain("Marta");
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
