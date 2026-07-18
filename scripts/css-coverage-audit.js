#!/usr/bin/env node
/**
 * scripts/css-coverage-audit.js
 *
 * ponytail 2026-07-18 P6-audit 后续: 系统化审计每个 module 用到的 class 名 vs
 *   CSS 定义覆盖.
 *
 * 用途: 找出 JSX 写了但 CSS 没定义的 class (浏览器 fallback 到默认样式),
 *   这是 P6 修的 metals-up/down 同类问题.
 *
 * 不引外部依赖, 用 ripgrep / 文件系统 grep 跑一次即可.
 *
 * 输出:
 *   - 每个 module (src/renderer/<module>/) 一行: 模块名 / JSX 用到的 class 数 /
 *     已定义 / 缺失 / 缺失列表 (前 10 个).
 *   - 总体汇总.
 *
 * ponytail: 跑完一次, 不集成进 CI (CI 不应每 commit 跑这个, 跑手动 polish 时用).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const RENDERER = path.join(__dirname, "..", "src", "renderer");
const ROOT_CSS = path.join(__dirname, "..", "styles.css");

if (!fs.existsSync(RENDERER)) {
  console.error("[css-audit] missing renderer dir:", RENDERER);
  process.exit(1);
}

// 1. 列出所有 module 目录 (一级子目录, 排除 components, lib, common 等)
const entries = fs.readdirSync(RENDERER, { withFileTypes: true });
const MODULES = entries
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter(
    (n) =>
      !["components", "lib", "common", "hooks", "utils"].includes(n),
  );

console.log(
  `[css-audit] modules: ${MODULES.join(", ")} (total ${MODULES.length})\n`,
);

// 2. 收集所有 CSS (根 styles.css + 每个 module 自己的 .css)
function collectCssFiles() {
  const files = [ROOT_CSS];
  for (const mod of MODULES) {
    const modDir = path.join(RENDERER, mod);
    try {
      const sub = fs.readdirSync(modDir);
      for (const f of sub) {
        if (f.endsWith(".css")) files.push(path.join(modDir, f));
      }
    } catch {
      /* skip */
    }
  }
  return files;
}

const cssFiles = collectCssFiles();
console.log(`[css-audit] CSS files: ${cssFiles.length}`);
for (const f of cssFiles) console.log(`  - ${path.relative(process.cwd(), f)}`);

// 3. 解析每个 CSS 文件, 提取所有 class 选择器 (含 .cls / .cls.pseudo / .cls:hover)
function extractClassDefs(cssText) {
  const defs = new Set();
  // 匹配 `.classname` 起始, 后面跟着非标识符字符为止.
  // 包括: .foo, .foo:hover, .foo.pseudo, .foo.pseudo:hover
  const re = /\.(-?[_a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(cssText)) !== null) {
    defs.add(m[1]);
  }
  return defs;
}

const allDefs = new Set();
for (const f of cssFiles) {
  try {
    const text = fs.readFileSync(f, "utf8");
    for (const cls of extractClassDefs(text)) allDefs.add(cls);
  } catch (e) {
    console.error(`[css-audit] failed to read ${f}:`, e.message);
  }
}
console.log(`\n[css-audit] total defined classes: ${allDefs.size}`);

// 4. 收集每个 module JSX/JS 里用到的 class
function extractClassUsages(moduleDir) {
  const used = new Set();
  function walk(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const p = path.join(dir, item.name);
      if (item.isDirectory()) walk(p);
      else if (/\.(jsx?|tsx?)$/.test(item.name)) {
        const text = fs.readFileSync(p, "utf8");
        // 匹配 class="..." 或 className="..." 或 class={...} 中的字符串.
        // 简单做法: 抓所有 "name" 在 class= 之后.
        // 实际场景: class="foo bar", class={`foo ${cond ? 'bar' : ''}`}.
        // 简单版本: 抓 "foo" 形式 token.
        const reClass = /\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g;
        let m;
        while ((m = reClass.exec(text)) !== null) {
          const str = m[1] || m[2] || m[3] || "";
          // 切 token, 跳过空和 template expression.
          // 简单做法: 把 template ${...} 移除, 再 split.
          const cleaned = str
            .replace(/\$\{[^}]*\}/g, " ")
            .replace(/[\\/:.]/g, " ");
          for (const tok of cleaned.split(/\s+/)) {
            if (/^[-_a-zA-Z][\w-]*$/.test(tok)) used.add(tok);
          }
        }
      }
    }
  }
  walk(moduleDir);
  return used;
}

// 5. 计算每个 module 的缺失
const results = [];
for (const mod of MODULES) {
  const modDir = path.join(RENDERER, mod);
  if (!fs.existsSync(modDir)) continue;
  const used = extractClassUsages(modDir);
  const missing = [];
  for (const cls of used) {
    if (!allDefs.has(cls)) missing.push(cls);
  }
  results.push({
    module: mod,
    used: used.size,
    missing: missing.length,
    missingList: missing.sort(),
  });
}

// 6. 输出
results.sort((a, b) => b.missing - a.missing);

console.log("\n[css-audit] 模块 class 缺失统计 (按缺失数降序):");
console.log(
  "module             used  missing  sample missing (前 8)",
);
console.log(
  "────────────────── ───── ───────  ────────────────────",
);
for (const r of results) {
  if (r.missing === 0 && r.used === 0) continue;
  const sample = r.missingList.slice(0, 8).join(", ") || "-";
  console.log(
    `${r.module.padEnd(18)} ${String(r.used).padStart(5)} ${String(
      r.missing,
    ).padStart(8)}  ${sample}`,
  );
}

const totalMissing = results.reduce((s, r) => s + r.missing, 0);
console.log(
  `\n[css-audit] 汇总: ${results.length} modules, 总缺失 class ${totalMissing}`,
);

// 7. 把所有缺失 class 名 dump 到 JSON, 方便后续手工处理.
const missingJson = {};
for (const r of results) {
  if (r.missingList.length) missingJson[r.module] = r.missingList;
}
const outPath = path.join(__dirname, "..", "css-audit-result.json");
fs.writeFileSync(outPath, JSON.stringify(missingJson, null, 2));
console.log(`\n[css-audit] 详细结果写入 ${path.relative(process.cwd(), outPath)}`);