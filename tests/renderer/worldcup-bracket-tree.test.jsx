// @vitest-environment happy-dom
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/preact";

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
  r16: [
    { matchNum: 90, slot1: { team: null, source: "r32:73" }, slot2: { team: null, source: "r32:75" }, status: "projected" },
  ],
  qf: [],
  sf: [],
  final: null,
  third: null,
  thirdPlacedAdvancing: ["E","I","J","K","L","D","F","G"],
  annexCIndex: 0,
  warnings: ["simplified_annex_c_default_row"],
};

// ponytail: 当前 BracketTree 始终走 v1 fallback (5 段垂直堆叠),
// 不再尝试 horizontal tree / 双行卡 / 中央奖杯卡.
describe("BracketTree (fallback only)", () => {
  let BracketTree;
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../../src/renderer/worldcup/teams-data.js", () => ({
      displayTeam: (name) => name ? { flag: 'XX', cn: name } : null,
    }));
    global.window = { api: { worldcupComputeBracket: async () => ({ ok: true, snapshot: null }), worldcupLoadBracket: async () => ({ ok: true, snapshot: null }) } };
    Object.defineProperty(global.window, "innerWidth", { value: 1200, configurable: true, writable: true });
    const mod = await import("../../src/renderer/worldcup/BracketTree.jsx");
    BracketTree = mod.BracketTree;
  });
  afterEach(() => {
    delete global.window;
    vi.doUnmock("../../src/renderer/worldcup/teams-data.js");
  });

  test("renders 5 stage sections (r32, r16, qf, sf, finals)", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    expect(container.querySelector(".bracket-tree-fallback")).toBeTruthy();
    const sections = container.querySelectorAll(".bracket-tree-fallback .bracket-stage");
    expect(sections.length).toBe(5);
  });

  test("each stage section renders the correct label", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    expect(container.textContent).toContain("1/16 决赛");
    expect(container.textContent).toContain("1/8 决赛");
    expect(container.textContent).toContain("1/4 决赛");
    expect(container.textContent).toContain("半决赛");
    expect(container.textContent).toContain("决赛");
    expect(container.textContent).toContain("季军赛");
  });

  test("R32 section shows 2 match cards from sample", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const r32Section = container.querySelector(".bracket-stage--r32");
    expect(r32Section).toBeTruthy();
    expect(r32Section.querySelectorAll(".bracket-card")).toHaveLength(2);
  });

  test("renders MatchCards with team1 (left) + vs + team2 (right)", () => {
    // ponytail: fallback 用单行布局, 队1 在左, vs 居中, 队2 在右.
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const card = container.querySelector(".bracket-card");
    expect(card).toBeTruthy();
    const teams = card.querySelectorAll(".bracket-card-team");
    expect(teams).toHaveLength(2);
    const vs = card.querySelector(".bracket-card-vs");
    expect(vs).toBeTruthy();
    expect(vs.textContent).toContain("vs");
  });

  test("R16 large-stage splits into two halves (≥8 cards uses bracket-fallback-split)", () => {
    const bigR32 = Array.from({ length: 16 }, (_, i) => ({
      matchNum: 73 + i,
      slot1: { team: { name: `T${i}A` }, source: `group:A:winner` },
      slot2: { team: { name: `T${i}B` }, source: `group:B:winner` },
      status: "pending",
    }));
    const { container } = render(<BracketTree snapshot={{ ...sampleSnapshot, r32: bigR32 }} onMatchClick={() => {}} />);
    const r32Section = container.querySelector(".bracket-stage--r32");
    // ponytail: 16 张拆上下半 (2 个 .bracket-fallback-half)
    expect(r32Section.querySelectorAll(".bracket-fallback-half")).toHaveLength(2);
    const halves = r32Section.querySelectorAll(".bracket-fallback-half");
    expect(halves[0].querySelectorAll(".bracket-card")).toHaveLength(8);
    expect(halves[1].querySelectorAll(".bracket-card")).toHaveLength(8);
  });

  test("empty stages show '小组赛尚未确定对阵' message", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const qfSection = container.querySelector(".bracket-stage--qf");
    expect(qfSection).toBeTruthy();
    expect(qfSection.classList.contains("bracket-stage--empty")).toBe(true);
    expect(qfSection.textContent).toContain("小组赛尚未确定对阵");
  });

  test("matchNum rendered in 'Match 73' format", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const cardNums = container.querySelectorAll(".bracket-card-num");
    expect(cardNums[0].textContent).toContain("Match 73");
  });

  test("placeholder for slots without team shows 'A 组第 1' format", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    // M74 slot2 是 best-third-pool placeholder
    expect(container.textContent).toContain("第 3 名");
    expect(container.textContent).toContain("A/B/C/D/F");
  });

  test("renders Final and Third in a single 'finals' section when both present", () => {
    const snapshot = {
      ...sampleSnapshot,
      final: { matchNum: 104, slot1: { team: { name: "Brazil" }, source: "sf:101" }, slot2: { team: { name: "France" }, source: "sf:102" }, status: "pending" },
      third: { matchNum: 103, slot1: { team: null, source: "sf:101-loser" }, slot2: { team: null, source: "sf:102-loser" }, status: "projected" },
    };
    const { container } = render(<BracketTree snapshot={snapshot} onMatchClick={() => {}} />);
    const finalsSection = container.querySelector(".bracket-stage--finals");
    expect(finalsSection).toBeTruthy();
    expect(finalsSection.querySelectorAll(".bracket-card")).toHaveLength(2);
  });

  test("clicking a card calls onMatchClick", () => {
    const onMatchClick = vi.fn();
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={onMatchClick} />);
    const firstCard = container.querySelector(".bracket-card");
    firstCard.click();
    expect(onMatchClick).toHaveBeenCalledTimes(1);
    expect(onMatchClick.mock.calls[0][0].matchNum).toBe(73);
  });

  test("v2.65 card shows score (ft[0] : ft[1]) when status=final and score.ft is set", () => {
    const finalSnap = {
      ...sampleSnapshot,
      r32: [
        {
          matchNum: 73,
          slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" },
          slot2: { team: { name: "Canada" }, source: "group:B:runnerUp" },
          status: "final",
          score: { ft: [0, 1], ht: [0, 0], status: "final" },
        },
      ],
    };
    const { container } = render(<BracketTree snapshot={finalSnap} onMatchClick={() => {}} />);
    const score = container.querySelector(".bracket-card-score");
    expect(score).toBeTruthy();
    expect(score.textContent).toContain("0");
    expect(score.textContent).toContain("1");
    // winner (away=1) gets leader styling
    const nums = score.querySelectorAll(".bracket-card-score-num");
    expect(nums[0].classList.contains("is-leader")).toBe(false);
    expect(nums[1].classList.contains("is-leader")).toBe(true);
  });

  test("v2.64 card shows 'vs' when no score (status=pending)", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const card = container.querySelector(".bracket-card");
    expect(card.querySelector(".bracket-card-vs")).toBeTruthy();
    expect(card.querySelector(".bracket-card-score")).toBeNull();
  });

  test("v2.64 card header shows match num + status badge", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const head = container.querySelector(".bracket-card-head");
    expect(head).toBeTruthy();
    expect(head.querySelector(".bracket-card-num").textContent).toContain("Match 73");
    expect(head.querySelector(".bracket-badge")).toBeTruthy();
  });

  test("v2.64 kickoff meta line: time + venue (single row)", () => {
    const snap = {
      ...sampleSnapshot,
      r32: [{
        matchNum: 73,
        slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" },
        slot2: { team: { name: "Switzerland" }, source: "group:B:runnerUp" },
        status: "pending",
        kickoff: { date: "2026-06-28", time: "20:00", timezone: "UTC+8", venue: "Boston (Foxborough)" },
      }],
    };
    const { container } = render(<BracketTree snapshot={snap} onMatchClick={() => {}} />);
    const meta = container.querySelector(".bracket-card-meta");
    expect(meta).toBeTruthy();
    // 北京时间同日: 20:00 (UTC+8 当地就是北京)
    expect(meta.textContent).toContain("20:00");
    expect(meta.textContent).toContain("北京时间");
    // 球场翻译
    expect(meta.textContent).toContain("波士顿吉列体育场");
  });

  test("v2.65 kickoff meta converts to Beijing time and translates venue to Chinese", () => {
    // 2026-06-28 12:00 UTC-7 (洛杉矶) → 北京 2026-06-29 03:00 (跨日)
    const snap = {
      ...sampleSnapshot,
      r32: [{
        matchNum: 73,
        slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" },
        slot2: { team: { name: "Canada" }, source: "group:B:runnerUp" },
        status: "pending",
        kickoff: { date: "2026-06-28", time: "12:00", timezone: "UTC-7", venue: "Los Angeles (Inglewood)" },
      }],
    };
    const { container } = render(<BracketTree snapshot={snap} onMatchClick={() => {}} />);
    const meta = container.querySelector(".bracket-card-meta");
    expect(meta).toBeTruthy();
    // 北京时间 03:00 (跨日)
    expect(meta.textContent).toContain("03:00");
    expect(meta.textContent).toContain("北京时间");
    // 球场中文
    expect(meta.textContent).toContain("洛杉矶 SoFi 体育场");
    expect(meta.textContent).not.toContain("Los Angeles (Inglewood)");
  });

  test("v2.65 kickoff meta same-day BJ time without (当天) annotation", () => {
    // 12:00 UTC+8 (北京) → 12:00 北京 (同日)
    const snap = {
      ...sampleSnapshot,
      r32: [{
        matchNum: 73,
        slot1: { team: { name: "X" }, source: "group:A:winner" },
        slot2: { team: { name: "Y" }, source: "group:B:winner" },
        status: "pending",
        kickoff: { date: "2026-06-28", time: "12:00", timezone: "UTC+8", venue: "Mexico City" },
      }],
    };
    const { container } = render(<BracketTree snapshot={snap} onMatchClick={() => {}} />);
    const meta = container.querySelector(".bracket-card-meta");
    expect(meta.textContent).toContain("12:00 北京时间");
    // 球场中文化
    expect(meta.textContent).toContain("墨西哥城阿兹特克体育场");
  });

  test("v2.66 team name is cleaned when polluted with 'a.e.t. (...) pen. XXX' string", () => {
    // ponytail: 历史 snapshot 里有些 slot.team.name 被污染. 卡片应只显示真名.
    const snap = {
      ...sampleSnapshot,
      r32: [{
        matchNum: 74,
        slot1: { team: { name: "Germany" }, source: "group:E:winner" },
        slot2: { team: { name: "a.e.t. (1-1, 0-1), 3-4 pen. Paraguay" }, source: "group:D:third" },
        status: "final",
        score: { ft: [1, 1], status: "final" },
      }],
    };
    const { container } = render(<BracketTree snapshot={snap} onMatchClick={() => {}} />);
    const card = container.querySelector(".bracket-card");
    // 不应出现 "a.e.t." 或 "pen." 文本污染 (除了 a.e.t. score tag, 但 card 头部不含)
    expect(card.textContent).toContain("Germany");
    // team 名字区域应只剩 "Paraguay" (displayTeam 找 TEAMS["Paraguay"])
    expect(card.textContent).toContain("Paraguay");
    expect(card.textContent).not.toContain("3-4 pen.");
    expect(card.textContent).not.toContain("pen. Paraguay");
  });

  test("v2.67 M74 polluted name → 'Paraguay' + a.e.t./p. tags (rescued from name)", () => {
    // ponytail: 上游 0 来源, 但污染串本身带 et/pen 比分, 卡片应自救显示.
    const snap = {
      ...sampleSnapshot,
      r32: [{
        matchNum: 74,
        slot1: { team: { name: "Germany" }, source: "group:E:winner" },
        slot2: { team: { name: "a.e.t. (1-1, 0-1), 3-4 pen. Paraguay" }, source: "group:D:third" },
        status: "final",
        score: { ft: [1, 1], status: "final" }, // 故意没 et/pen
      }],
    };
    const { container } = render(<BracketTree snapshot={snap} onMatchClick={() => {}} />);
    const card = container.querySelector(".bracket-card");
    // 卡片头部/主行不应出现 a.e.t. (它是 score tag, 在主行末尾)
    const tags = container.querySelectorAll(".bracket-card-score-tag");
    expect(tags).toHaveLength(2);
    expect(tags[0].textContent).toContain("a.e.t.");
    expect(tags[1].textContent).toContain("p.");
    // 队名清洗: 不出现 "pen. Paraguay"
    expect(card.textContent).not.toContain("pen. Paraguay");
    expect(card.textContent).toContain("Paraguay");
  });

  test("v2.67 M75 'a.e.t. (1-1, 0-0), 2-3 pen. Morocco' → 'Morocco' + a.e.t./p.", () => {
    const snap = {
      ...sampleSnapshot,
      r32: [{
        matchNum: 75,
        slot1: { team: { name: "Netherlands" }, source: "group:F:winner" },
        slot2: { team: { name: "a.e.t. (1-1, 0-0), 2-3 pen. Morocco" }, source: "group:F:third" },
        status: "final",
        score: { ft: [1, 1], status: "final" },
      }],
    };
    const { container } = render(<BracketTree snapshot={snap} onMatchClick={() => {}} />);
    expect(container.textContent).toContain("Morocco");
    expect(container.textContent).not.toContain("pen. Morocco");
    const tags = container.querySelectorAll(".bracket-card-score-tag");
    expect(tags).toHaveLength(2);
  });

  test("v2.66 score renders a.e.t. tag when score.et present", () => {
    const snap = {
      ...sampleSnapshot,
      r32: [{
        matchNum: 74,
        slot1: { team: { name: "Germany" }, source: "group:E:winner" },
        slot2: { team: { name: "Paraguay" }, source: "group:D:third" },
        status: "final",
        score: { ft: [1, 1], et: [1, 2], status: "final" },
      }],
    };
    const { container } = render(<BracketTree snapshot={snap} onMatchClick={() => {}} />);
    const tag = container.querySelector(".bracket-card-score-tag");
    expect(tag).toBeTruthy();
    expect(tag.textContent).toContain("a.e.t.");
  });

  test("v2.66 score renders 'p.' tag when score.pen present", () => {
    const snap = {
      ...sampleSnapshot,
      r32: [{
        matchNum: 74,
        slot1: { team: { name: "Germany" }, source: "group:E:winner" },
        slot2: { team: { name: "Paraguay" }, source: "group:D:third" },
        status: "final",
        score: { ft: [1, 1], et: [1, 1], pen: [3, 4], status: "final" },
      }],
    };
    const { container } = render(<BracketTree snapshot={snap} onMatchClick={() => {}} />);
    const tags = container.querySelectorAll(".bracket-card-score-tag");
    expect(tags).toHaveLength(2);
    expect(tags[0].textContent).toContain("a.e.t.");
    expect(tags[1].textContent).toContain("p.");
  });
});

describe("splitBracketByHalf (保留 API, 不被 fallback 调用)", () => {
  let splitBracketByHalf;
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../../src/renderer/worldcup/teams-data.js", () => ({
      displayTeam: (name) => name ? { flag: 'XX', cn: name } : null,
    }));
    global.window = { api: { worldcupComputeBracket: async () => ({ ok: true, snapshot: null }), worldcupLoadBracket: async () => ({ ok: true, snapshot: null }) } };
    Object.defineProperty(global.window, "innerWidth", { value: 1200, configurable: true, writable: true });
    const mod = await import("../../src/renderer/worldcup/BracketTree.jsx");
    splitBracketByHalf = mod.splitBracketByHalf;
  });
  afterEach(() => {
    delete global.window;
    vi.doUnmock("../../src/renderer/worldcup/teams-data.js");
  });

  test("splits R32 into upper[0..7] and lower[8..15]", () => {
    const halves = splitBracketByHalf({
      ...sampleSnapshot,
      r32: Array.from({ length: 16 }, (_, i) => ({ matchNum: 73 + i, slot1: {}, slot2: {}, status: "pending" })),
    });
    expect(halves.upperR32).toHaveLength(8);
    expect(halves.lowerR32).toHaveLength(8);
    expect(halves.upperR32[0].matchNum).toBe(73);
    expect(halves.lowerR32[0].matchNum).toBe(81);
  });

  test("returns null for null snapshot", () => {
    expect(splitBracketByHalf(null)).toBeNull();
  });
});