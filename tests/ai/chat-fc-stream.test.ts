import { describe, expect, it } from "vitest";
import {
  applyAnthropicStreamEvent,
  createAnthropicStreamState,
  mergeToolCallDelta,
} from "../../src/ai/chat-fc-stream";

describe("chat-fc-stream anthropic", () => {
  it("applyAnthropicStreamEvent streams text and tool_use", () => {
    const state = createAnthropicStreamState();
    const deltas: string[] = [];
    applyAnthropicStreamEvent(
      {
        type: "content_block_start",
        content_block: { type: "tool_use", id: "toolu_1", name: "pulse_open" },
      },
      state,
      (d) => deltas.push(d),
    );
    applyAnthropicStreamEvent(
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "好的" },
      },
      state,
      (d) => deltas.push(d),
    );
    applyAnthropicStreamEvent(
      {
        type: "content_block_delta",
        delta: {
          type: "input_json_delta",
          partial_json: '{"href":"pulse://nav/movies"}',
        },
      },
      state,
    );
    applyAnthropicStreamEvent({ type: "content_block_stop" }, state);
    expect(deltas.join("")).toBe("好的");
    expect(state.tools).toHaveLength(1);
    expect(state.tools[0].name).toBe("pulse_open");
    expect(JSON.parse(state.tools[0].inputJson)).toEqual({
      href: "pulse://nav/movies",
    });
  });
});

describe("chat-fc-stream openai", () => {
  it("mergeToolCallDelta assembles fragmented tool call arguments", () => {
    const acc = new Map<number, { id?: string; name?: string; arguments: string }>();
    mergeToolCallDelta(acc, [
      {
        index: 0,
        id: "call_1",
        function: { name: "pulse_open", arguments: '{"href":' },
      },
    ]);
    mergeToolCallDelta(acc, [
      {
        index: 0,
        function: { arguments: '"pulse://nav/movies"}' },
      },
    ]);
    const entry = acc.get(0);
    expect(entry?.name).toBe("pulse_open");
    expect(JSON.parse(entry?.arguments || "{}")).toEqual({
      href: "pulse://nav/movies",
    });
  });
});
