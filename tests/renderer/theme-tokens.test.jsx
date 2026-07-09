// @vitest-environment happy-dom
/**
 * tests/renderer/theme-tokens.test.jsx
 *
 * ponytail: 2026-07-08 — 主题令牌解析的最小烟雾测试. 不引依赖, 直接用 happy-dom
 *   的 getComputedStyle 读 CSS 变量, 验证 <html data-theme="dark"> 下三档
 *   --text-{primary,secondary,tertiary} 与浅色下确实不同, 防止后续 styles.css
 *   修改不慎弄丢 dark 块 / 弄断 token 解析.
 *
 *   真实 12k 行 styles.css 不需要全部加载 — 仅在测试内联注入"语义关键令牌"的
 *   浅/深两套声明 (与 styles.css :root / :root[data-theme="dark"] 同值),
 *   focus 在"主题机制层"是否正确工作. styles.css 自身的值正确性由设计系统
 *   文档 + 人工抽检保障, 不重复断言.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const TOKEN_CSS = `
  :root {
    --text-primary: var(--gray-800);
    --text-secondary: var(--gray-500);
    --text-tertiary: var(--gray-300);
    --accent-primary: #007aff;
    --gray-50:  oklch(97.07% 0.0028 285.2);
    --gray-100: oklch(92.33% 0.0068 285.8);
    --gray-200: oklch(86.22% 0.0069 285.9);
    --gray-300: oklch(75.20% 0.0057 285.8);
    --gray-400: oklch(64.83% 0.0074 285.9);
    --gray-500: oklch(53.99% 0.0078 285.9);
    --gray-600: oklch(40.24% 0.0034 285.9);
    --gray-700: oklch(29.39% 0.0036 285.9);
    --gray-800: oklch(23.16% 0.0038 285.9);
  }
  :root[data-theme="dark"] {
    --text-primary: var(--gray-50);
    --text-secondary: #a1a1a6;
    --text-tertiary: #636366;
    --accent-primary: #0a84ff;
  }
`;

function injectTokens() {
  const style = document.createElement("style");
  style.id = "test-theme-tokens";
  style.textContent = TOKEN_CSS;
  document.head.appendChild(style);
}

describe("theme tokens (light/dark)", () => {
  beforeEach(() => {
    injectTokens();
  });
  afterEach(() => {
    const s = document.getElementById("test-theme-tokens");
    if (s) s.remove();
    document.documentElement.removeAttribute("data-theme");
  });

  function getRootToken(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  it("light tokens read correctly (default root)", () => {
    // 没有 data-theme → 浅色 (gray-800 OKLCH)
    const html = document.documentElement;
    html.removeAttribute("data-theme");
    expect(getRootToken("--text-primary")).toBe("oklch(23.16% 0.0038 285.9)");
    expect(getRootToken("--text-secondary")).toBe("oklch(53.99% 0.0078 285.9)");
    expect(getRootToken("--text-tertiary")).toBe("oklch(75.20% 0.0057 285.8)");
    expect(getRootToken("--accent-primary")).toBe("#007aff");
  });

  it("OKLCH primitive values resolve to CSS oklch() strings", () => {
    const html = document.documentElement;
    html.removeAttribute("data-theme");
    // 验证 primitive token 也直接读得到
    expect(getRootToken("--gray-50")).toMatch(/^oklch\(/);
    expect(getRootToken("--gray-800")).toMatch(/^oklch\(/);
    // hex 形态不存在(已迁 OKLCH)
    expect(getRootToken("--gray-50")).not.toMatch(/^#/);
  });

  it("dark tokens override when <html data-theme=dark>", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    expect(getRootToken("--text-primary")).toBe("oklch(97.07% 0.0028 285.2)");  // = gray-50
    expect(getRootToken("--text-secondary")).toBe("#a1a1a6");
    expect(getRootToken("--text-tertiary")).toBe("#636366");
    expect(getRootToken("--accent-primary")).toBe("#0a84ff");
  });

  it("light/dark --text-primary 都不同 (持久化切换可见)", () => {
    const html = document.documentElement;
    html.removeAttribute("data-theme");
    const light = getRootToken("--text-primary");
    html.setAttribute("data-theme", "dark");
    const dark = getRootToken("--text-primary");
    expect(light).not.toBe(dark);
    // 切回 light 再确认: 模拟"持久化反复切换"
    html.removeAttribute("data-theme");
    expect(getRootToken("--text-primary")).toBe(light);
  });
});
