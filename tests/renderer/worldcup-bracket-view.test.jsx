// @vitest-environment happy-dom
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/preact";
import { WorldcupBracketView } from "../../src/renderer/worldcup/WorldcupBracketView.jsx";
import {
  worldcupBracket,
  bracketComputing,
  bracketError,
  bracketLastComputedAt,
} from "../../src/renderer/worldcup/bracketStore.js";

const sampleSnapshot = {
  version: 1,
  computedAt: 12345,
  inputsHash: "sha256:abc",
  projected: true,
  completeGroupCount: 4,
  r32: [
    {
      matchNum: 73,
      slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" },
      slot2: { team: { name: "Switzerland" }, source: "group:B:runnerUp" },
      status: "pending",
    },
    {
      matchNum: 74,
      slot1: { team: { name: "Germany" }, source: "group:E:winner" },
      slot2: { team: null, source: "best-third-pool", pool: ["A", "B", "C", "D", "F"] },
      status: "projected",
    },
  ],
  r16: [
    {
      matchNum: 90,
      slot1: { team: null, source: "r32:73" },
      slot2: { team: null, source: "r32:75" },
      status: "projected",
    },
  ],
  qf: [],
  sf: [],
  final: null,
  third: null,
  thirdPlacedAdvancing: ["E", "I", "J", "K", "L", "D", "F", "G"],
  annexCIndex: 0,
  warnings: ["simplified_annex_c_default_row"],
};

let computeCalls;
let loadCalls;
let mockComputeImpl;
let testStartOffset;

describe("WorldcupBracketView smoke", () => {
  beforeEach(() => {
    // 每个 test 把时间推后 31s, 保证 store 模块级 lastAutoComputeAt 不影响下个 test
    if (testStartOffset === undefined) testStartOffset = Date.now() + 31_000;
    const offset = testStartOffset;
    testStartOffset += 31_000;
    vi.useFakeTimers();
    vi.setSystemTime(offset);
    computeCalls = 0;
    loadCalls = 0;
    mockComputeImpl = async () => ({ ok: true, snapshot: { ...sampleSnapshot, computedAt: Date.now() } });
    global.window.api = {
      worldcupComputeBracket: async (...args) => {
        computeCalls += 1;
        return mockComputeImpl(...args);
      },
      worldcupLoadBracket: async () => {
        loadCalls += 1;
        return { ok: true, snapshot: sampleSnapshot };
      },
    };
    // 初始化 store signals
    worldcupBracket.value = sampleSnapshot;
    bracketComputing.value = false;
    bracketError.value = null;
    bracketLastComputedAt.value = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.window.api;
  });

  test("renders without crash with snapshot", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    expect(container.querySelector(".bracket-view")).toBeTruthy();
    expect(container.textContent).toContain("1/16 决赛");
  });

  test("renders empty state when compute returns null snapshot", async () => {
    mockComputeImpl = async () => ({ ok: true, snapshot: null });
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    expect(container.textContent).toMatch(/小组赛尚未开始|暂无数据/);
  });

  test("renders no-group-data empty state when no advancing thirds", async () => {
    mockComputeImpl = async () => ({ ok: true, snapshot: { ...sampleSnapshot, thirdPlacedAdvancing: [] } });
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    expect(container.textContent).toContain("小组赛尚未开始");
    expect(container.querySelector(".bracket-stage")).toBeNull();
  });

  test("renders error state when compute fails", async () => {
    mockComputeImpl = async () => ({ ok: false, reason: "网络错误" });
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.textContent).toContain("网络错误"));
  });

  test("mount triggers compute + load via IPC", async () => {
    render(<WorldcupBracketView />);
    await waitFor(() => {
      expect(computeCalls).toBeGreaterThanOrEqual(1);
      expect(loadCalls).toBeGreaterThanOrEqual(1);
    });
  });
});
