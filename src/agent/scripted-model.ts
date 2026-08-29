import {
  Model,
  ModelContentBlockDeltaEvent,
  ModelContentBlockStartEvent,
  ModelContentBlockStopEvent,
  ModelMessageStartEvent,
  ModelMessageStopEvent,
  type BaseModelConfig,
  type Message,
  type ModelStreamEvent,
  type StreamOptions,
} from "@strands-agents/sdk";

export type ScriptStep =
  | { text: string }
  | { toolUse: { name: string; input: unknown } };

export class ScriptedModel extends Model<BaseModelConfig> {
  private index = 0;
  private config: BaseModelConfig = { modelId: "scripted" };

  constructor(private readonly steps: readonly ScriptStep[]) {
    super();
  }

  updateConfig(config: Partial<BaseModelConfig>): void {
    this.config = { ...this.config, ...config, modelId: "scripted" };
  }

  getConfig(): BaseModelConfig {
    return { ...this.config };
  }

  async *stream(
    messages: Message[],
    options?: StreamOptions,
  ): AsyncIterable<ModelStreamEvent> {
    void messages;
    void options;
    const step = this.steps[this.index++];
    if (!step) throw new Error("ScriptedModel has no step left");

    if ("text" in step) {
      yield new ModelMessageStartEvent({
        type: "modelMessageStartEvent",
        role: "assistant",
      });
      yield new ModelContentBlockDeltaEvent({
        type: "modelContentBlockDeltaEvent",
        delta: { type: "textDelta", text: step.text },
      });
      yield new ModelContentBlockStopEvent({
        type: "modelContentBlockStopEvent",
      });
      yield new ModelMessageStopEvent({
        type: "modelMessageStopEvent",
        stopReason: "endTurn",
      });
      return;
    }

    yield new ModelMessageStartEvent({
      type: "modelMessageStartEvent",
      role: "assistant",
    });
    yield new ModelContentBlockStartEvent({
      type: "modelContentBlockStartEvent",
      start: {
        type: "toolUseStart",
        name: step.toolUse.name,
        toolUseId: `scripted-${this.index}`,
      },
    });
    yield new ModelContentBlockDeltaEvent({
      type: "modelContentBlockDeltaEvent",
      delta: {
        type: "toolUseInputDelta",
        input: JSON.stringify(step.toolUse.input),
      },
    });
    yield new ModelContentBlockStopEvent({
      type: "modelContentBlockStopEvent",
    });
    yield new ModelMessageStopEvent({
      type: "modelMessageStopEvent",
      stopReason: "toolUse",
    });
  }
}
