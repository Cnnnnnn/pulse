// @vitest-environment happy-dom
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/preact";
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
    { matchNum: 73, slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" }, slot2: { team: { name: "Switzerland" }, source: "group:B:runnerUp" }, status: "pending" },
    { matchNum: 74, slot1: { team: { name: "Germany" }, source: "group:E:winner" }, slot2: { team: null, source: "best-third-pool", pool: ["A","B","C","D","F"] }, status: "projected" },
  ],
  r16: [{ matchNum: 90, slot1: { team: null, source: "r32:73" }, slot2: { team: null, source: "r32:75" }, status: "projected" }],
  qf: [],
  sf: [],
  final: null,
  third: null,
  thirdPlacedAdvancing: ["E","I","J","K","L","D","F","G"],
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
    // ponytail: v1 fallback 5 段堆叠 - 1/16 / 1/8 / 1/4 / 半决赛 / 决赛&季军赛
    expect(container.textContent).toContain("1/16");
    expect(container.textContent).toContain("1/8");
    expect(container.textContent).toContain("1/4");
    expect(container.textContent).toContain("半决赛");
    expect(container.textContent).toContain("决赛");
    expect(container.textContent).toContain("季军赛");
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

describe("WorldcupBracketView + BracketTree integration (v1 fallback)", () => {
  beforeEach(() => {
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
    worldcupBracket.value = sampleSnapshot;
    bracketComputing.value = false;
    bracketError.value = null;
    bracketLastComputedAt.value = 12345;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.window.api;
  });

  test("renders v1 fallback tree (5 stages)", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    expect(container.querySelector(".bracket-tree-fallback")).toBeTruthy();
    expect(container.querySelectorAll(".bracket-tree-fallback .bracket-stage").length).toBe(5);
  });

  test("renders all R32 cards from sample", async () => {
    const bigR32 = Array.from({ length: 16 }, (_, i) => ({
      matchNum: 73 + i,
      slot1: { team: { name: `T${i}A` }, source: `group:A:winner` },
      slot2: { team: { name: `T${i}B` }, source: `group:B:winner` },
      status: "pending",
    }));
    mockComputeImpl = async () => ({ ok: true, snapshot: { ...sampleSnapshot, r32: bigR32, computedAt: Date.now() } });
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    const r32Section = container.querySelector(".bracket-stage--r32");
    expect(r32Section).toBeTruthy();
    expect(r32Section.querySelectorAll(".bracket-card")).toHaveLength(16);
  });

  test("match card click opens SquadModal with bracket match data", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    const firstCard = container.querySelector(".bracket-card");
    fireEvent.click(firstCard);
    // SquadModal uses usePortal → renders into document.body, not container.
    await waitFor(() => expect(document.body.querySelector(".modal-card")).toBeTruthy());
    const modal = document.body.querySelector(".modal-card");
    expect(modal.textContent).toContain("South Africa");
    expect(modal.textContent).toContain("Switzerland");
  });

  test("kickoff meta shows when snapshot has kickoff data", async () => {
    const snapshotWithKickoff = {
      ...sampleSnapshot,
      r32: [
        {
          matchNum: 73,
          slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" },
          slot2: { team: { name: "Switzerland" }, source: "group:B:runnerUp" },
          status: "pending",
          kickoff: { date: "2026-06-28", time: "20:00", timezone: "UTC+8", venue: "Los Angeles (Inglewood)" },
        },
      ],
    };
    mockComputeImpl = async () => ({ ok: true, snapshot: snapshotWithKickoff });
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    // 北京时间 + 球场中文翻译
    expect(container.textContent).toContain("北京时间");
    expect(container.textContent).toContain("洛杉矶 SoFi 体育场");
  });

  test("no kickoff meta row when card has no kickoff data (no regression)", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    // sampleSnapshot 没有 kickoff 字段, 不应该渲染 .bracket-card-meta
    expect(container.querySelector(".bracket-card-meta")).toBeNull();
  });
});

describe("WorldcupBracketView v2.61 warning filter", () => {
  beforeEach(() => {
    if (testStartOffset === undefined) testStartOffset = Date.now() + 31_000;
    const offset = testStartOffset;
    testStartOffset += 31_000;
    vi.useFakeTimers();
    vi.setSystemTime(offset);
    computeCalls = 0;
    loadCalls = 0;
    mockComputeImpl = async () => ({ ok: true, snapshot: { ...sampleSnapshot, computedAt: Date.now() } });
    global.window.api = {
      worldcupComputeBracket: async (...args) => { computeCalls += 1; return mockComputeImpl(...args); },
      worldcupLoadBracket: async () => { loadCalls += 1; return { ok: true, snapshot: sampleSnapshot }; },
    };
    worldcupBracket.value = sampleSnapshot;
    bracketComputing.value = false;
    bracketError.value = null;
    bracketLastComputedAt.value = 12345;
  });
  afterEach(() => { vi.useRealTimers(); delete global.window.api; });

  test("filters informational warnings (bracket_partial + annexC_row_X)", async () => {
    const noisySnapshot = {
      ...sampleSnapshot,
      warnings: [
        "simplified_annex_c_default_row",
        "annexC_row_3",
        "bracket_partial_25_of_32",
      ],
    };
    mockComputeImpl = async () => ({ ok: true, snapshot: noisySnapshot });
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    // 不应该出现警告数
    expect(container.querySelector(".bracket-warnings")).toBeNull();
  });

  test("keeps real warnings (finals_fetch_failed)", async () => {
    const realWarnSnapshot = {
      ...sampleSnapshot,
      warnings: ["finals_fetch_failed"],
    };
    mockComputeImpl = async () => ({ ok: true, snapshot: realWarnSnapshot });
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    expect(container.querySelector(".bracket-warnings")).toBeTruthy();
  });
});