#!/usr/bin/env node
/**
 * scripts/css-dead-audit.js — 找 styles.css 里「源码从不引用」的 class。
 *
 * 比 css-coverage-audit（JSX 用了但 CSS 没定义）更进一步：
 * 反向找 CSS 定义了但业务从不用的死规则。
 *
 * 动态 class（`foo--${x}` / `${prefix}-bar`）会把前缀当「已使用」，
 * 降低误报。输出按前缀聚合，便于人工批量删。
 *
 * 用法: node scripts/css-dead-audit.js [--json out.json]
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STYLES = path.join(ROOT, "styles.css");
const RENDERER = path.join(ROOT, "src", "renderer");

function collectDefinedClasses(css) {
  // 仅匹配选择器里的 .class，排除注释行
  const defined = new Set();
  const lines = css.split("\n");
  let inComment = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("/*")) inComment = true;
    if (inComment) {
      if (t.includes("*/")) inComment = false;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("@")) continue;
    for (const m of line.matchAll(/\.([a-zA-Z_][\w-]*)/g)) {
      defined.add(m[1]);
    }
  }
  return defined;
}

function collectUsedTokens() {
  const used = new Set();
  const prefixes = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(fp);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx)$/.test(e.name)) continue;
      const t = fs.readFileSync(fp, "utf8");
      for (const m of t.matchAll(/[\"'`]([a-zA-Z_][\w-]*)[\"'`]/g)) {
        used.add(m[1]);
      }
      // class={`foo bar--${x}`} / "foo-" + y
      for (const m of t.matchAll(/[\"'`]([a-zA-Z_][\w-]*[-_])[${]/g)) {
        prefixes.add(m[1]);
      }
      for (const m of t.matchAll(/[\"'`]([a-zA-Z_][\w-]*)--\$\{/g)) {
        prefixes.add(m[1] + "--");
      }
    }
  };
  walk(RENDERER);
  return { used, prefixes };
}

function isCovered(cls, used, prefixes) {
  if (used.has(cls)) return true;
  for (const p of prefixes) {
    if (cls.startsWith(p)) return true;
  }
  // BEM block: foo__elem / foo--mod 覆盖 foo
  const block = cls.split("__")[0].split("--")[0];
  if (used.has(block)) return true;
  for (const p of prefixes) {
    if (block.startsWith(p)) return true;
  }
  return false;
}

function main() {
  const css = fs.readFileSync(STYLES, "utf8");
  const defined = collectDefinedClasses(css);
  const { used, prefixes } = collectUsedTokens();
  const dead = [...defined].filter((c) => !isCovered(c, used, prefixes)).sort();

  const byPrefix = {};
  for (const c of dead) {
    const p = c.split("-")[0];
    byPrefix[p] = byPrefix[p] || [];
    byPrefix[p].push(c);
  }

  console.log(`styles.css defined: ${defined.size}`);
  console.log(`used literals: ${used.size}, dynamic prefixes: ${prefixes.size}`);
  console.log(`potentially dead: ${dead.length}`);
  console.log("\nby first token:");
  for (const [p, list] of Object.entries(byPrefix).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${p.padEnd(16)} ${String(list.length).padStart(4)}  e.g. ${list.slice(0, 3).join(", ")}`);
  }

  const jsonIdx = process.argv.indexOf("--json");
  if (jsonIdx !== -1 && process.argv[jsonIdx + 1]) {
    fs.writeFileSync(
      process.argv[jsonIdx + 1],
      JSON.stringify({ defined: defined.size, dead, byPrefix }, null, 2),
    );
    console.log("\nwrote", process.argv[jsonIdx + 1]);
  }
}

if (require.main === module) main();
