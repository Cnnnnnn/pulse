/**
 * tests/renderer/cmd-f-search-focus-contract.test.ts
 *
 * 回归保护：AppShell 的 ⌘F 分支按 nav 把焦点交给某个搜索框 id。
 * 该 id 必须在某个模块源码里真实存在，否则 ⌘F 在该模块上静默无反应
 * （闲鱼模块 v2 工具栏改造时就踩过：搜索框没 id，⌘F 落到不存在的
 *  filter-search-input 上）。
 *
 * 只做「id 字面量在 renderer 源码里另有定义」的静态断言 —— 不渲染组件，
 * 因此不受 happy-dom 量测/observer 影响。断言源里排除 AppShell.tsx 自身，
 * 否则它自己的字面量会把该 id 自证通过。
 *
 * id 有两种写法，都要能命中：
 *   <input id="goofish-search-input">              (GoofishLayout)
 *   id={cond ? "wechat-hot-search-input" : "..."}  (NewsLayoutHeader)
 * 所以只匹配引号包裹的字面量，不匹配 id= 属性语法。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const root = join(__dirname, "../..");
const rendererDir = join(root, "src/renderer");
const SHELL_REL = join("components", "AppShell.tsx");
const shellSrc = readFileSync(join(rendererDir, SHELL_REL), "utf-8");

/** 收集 renderer 下全部 .ts/.tsx，跳过 AppShell.tsx 自身 */
function collectSources(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectSources(p, acc);
    else if (/\.(ts|tsx)$/.test(name) && !p.endsWith(SHELL_REL)) acc.push(readFileSync(p, "utf-8"));
  }
  return acc;
}

const otherSources = collectSources(rendererDir).join("\n");

/** AppShell 里出现的所有 `-input` 字面量，即 ⌘F 的各模块目标 */
const focusIds = [
  ...new Set([...shellSrc.matchAll(/'([a-z0-9]+(?:-[a-z0-9]+)*-input)'/g)].map((m) => m[1])),
];

describe("⌘F 搜索聚焦契约", () => {
  it("AppShell 至少声明了一个搜索框 id", () => {
    expect(focusIds.length).toBeGreaterThan(0);
  });

  it("闲鱼搜索框 id 与 AppShell 的 goofish 分支一致", () => {
    expect(shellSrc).toMatch(/nav === ['"]goofish['"][^;]*['"]goofish-search-input['"]/);
  });

  for (const id of focusIds) {
    it(`'${id}' 在 AppShell 之外的 renderer 源码里有定义`, () => {
      // 双引号为主流写法；单引号一并放行
      expect(
        otherSources.includes(`"${id}"`) || otherSources.includes(`'${id}'`),
        `AppShell 的 ⌘F 指向 '${id}'，但没有任何模块渲染该 id 的搜索框`,
      ).toBe(true);
    });
  }
});
