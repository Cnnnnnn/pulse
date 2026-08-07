// @vitest-environment happy-dom
/**
 * tests/renderer/appshell-home-mode.test.tsx
 *
 * Phase 9 外壳重构后的行为契约:
 *   - IconRail 常驻 (home 也挂载, 不再有 nav !== 'home' 条件隐藏)
 *   - home 模式渲染 <Dashboard/> (替代旧 <HomeGrid/>)
 *   - panel 模式渲染 <LazyNavPanel/>
 *   - NavDrawer hover 协同
 *
 * AppShell 引入 SearchModal/LazyNavPanel 等重依赖, 整树 happy-dom 渲染不稳.
 * 这里验证 AppShell.tsx 源码条件渲染逻辑 (行为契约), 不真正渲染整树.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPSHELL_SRC = readFileSync(
  resolve("src/renderer/components/AppShell.tsx"),
  "utf8",
);

describe("AppShell 外壳重构 — 行为契约", () => {
  beforeEach(() => {
    // 不渲染; 解析源码检查条件
  });

  it("IconRail 常驻挂载 (无 nav !== 'home' 条件)", () => {
    // Phase 9: IconRail 不再有 {nav !== 'home' && ...} 条件, home 也常驻.
    expect(APPSHELL_SRC).toMatch(/<IconRail/);
    expect(APPSHELL_SRC).not.toMatch(
      /\{nav\s*!==\s*['"]home['"]\s*&&\s*<IconRail/,
    );
  });

  it("home 模式 main view 渲染 <Dashboard/>", () => {
    expect(APPSHELL_SRC).toMatch(
      /\{nav\s*===\s*['"]home['"][\s\S]*?<Dashboard/,
    );
  });

  it("panel 模式 main view 渲染 <LazyNavPanel/>", () => {
    expect(APPSHELL_SRC).toMatch(/<LazyNavPanel/);
  });

  it("NavDrawer 协同挂载 (hover 抽屉)", () => {
    expect(APPSHELL_SRC).toMatch(/<NavDrawer/);
  });

  it("IconRail 🏠 按钮设 activeNav('home') (回 home 入口)", () => {
    const railSrc = readFileSync(
      resolve("src/renderer/components/IconRail.tsx"),
      "utf8",
    );
    expect(railSrc).toMatch(/setActiveNav\(['"]home['"]\)/);
    expect(railSrc).toMatch(/aria-label="首页"/);
  });
});

describe("AppShell IconRail 🏠 按钮 (行为契约 + 单元)", () => {
  it("点击 🏠 后 activeNav === 'home'", async () => {
    const { render, fireEvent } = await import("@testing-library/preact");
    const { activeNav } = await import("../../src/renderer/nav/navStore.ts");
    const { IconRail } = await import(
      "../../src/renderer/components/IconRail.tsx"
    );
    activeNav.value = "ithome";

    const { container } = render(<IconRail />);
    const homeBtn = container.querySelector('button[aria-label="首页"]');
    expect(homeBtn).toBeTruthy();
    fireEvent.click(homeBtn);
    expect(activeNav.value).toBe("home");
  });
});
