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
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.window.api;
  });

  test("renders without crash with snapshot", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    expect(container.querySelector(".bracket-view")).toBeTruthy();
    // ponytail: v3 — 全屏 bracket tree, 半区列标题显示 "1/16"
    expect(container.textContent).toContain("1/16");
  });

  test("renders empty state when compute returns null snapshot", async () => {
    mockComputeImpl = async () => ({ ok: true, snapshot: null });
    worldcupBracket.value = null;
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    expect(container.textContent).toMatch(/小组赛尚未开始|暂无数据/);
  });

  test("renders no-group-data empty state when no advancing thirds", async () => {
    mockComputeImpl = async () => ({ ok: true, snapshot: { ...sampleSnapshot, thirdPlacedAdvancing: [] } });
    worldcupBracket.value = { ...sampleSnapshot, thirdPlacedAdvancing: [] };
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    expect(container.textContent).toContain("小组赛尚未开始");
    expect(container.querySelector(".bracket-stage")).toBeNull();
  });

  test("renders error state when compute fails", async () => {
    mockComputeImpl = async () => ({ ok: false, reason: "网络错误" });
    bracketError.value = "网络错误";
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

  test("wide viewport renders FIFA bracket tree (no tab)", async () => {
    // ponytail: v3 — 默认就是一整张 bracket tree, 没有 stage tab 切换.
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    expect(container.querySelector(".bracket-tree--tree")).toBeTruthy();
    expect(container.querySelector(".bracket-tree-fallback")).toBeNull();
    // 没有 .bracket-stage-tabs (v3 删了 tab)
    expect(container.querySelector(".bracket-stage-tabs")).toBeNull();
  });

  test("match card click opens SquadModal with bracket match data", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    // 上半区 R32 列里第一张 match card (M73 = South Africa vs Switzerland)
    const firstCard = container.querySelector(".bracket-tree-half--upper .bracket-tree-column--r32 .bracket-card");
    expect(firstCard).toBeTruthy();
    firstCard.click();
    await waitFor(() => {
      expect(document.body.textContent).toContain("Match 73");
      expect(document.body.textContent).toMatch(/South Africa/);
      expect(document.body.textContent).toMatch(/Switzerland/);
    });
  });

  test("narrow viewport falls back to vertical stack", async () => {
    Object.defineProperty(window, "innerWidth", { value: 600, configurable: true, writable: true });
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(computeCalls).toBeGreaterThanOrEqual(1));
    expect(container.querySelector(".bracket-tree-fallback")).toBeTruthy();
    expect(container.querySelector(".bracket-tree--tree")).toBeNull();
  });
});

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
    // ponytail: v3 — 一整张 bracket tree, 上半 R32(2张) + 下半 R32(空) + Final(1张) + Third 占位.
    // r32 有 2 张 (M73/M74, 都有 kickoff), final 有 1 张 (有 kickoff) = 3 metas.
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.querySelectorAll(".bracket-card").length).toBeGreaterThan(0));
    const metas = container.querySelectorAll(".bracket-card-meta");
    expect(metas).toHaveLength(3);
    expect(metas[0].textContent).toContain("2026-06-28");
    expect(metas[0].textContent).toContain("12:00");
    expect(metas[0].textContent).toContain("UTC-7");
    expect(metas[0].textContent).toContain("Los Angeles (Inglewood)");
  });

  test("final card kickoff meta is visible by default (no tab needed)", async () => {
    // ponytail: v3 — 一整张 bracket tree 默认就显示 Final (中央奖杯卡).
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.querySelectorAll(".bracket-card").length).toBeGreaterThan(0));
    // Final 奖杯卡包含 kickoff meta
    await waitFor(() => {
      const finalCard = container.querySelector(".bracket-final-card");
      expect(finalCard).toBeTruthy();
      expect(finalCard.textContent).toContain("2026-07-19");
      expect(finalCard.textContent).toContain("New York/New Jersey");
    });
  });

  test("v2.62 meta row keeps full venue visible (no nowrap truncation)", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.querySelectorAll(".bracket-card-meta").length).toBeGreaterThan(0));
    const meta = container.querySelector(".bracket-card-meta");
    const timeSpan = meta.querySelector(".bracket-card-meta-time");
    const venueSpan = meta.querySelector(".bracket-card-meta-venue");
    expect(timeSpan).toBeTruthy();
    expect(venueSpan).toBeTruthy();
    expect(timeSpan.textContent).toContain("2026-06-28");
    expect(timeSpan.textContent).toContain("12:00");
    expect(timeSpan.textContent).toContain("UTC-7");
    expect(venueSpan.textContent).toContain("Los Angeles (Inglewood)");
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
    // R32 无 kickoff + final 有 kickoff = 1 个 meta (final 那张)
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

// ─── v3: 镜像 bracket layout (FIFA 海报排版) ─────────────────────────

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

describe("WorldcupBracketView v3 FIFA bracket tree", () => {
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

  test("v3 default tree shows all R32 cards split upper + lower half", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.querySelector(".bracket-tree--tree")).toBeTruthy());
    // 上半 R32 = 8 张 (M73..M80), 下半 R32 = 8 张 (M81..M88)
    const upperR32Cards = container.querySelectorAll(".bracket-tree-half--upper .bracket-tree-column--r32 .bracket-card");
    const lowerR32Cards = container.querySelectorAll(".bracket-tree-half--lower .bracket-tree-column--r32 .bracket-card");
    expect(upperR32Cards).toHaveLength(8);
    expect(lowerR32Cards).toHaveLength(8);
  });

  test("v3 default tree shows Final trophy card by default (no tab)", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.querySelector(".bracket-final-card")).toBeTruthy());
    expect(container.querySelector(".bracket-final-card").textContent).toContain("决");
  });

  test("v3 default tree has no stage tabs", async () => {
    const { container } = render(<WorldcupBracketView />);
    await waitFor(() => expect(container.querySelector(".bracket-tree--tree")).toBeTruthy());
    expect(container.querySelector(".bracket-stage-tabs")).toBeNull();
    expect(container.querySelectorAll(".bracket-stage-tab").length).toBe(0);
  });
});