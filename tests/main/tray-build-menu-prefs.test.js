import { describe, it, expect } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const { _internal } = requireMain("tray");
const { DEFAULT_PREFS } = requireMain("tray-menu-prefs");
const { buildMenu } = _internal;

const allOff = {
  version: 1,
  segments: {
    updates: false,
    ai_usage: false,
    worldcup: false,
    metals: false,
    check_action: false,
    config_action: false,
  },
};

describe("tray.buildMenu — trayPrefs 接线 (Phase v1)", () => {
  it("trayPrefs.segments.updates=false → 动态段「🔄 检查更新」消失(段头)", () => {
    const m = buildMenu({
      results: [{ name: "Codex", has_update: true, installed_version: "1.0", latest_version: "2.0" }],
      trayPrefs: { ...DEFAULT_PREFS, segments: { ...DEFAULT_PREFS.segments, updates: false } },
    });
    const labels = m.map((i) => i.label).filter(Boolean);
    // 段头字符 ── 🔄 检查更新 (...) ── 消失,底部 button "检查更新" 仍在 (独立的 check_action)
    expect(labels.some((l) => l.startsWith("── 🔄"))).toBe(false);
    expect(labels.some((l) => l.includes("Codex"))).toBe(false);
  });

  it("6 项全 false → 动态段全隐藏,底部只剩「打开面板」", () => {
    const m = buildMenu({
      results: [{ name: "Codex", has_update: true, installed_version: "1.0", latest_version: "2.0" }],
      aiUsage: { minimax: { status: "ok", percent: 50, remainLabel: "1h", fetchedAt: Date.now() } },
      worldcup: { todayMatches: [{ team1: "A", team2: "B", time: "12:00" }] },
      metals: { quotes: { XAU: { price: 3000, currency: "USD", unit: "oz" } } },
      trayPrefs: allOff,
    });
    const labels = m.map((i) => i.label).filter(Boolean);
    // 锁死 2 项 (打开面板 + 退出) 必在
    expect(labels).toContain("打开面板");
    expect(labels).toContain("退出");
    // 关闭的项消失
    expect(labels.some((l) => l.includes("Codex"))).toBe(false);
    expect(labels.some((l) => l.includes("MiniMax"))).toBe(false);
    expect(labels.some((l) => l.includes("⚽"))).toBe(false);
    expect(labels.some((l) => l.includes("XAU"))).toBe(false);
    expect(labels).not.toContain("检查更新");
    expect(labels).not.toContain("打开配置文件");
  });

  it("不传 trayPrefs → 默认全显示,行为跟现状完全一致", () => {
    const m1 = buildMenu({
      results: [{ name: "A", has_update: true, installed_version: "1", latest_version: "2" }],
    });
    const m2 = buildMenu({
      results: [{ name: "A", has_update: true, installed_version: "1", latest_version: "2" }],
      trayPrefs: DEFAULT_PREFS,
    });
    expect(m1.map((i) => i.label)).toEqual(m2.map((i) => i.label));
  });

  it("「打开面板」和「退出」永远在输出里,不依赖 prefs", () => {
    const m = buildMenu({ results: [], trayPrefs: allOff });
    const labels = m.map((i) => i.label).filter(Boolean);
    expect(labels[labels.length - 1]).toBe("退出");
    expect(labels).toContain("打开面板");
  });

  it("check_action=false → 底部不显示「检查更新」按钮", () => {
    const m = buildMenu({
      results: [],
      trayPrefs: { ...DEFAULT_PREFS, segments: { ...DEFAULT_PREFS.segments, check_action: false } },
    });
    expect(m.map((i) => i.label).filter(Boolean)).not.toContain("检查更新");
  });

  it("config_action=false → 底部不显示「打开配置文件」按钮", () => {
    const m = buildMenu({
      results: [],
      trayPrefs: { ...DEFAULT_PREFS, segments: { ...DEFAULT_PREFS.segments, config_action: false } },
    });
    expect(m.map((i) => i.label).filter(Boolean)).not.toContain("打开配置文件");
  });
});
