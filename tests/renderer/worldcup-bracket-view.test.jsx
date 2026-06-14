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

describe("WorldcupBracketView + BracketTree integration", () => {
  let originalInnerWidth;

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
    bracketLastComputedAt.value = null;
    // happy-dom 的 default innerWidth 在 1024 左右, 这里显式锁定为 wide 模式,
    // 单个 narrow 测试里再覆盖. defensive restore: 保存原始值.
    originalInnerWidth = (typeof window !== "undefined" && window.innerWidth) || 1024;
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.window.api;
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, configurable: true, writable: true });
    }
  });

  test("wide viewport delegates to BracketTree horizontal tree", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    // BracketTree 渲染其 5-列水平布局容器
    expect(container.querySelector(".bracket-tree")).toBeTruthy();
    // 不会渲染 narrow fallback
    expect(container.querySelector(".bracket-tree-fallback")).toBeNull();
    // 5 个 stage column (R32 / R16 / QF / SF / Final+Third) 都存在
    expect(container.querySelectorAll(".bracket-tree-column")).toHaveLength(5);
  });

  test("match card click opens SquadModal with bracket match data", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    // 点击 R32 列里的第一张 match card (M73 = South Africa vs Switzerland)
    const firstCard = container.querySelector(".bracket-tree-column--r32 .bracket-card");
    expect(firstCard).toBeTruthy();
    firstCard.click();
    // SquadModal 走 createPortal 渲染到 document.body, 不在 container 里.
    // WorldcupBracketView.handleMatchClick 构造 stage: `Match ${match.matchNum}`,
    // 即 "Match 73"; squad 名显示 South Africa / Switzerland
    await waitFor(() => {
      expect(document.body.textContent).toContain("Match 73");
      expect(document.body.textContent).toMatch(/South Africa/);
      expect(document.body.textContent).toMatch(/Switzerland/);
    });
  });

  test("narrow viewport falls back to vertical stack", async () => {
    // 必须在 render 之前修改 innerWidth, useNarrowViewport 在初次 mount
    // 时同步读 window.innerWidth, 之后才会监听 resize.
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true, writable: true });
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    // tree 隐藏, fallback 渲染
    expect(container.querySelector(".bracket-tree")).toBeNull();
    expect(container.querySelector(".bracket-tree-fallback")).toBeTruthy();
  });
});
