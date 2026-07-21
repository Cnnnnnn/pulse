// @vitest-environment happy-dom
/**
 * 路线图 F：ELO per $（Arena ELO × AA 输出价 混合性价比排名）。
 * 独立测试文件：仅依赖 format.js 纯函数与 EloPerDollar 纯渲染组件，
 * 不引入 aiLeaderboardStore（规避与 modelsdev 工作树 hunks 的纠缠与 IPC 噪声）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/preact";
import {
  aggregateVendorProfiles,
  eloPerDollar,
  rankVendorsByEloPerDollar,
} from "../../src/renderer/ai-leaderboard/format.js";
import { EloPerDollar } from "../../src/renderer/ai-leaderboard/EloPerDollar.jsx";

// 厂商 oa 旗下两模型：输出价取最低（1.5）
const items = [
  { vendor: "oa", arena: { text: { score: 1600 } }, aa: { intelligenceIndex: 80, priceOutputPer1M: 2 }, livebench: { overall: 65 } },
  { vendor: "oa", aa: { intelligenceIndex: 70, priceOutputPer1M: 1.5 } }, // 拉低 priceOut
  { vendor: "g", arena: { text: { score: 1400 } }, aa: { intelligenceIndex: 50, priceOutputPer1M: 5 }, livebench: { overall: 40 } },
  { vendor: "x", arena: { text: { score: 1500 } } }, // 无 AA 价格 → priceOut null
  { vendor: "z", aa: { intelligenceIndex: 90, priceOutputPer1M: 0 } }, // 无 arena + 价 0 → 双空
];

describe("aggregateVendorProfiles：priceOut 轴捕获最低 AA 输出价", () => {
  const map = aggregateVendorProfiles(items);
  it("priceOut 取厂商旗下 AA 切片里最低的输出价", () => {
    expect(map.get("oa").priceOut).toBe(1.5); // 两模型 2 / 1.5 → 取 1.5
    expect(map.get("g").priceOut).toBe(5);
  });
  it("缺 AA 价格的厂商 priceOut 为 null；价=0 如实记为 0（其余轴不受影响）", () => {
    expect(map.get("x").priceOut).toBeNull(); // 完全无 AA 切片
    expect(map.get("x").arena).toBe(1500);
    expect(map.get("z").priceOut).toBe(0); // 价=0 是合法最低价，min 取 0（eloPerDollar 因 price<=0 守卫返回 null，故不进榜）
    expect(map.get("z").arena).toBeNull();
  });
  it("arena/aa/livebench 轴聚合逻辑保持不变", () => {
    expect(map.get("oa").arena).toBe(1600);
    expect(map.get("oa").aa).toBe(80);
    expect(map.get("oa").livebench).toBe(65);
  });
});

describe("eloPerDollar：公式与守卫", () => {
  it("ELO / 最低价；越高越划算", () => {
    expect(eloPerDollar({ arena: 1600, priceOut: 1.5 })).toBeCloseTo(1066.67, 1);
  });
  it("缺 ELO / 缺价 / 价≤0 均返回 null", () => {
    expect(eloPerDollar({ arena: null, priceOut: 5 })).toBeNull();
    expect(eloPerDollar({ arena: 1000, priceOut: null })).toBeNull();
    expect(eloPerDollar({ arena: 1000, priceOut: 0 })).toBeNull();
    expect(eloPerDollar(null)).toBeNull();
  });
});

describe("rankVendorsByEloPerDollar：降序排名并过滤无效值", () => {
  const map = aggregateVendorProfiles(items);
  const rows = rankVendorsByEloPerDollar(map);
  it("仅含同时具备 ELO 与正价的厂商，且按 ELO per $ 降序", () => {
    expect(rows.map((r) => r.vendor)).toEqual(["oa", "g"]); // oa(1066.67) > g(280)
    expect(rows[0].eloPerDollar).toBeGreaterThan(rows[1].eloPerDollar);
  });
  it("每行携带 arena 与 priceOut 供展示", () => {
    expect(rows[0]).toMatchObject({ vendor: "oa", arena: 1600, priceOut: 1.5 });
  });
});

describe("EloPerDollar 组件渲染", () => {
  afterEach(() => cleanup());

  const map = aggregateVendorProfiles(items);
  const rows = rankVendorsByEloPerDollar(map);

  it("渲染排名条形列表，选中厂商高亮（is-focus + 已选徽标 + 厂商色）", () => {
    const { container } = render(<EloPerDollar rows={rows} focusSet={new Set(["oa"])} />);
    expect(container.querySelector(".ai-lb-epd")).toBeTruthy();
    expect(container.querySelectorAll(".ai-lb-epd__row").length).toBe(2);
    const focusRow = container.querySelector(".ai-lb-epd__row.is-focus");
    expect(focusRow).toBeTruthy();
    expect(focusRow.querySelector(".ai-lb-epd__name").textContent).toBeTruthy();
    // 厂商色经 --epd-color 注入到行（供焦点行描边/徽标复用，也驱动条形背景）
    expect(focusRow.getAttribute("style")).toContain("--epd-color:");
    // 条形内联宽度 + 入场动画延迟（错峰）
    const bar = focusRow.querySelector(".ai-lb-epd__bar");
    expect(bar.getAttribute("style")).toContain("width:");
    expect(bar.getAttribute("style")).toContain("animation-delay:");
    // 焦点行带「已选」徽标，非焦点行无徽标
    expect(focusRow.querySelector(".ai-lb-epd__badge")).toBeTruthy();
    expect(focusRow.querySelector(".ai-lb-epd__badge").textContent).toBe("已选");
    // 数值格式化（千分位）
    expect(focusRow.querySelector(".ai-lb-epd__val").textContent).toContain("1,067");
    // 非 focus 行未被标记、无徽标
    const others = container.querySelectorAll(".ai-lb-epd__row:not(.is-focus)");
    expect(others.length).toBe(1);
    expect(others[0].querySelector(".ai-lb-epd__badge")).toBeNull();
  });

  it("无数据（空 rows）时渲染提示而非列表", () => {
    const { container } = render(<EloPerDollar rows={[]} focusSet={new Set()} />);
    expect(container.querySelector(".ai-lb-epd__list")).toBeNull();
    expect(container.textContent).toContain("暂无可用数据");
  });
});

describe("EloPerDollar：Top-3 奖牌 + 点击跳转 + 动效节奏", () => {
  afterEach(() => cleanup());

  // 4 行伪数据，足以覆盖奖牌前三与第四名无奖牌
  const medalRows = [
    { vendor: "a", eloPerDollar: 1000, arena: 1600, priceOut: 1.6 },
    { vendor: "b", eloPerDollar: 800, arena: 1500, priceOut: 1.875 },
    { vendor: "c", eloPerDollar: 500, arena: 1400, priceOut: 2.8 },
    { vendor: "d", eloPerDollar: 200, arena: 1300, priceOut: 6.5 },
  ];

  it("Top-3 排名渲染奖牌色阶（is-medal + --1/--2/--3），第四名无奖牌", () => {
    const { container } = render(<EloPerDollar rows={medalRows} focusSet={new Set()} />);
    const ranks = container.querySelectorAll(".ai-lb-epd__rank");
    expect(ranks.length).toBe(4);
    expect(ranks[0].classList.contains("is-medal")).toBe(true);
    expect(ranks[0].classList.contains("ai-lb-epd__rank--1")).toBe(true);
    expect(ranks[1].classList.contains("ai-lb-epd__rank--2")).toBe(true);
    expect(ranks[2].classList.contains("ai-lb-epd__rank--3")).toBe(true);
    expect(ranks[3].classList.contains("is-medal")).toBe(false);
  });

  it("点击/回车/空格行触发 onJump(vendor)，并具备可访问性 role/tabindex", () => {
    let jumped = null;
    const { container } = render(
      <EloPerDollar rows={medalRows} focusSet={new Set()} onJump={(v) => { jumped = v; }} />
    );
    const row = container.querySelector(".ai-lb-epd__row");
    expect(row.getAttribute("role")).toBe("button");
    expect(row.getAttribute("tabindex")).toBe("0");
    fireEvent.click(row);
    expect(jumped).toBe("a");
    jumped = null;
    fireEvent.keyDown(row, { key: "Enter" });
    expect(jumped).toBe("a");
    jumped = null;
    fireEvent.keyDown(row, { key: " " });
    expect(jumped).toBe("a");
  });

  it("未传 onJump 时行不可点击（无 role/tabindex）", () => {
    const { container } = render(<EloPerDollar rows={medalRows} focusSet={new Set()} />);
    const row = container.querySelector(".ai-lb-epd__row");
    expect(row.getAttribute("role")).toBeNull();
    expect(row.getAttribute("tabindex")).toBeNull();
  });

  it("条形入场动画延迟错峰（55ms/行）并封顶", () => {
    const { container } = render(<EloPerDollar rows={medalRows} focusSet={new Set()} />);
    const bars = container.querySelectorAll(".ai-lb-epd__bar");
    expect(bars[0].getAttribute("style")).toMatch(/animation-delay:\s*0ms/);
    expect(bars[1].getAttribute("style")).toMatch(/animation-delay:\s*55ms/);
    expect(bars[3].getAttribute("style")).toMatch(/animation-delay:\s*165ms/); // min(3,14)*55
  });
});
