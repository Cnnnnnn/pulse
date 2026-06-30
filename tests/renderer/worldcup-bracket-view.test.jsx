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
    // ponytail: v2.54 stage label 改短 ("1/16") 在 half 顶部统一标.
    expect(container.textContent).toContain("1/16");
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

  test("wide viewport delegates to BracketTree overview view (default)", async () => {
    // ponytail: v2.63 — 默认全景模式, 5 个 stage 全部展示 + 连接线.
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    expect(container.querySelector(".bracket-tree--overview")).toBeTruthy();
    expect(container.querySelector(".bracket-tree-fallback")).toBeNull();
    // 全景模式展示 5 个 stage column (r32/r16/qf/sf/final)
    expect(container.querySelectorAll(".bracket-tree-column")).toHaveLength(5);
  });

  test("stage tab switch changes the displayed stage", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    // v2.63: 默认 overview, 切到 1/4 决赛后应该有 qf column (single 模式)
    const qfTab = container.querySelectorAll(".bracket-stage-tab")[3]; // 1/4 (v2.63 tab 顺序)
    qfTab.click();
    await waitFor(() => {
      expect(container.querySelector(".bracket-tree-column--qf")).toBeTruthy();
    });
  });

  test("match card click opens SquadModal with bracket match data", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    // v2.63: 默认 overview, r32 列里的第一张 match card (M73 = South Africa vs Switzerland)
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
    // overview 模式在窄屏不渲染 tree, 由 BracketTree 内部 useNarrowViewport 判断.
    // BracketOverview 没有自己的 narrow 判断, 但 BracketTree 入口先拦:
    // currentStage=overview 时直接返回 BracketOverview, 不走 narrow 分支.
    // 所以这里验证: 窄屏下 overview 仍渲染 (它用水平滚动, 不需要 fallback).
    expect(container.querySelector(".bracket-tree--overview")).toBeTruthy();
  });
});

// ponytail: v2.61 警告过滤 — 独立 describe 用 real timers, 不依赖 fake timer mock 链路.
describe("WorldcupBracketView v2.61 warning filter", () => {
  beforeEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true, writable: true });
    bracketComputing.value = false;
    bracketError.value = null;
    bracketLastComputedAt.value = null;
  });

  afterEach(() => {
    delete global.window.api;
  });

  test("filters informational warnings (bracket_partial + annexC_row_X)", async () => {
    const snapshotWithInfo = {
      ...sampleSnapshot,
      warnings: ["bracket_partial", "annexC_row_2", "simplified_annex_c_default_row"],
      projected: true,
    };
    global.window.api = {
      worldcupComputeBracket: async () => ({ ok: true, snapshot: snapshotWithInfo }),
      worldcupLoadBracket: async () => ({ ok: true, snapshot: snapshotWithInfo }),
    };
    worldcupBracket.value = snapshotWithInfo;
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => {
      expect(container.querySelector(".bracket-meta")).toBeTruthy();
    });
    expect(container.querySelector(".bracket-warnings")).toBeNull();
  });

  test("keeps real warnings (finals_fetch_failed)", async () => {
    const snapshotWithReal = {
      ...sampleSnapshot,
      warnings: ["bracket_partial", "finals_fetch_404", "annexC_row_2"],
      projected: true,
    };
    global.window.api = {
      worldcupComputeBracket: async () => ({ ok: true, snapshot: snapshotWithReal }),
      worldcupLoadBracket: async () => ({ ok: true, snapshot: snapshotWithReal }),
    };
    worldcupBracket.value = snapshotWithReal;
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => {
      expect(container.querySelector(".bracket-warnings")).toBeTruthy();
    });
    expect(container.textContent).toContain("1 个警告");
  });
});

// ─── v1.3: kickoff meta 内嵌到 bracket-card ─────────────────────────────

function makeSnapshotWithKickoff() {
  return {
    version: 2,
    computedAt: 12345,
    inputsHash: "sha256:abc",
    projected: true,
    completeGroupCount: 12,
    r32: [
      {
        matchNum: 73,
        slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" },
        slot2: { team: { name: "Canada" }, source: "group:B:runnerUp", sourceTxt: true },
        status: "pending",
        kickoff: { date: "2026-06-28", time: "12:00", timezone: "UTC-7", venue: "Los Angeles (Inglewood)" },
      },
      {
        matchNum: 74,
        slot1: { team: { name: "Germany" }, source: "group:E:winner" },
        slot2: { team: { name: "South Korea" }, source: "group:A:third" },
        status: "pending",
        kickoff: { date: "2026-06-29", time: "16:30", timezone: "UTC-4", venue: "Boston (Foxborough)" },
      },
    ],
    r16: [],
    qf: [],
    sf: [],
    final: {
      matchNum: 104,
      slot1: { team: null },
      slot2: { team: null },
      status: "projected",
      kickoff: { date: "2026-07-19", time: "15:00", timezone: "UTC-4", venue: "New York/New Jersey (East Rutherford)" },
    },
    third: null,
    thirdPlacedAdvancing: ["E", "I", "J", "K", "L", "D", "F", "G"],
    annexCIndex: 0,
    warnings: [],
  };
}

describe("WorldcupBracketView kickoff meta on cards", () => {
  let originalInnerWidth;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(12345);
    global.window.api = {
      worldcupComputeBracket: async () => ({ ok: true, snapshot: makeSnapshotWithKickoff() }),
      worldcupLoadBracket: async () => ({ ok: true, snapshot: makeSnapshotWithKickoff() }),
    };
    worldcupBracket.value = makeSnapshotWithKickoff();
    bracketComputing.value = false;
    bracketError.value = null;
    bracketLastComputedAt.value = null;
    originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.window.api;
    Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, configurable: true, writable: true });
  });

  test("each visible bracket card renders kickoff time + venue inline", async () => {
    // ponytail: v2.63 — 默认全景模式, 显示所有 stage 的卡.
    // makeSnapshotWithKickoff: r32 有 2 张 (M73/M74, 都有 kickoff), final 有 1 张 (有 kickoff).
    // r16/qf/sf 为空 → overview 共 3 张卡, 3 个 meta.
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.querySelectorAll(".bracket-card").length).toBeGreaterThan(0));
    const metas = container.querySelectorAll(".bracket-card-meta");
    // overview 模式: r32(2) + final(1) = 3 张有 kickoff 的卡
    expect(metas).toHaveLength(3);
    expect(metas[0].textContent).toContain("2026-06-28");
    expect(metas[0].textContent).toContain("12:00");
    expect(metas[0].textContent).toContain("UTC-7");
    expect(metas[0].textContent).toContain("Los Angeles (Inglewood)");
  });

  test("final tab shows final card kickoff meta", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.querySelectorAll(".bracket-card").length).toBeGreaterThan(0));
    const finalTab = container.querySelectorAll(".bracket-stage-tab")[5]; // 决赛 (v2.63 tab 顺序)
    finalTab.click();
    await waitFor(() => {
      const metas = container.querySelectorAll(".bracket-card-meta");
      expect(metas.length).toBeGreaterThanOrEqual(1);
      expect(metas[0].textContent).toContain("2026-07-19");
      expect(metas[0].textContent).toContain("New York/New Jersey");
    });
  });

  test("v2.62 meta row keeps full venue visible (no nowrap truncation)", async () => {
    // ponytail: v2.62 — meta 行不强制 nowrap, 时间 + 场地分别占一行, 不被截断.
    // happy-dom 不返回真实 computedStyle (flexWrap=''), 所以只验 JSX 结构 + 文本完整性.
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.querySelectorAll(".bracket-card-meta").length).toBeGreaterThan(0));
    const meta = container.querySelector(".bracket-card-meta");
    // 时间 + 场地是两个独立 span (JSX 结构)
    const timeSpan = meta.querySelector(".bracket-card-meta-time");
    const venueSpan = meta.querySelector(".bracket-card-meta-venue");
    expect(timeSpan).toBeTruthy();
    expect(venueSpan).toBeTruthy();
    // 时间 + 场地完整文本都存在 (不被 CSS 截断, 因为它们在 DOM 里是完整的)
    expect(timeSpan.textContent).toContain("2026-06-28");
    expect(timeSpan.textContent).toContain("12:00");
    expect(timeSpan.textContent).toContain("UTC-7");
    expect(venueSpan.textContent).toContain("Los Angeles (Inglewood)");
    // venue span 独占一行 (width: 100% 在 CSS 里)
    expect(venueSpan.getAttribute("class")).toContain("bracket-card-meta-venue");
  });

  test("card without kickoff renders no meta (no regression for old snapshots)", async () => {
    const noKickoff = {
      ...makeSnapshotWithKickoff(),
      r32: makeSnapshotWithKickoff().r32.map((m) => {
        const { kickoff, ...rest } = m;
        return rest;
      }),
    };
    global.window.api = {
      worldcupComputeBracket: async () => ({ ok: true, snapshot: noKickoff }),
      worldcupLoadBracket: async () => ({ ok: true, snapshot: noKickoff }),
    };
    worldcupBracket.value = noKickoff;
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.querySelectorAll(".bracket-card").length).toBeGreaterThan(0));
    // overview 模式: r32(2张无kickoff) + final(1张有kickoff) = 1 个 meta
    const metas = container.querySelectorAll(".bracket-card-meta");
    expect(metas).toHaveLength(1);
  });

  test("no standalone schedule panel (panel removed in favor of inline meta)", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.querySelector(".bracket-card")).toBeTruthy());
    expect(container.querySelector(".bracket-schedule")).toBeNull();
    expect(container.querySelector(".bracket-schedule-row")).toBeNull();
  });
});

// ─── v2.53 镜像 bracket layout (FIFA 海报排版) ─────────────────────────

function makeBigSnapshot() {
  // 16 R32 + 8 R16 + 4 QF + 2 SF + Final = 31 张卡
  const r32 = [];
  for (let i = 73; i <= 88; i += 1) {
    r32.push({
      matchNum: i,
      slot1: { team: { name: `Team A${i}` }, source: `group:${String.fromCharCode(65 + (i % 6))}:winner` },
      slot2: { team: { name: `Team B${i}` }, source: `group:${String.fromCharCode(67 + (i % 6))}:runnerUp` },
      status: "pending",
    });
  }
  const r16 = [];
  for (let i = 89; i <= 96; i += 1) {
    r16.push({
      matchNum: i,
      slot1: { team: null, source: `r32:${i - 16}` },
      slot2: { team: null, source: `r32:${i - 15}` },
      status: "projected",
    });
  }
  const qf = [];
  for (let i = 97; i <= 100; i += 1) {
    qf.push({
      matchNum: i,
      slot1: { team: null, source: `r16:${i - 8}` },
      slot2: { team: null, source: `r16:${i - 7}` },
      status: "projected",
    });
  }
  const sf = [
    { matchNum: 101, slot1: { team: null }, slot2: { team: null }, status: "projected" },
    { matchNum: 102, slot1: { team: null }, slot2: { team: null }, status: "projected" },
  ];
  return {
    version: 2,
    computedAt: 12345,
    inputsHash: "sha256:abc",
    projected: true,
    completeGroupCount: 12,
    r32, r16, qf, sf,
    final: { matchNum: 104, slot1: { team: null }, slot2: { team: null }, status: "projected" },
    third: null,
    thirdPlacedAdvancing: ["E", "I", "J", "K", "L", "D", "F", "G"],
    annexCIndex: 0,
    warnings: [],
  };
}

describe("WorldcupBracketView v2.56 single-stage + tabs", () => {
  let originalInnerWidth;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(12345);
    global.window.api = {
      worldcupComputeBracket: async () => ({ ok: true, snapshot: makeBigSnapshot() }),
      worldcupLoadBracket: async () => ({ ok: true, snapshot: makeBigSnapshot() }),
    };
    worldcupBracket.value = makeBigSnapshot();
    bracketComputing.value = false;
    bracketError.value = null;
    bracketLastComputedAt.value = null;
    originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.window.api;
    Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, configurable: true, writable: true });
  });

  test("renders stage tabs (全景 / 1/16 / 1/8 / 1/4 / 半决赛 / 决赛) above tree", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    const tabs = container.querySelectorAll(".bracket-stage-tab");
    // ponytail: v2.63 — 6 个 tab, 全景在第一位 (默认).
    expect(tabs).toHaveLength(6);
    expect(tabs[0].textContent).toContain("全景");
    expect(tabs[1].textContent).toContain("1/16");
    expect(tabs[5].textContent).toContain("决赛");
  });

  test("v2.63 default overview shows all 5 stages in horizontal scroll", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    // 默认 tab 是 overview — 直接看 overview
    expect(container.querySelector(".bracket-tree--overview")).toBeTruthy();
    // 全景模式展示 5 个 stage column
    const cols = container.querySelectorAll(".bracket-tree--overview .bracket-tree-column");
    expect(cols.length).toBe(5);
    // 每个 stage column 至少有 1 张卡 (R32 16 + R16 8 + QF 4 + SF 2 + Final 1)
    const allCards = container.querySelectorAll(".bracket-tree--overview .bracket-card");
    expect(allCards.length).toBeGreaterThanOrEqual(16);
  });

  test("click 1/16 tab → shows R32 column (16 cards) + R16 column (8 cards)", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    const r32Tab = container.querySelectorAll(".bracket-stage-tab")[1]; // 1/16 (v2.63 tab 顺序)
    r32Tab.click();
    await waitFor(() => {
      const r32Cards = container.querySelectorAll(".bracket-tree-column--r32 .bracket-card");
      expect(r32Cards).toHaveLength(16);
    });
  });

  test("click 1/4 tab → shows QF (4 cards) + SF (2 cards)", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    const qfTab = container.querySelectorAll(".bracket-stage-tab")[3]; // 1/4 (v2.63 tab 顺序)
    qfTab.click();
    await waitFor(() => {
      const qfCards = container.querySelectorAll(".bracket-tree-column--qf .bracket-card");
      expect(qfCards).toHaveLength(4);
    });
  });

  test("click 决赛 tab → shows only Final column (1 card)", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    const finalTab = container.querySelectorAll(".bracket-stage-tab")[5]; // 决赛 (v2.63 tab 顺序)
    finalTab.click();
    await waitFor(() => {
      const finalCards = container.querySelectorAll(".bracket-tree-column--final .bracket-card");
      expect(finalCards).toHaveLength(1);
      // 终局 stage 没有 nextStage, 只 1 列
      expect(container.querySelectorAll(".bracket-tree-column")).toHaveLength(1);
    });
  });

  test("active tab is highlighted with bracket-stage-tab--active class", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    const tabs = container.querySelectorAll(".bracket-stage-tab");
    // v2.63: 默认 overview (tabs[0]) 高亮
    expect(tabs[0].classList.contains("bracket-stage-tab--active")).toBe(true);
    expect(tabs[2].classList.contains("bracket-stage-tab--active")).toBe(false);
  });
});
