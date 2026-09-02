#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const outfile = path.join(rootDir, "dist", "main", "index.js");
const workerOutfile = path.join(rootDir, "dist", "workers", "detect-worker.js");

fs.mkdirSync(path.dirname(outfile), { recursive: true });

function buildMainBundle() {
  esbuild.buildSync({
    entryPoints: [path.join(rootDir, "src/main/index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "es2020",
    external: ["electron"],
    packages: "external",
    outfile,
    logLevel: "info",
    // ponytail: Phase 11 静默 145 file dual-export 引发的 commonjs-variable-in-esm warning.
    // 这些是 Phase 7 7a-6 兼容性模式 (module.exports + export {} 共存), 不是 error.
    // 改 source 风险高 (test 靠 module.exports 拿 internal exports), 抑制此 warning 类别.
    logOverride: {
      "commonjs-variable-in-esm": "silent",
    },
  });
}

buildMainBundle();

// Phase 5 Batch I: worker_threads 独立入口 — 不进 main bundle。
// 把 detectors/utils/platform/http-client 等相对依赖打进 bundle
// （packages=external 只外置 node_modules；electron 外置）。
//
// 两个 plugin 是 prod worker 自包含的硬条件：
// 1) prefer-ts-over-shim — .js require 指到 .ts 真相，避免把 Phase 3/5
//    shim（runtime 查 dist-test）打进 asar。
// 2) fix-export-empty-dual — detectors 等「module.exports + export {}」
//    在 esbuild ESM 互操作下 base_exports 为空 → `class extends undefined`；
//    把 export {} 换成真实 named export。
fs.mkdirSync(path.dirname(workerOutfile), { recursive: true });
async function buildWorkerBundle() {
  await esbuild.build({
    entryPoints: [path.join(rootDir, "src/workers/detect-worker.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "es2020",
    packages: "external",
    external: ["electron"],
    outfile: workerOutfile,
    logLevel: "warning",
    // ponytail: Phase 7 7a-6 留 145 file dual-export (module.exports + export {}) 兼容
    // CJS caller. esbuild 把 file 视 ESM 后报 "commonjs-variable-in-esm" warning.
    // 不是 error, 不影响 build 形状, 改 source 风险高 (test 靠 module.exports 拿
    // internal export). 用 logOverride 静默这个具体 warning 类别.
    logOverride: {
      "commonjs-variable-in-esm": "silent",
    },
    plugins: [
      {
        name: "prefer-ts-over-shim",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (!args.path.startsWith(".") || args.kind === "entry-point") {
              return undefined;
            }
            const resolved = path.resolve(
              path.dirname(args.importer),
              args.path,
            );
            const candidates = [];
            if (args.path.endsWith(".js")) {
              candidates.push(resolved.replace(/\.js$/, ".ts"));
            } else if (!path.extname(args.path)) {
              candidates.push(
                resolved + ".ts",
                path.join(resolved, "index.ts"),
              );
            } else if (args.path.endsWith(".ts")) {
              candidates.push(resolved);
            }
            for (const c of candidates) {
              if (fs.existsSync(c)) return { path: c };
            }
            return undefined;
          });
        },
      },
      {
        name: "fix-export-empty-dual",
        setup(build) {
          build.onLoad({ filter: /\.ts$/ }, (args) => {
            const src = fs.readFileSync(args.path, "utf8");
            if (!src.includes("export {}")) return null;
            const me = src.match(/module\.exports\s*=\s*\{([^}]+)\}/);
            if (!me) return null;
            const names = me[1]
              .split(",")
              .map((s) => {
                const t = s.trim();
                const m = t.match(/^(\w+)\s*:/);
                return m ? m[1] : (t.match(/^(\w+)$/) || [])[1];
              })
              .filter(Boolean);
            if (!names.length) return null;
            const next = src.replace(
              /\nexport\s*\{\s*\}\s*;?\s*$/,
              `\nexport { ${names.join(", ")} };`,
            );
            if (next === src) return null;
            return { contents: next, loader: "ts" };
          });
        },
      },
    ],
  });
  console.log(`  ${path.relative(rootDir, workerOutfile)}`);
}

// Worker bundle is async (plugins); path rewrite awaits it via main().
async function main() {
  await buildWorkerBundle();

  // ponytail: post-build literal path rewrite.
  // esbuild bundles src/main/* into dist/main/index.js, so __dirname inside
  // the bundle is dist/main/. Seven path.join(__dirname, ...) literals were
  // written against each source file's own __dirname (which varies in
  // depth: src/main/, src/main/window/, src/main/tray/,
  // src/main/bootstrap/, src/main/ai-leaderboard/). We rewrite each literal
  // so it resolves to its intended repo-rooted target.
  //
  // Depth math (bundle __dirname = dist/main/, depth 2 from repo root):
  //   - src/main/index.ts (depth 2 source, 1 source `..`): bundle needs 2
  //     `..` plus an explicit src/ segment.
  //   - src/main/bootstrap/ (depth 4 source, 3 source `..`): bundle needs
  //     only 2 `..` from dist/main/.
  //   - src/main/tray/ (depth 3 source, 2 source `..`): source resolves to
  //     src/assets — pre-existing depth bug masked by fallback icon. Brief
  //     target is repo/assets. Bundle literal already lands at repo/assets,
  //     so the rewrite is a no-op.
  //   - src/main/window/ (depth 3 source, 2 source `..`): source resolves
  //     to src/dist/preload.js / src/index.html — pre-existing depth bug
  //     masked by opts.preloadPath / opts.indexPath in production. Bundle
  //     literal already lands at repo/dist/preload.js / repo/index.html,
  //     so the rewrite is a no-op.
  //   - src/main/ai-leaderboard/ (depth 4 source, 0 source `..`): bundle
  //     needs 2 `..` to reach repo, then src/main/ai-leaderboard/.
  //   - src/main/index.ts workerScript (1 source `..`): source and bundle
  //     both resolve via `../workers/detect-worker.js` — src/main →
  //     src/workers (dev shim), dist/main → dist/workers (prod bundle).
  //     Rewrite is a no-op.
  //
  // Each rewrite uses .replace (not .replaceAll) so a future second
  // occurrence is not silently mutated; the test guard in
  // tests/main/main-bundle-paths-contract.test.js asserts exactly one
  // rewritten literal per item.
  const bundlePath = outfile;
  let bundle = fs.readFileSync(bundlePath, "utf8");

  // ponytail: esbuild may rename `path` to `path2`/`path3`/etc. as new
  // CJS `require("path")` sites join the bundle (Phase 3 Batch 2 added
  // several). Each rewrite matches any `path\d*.` prefix so it survives
  // across migrations that change the import surface. The companion
  // contract test (tests/main/main-bundle-paths-contract.test.js) uses
  // the same regex form.
  function pathPrefix() {
    return "path\\d*\\.";
  }

  const rewrites = [
    // #1 — src/main/index.ts timer-audit fixture (depth-2 source)
    // src/main/index.ts → src/tests/fixtures/timer-audit (source dev path);
    // bundle 后 __dirname = dist/main, 要走 ../.. 回项目根再进 src/tests.
    {
      fromRegex: new RegExp(
        pathPrefix() +
          `join\\(__dirname, "..", "tests", "fixtures", "timer-audit"\\)`,
      ),
      toRegex: new RegExp(
        pathPrefix() +
          `join\\(__dirname, "..", "..", "src", "tests", "fixtures", "timer-audit"\\)`,
      ),
      fromLiteral: (p) =>
        `${p}join(__dirname, "..", "tests", "fixtures", "timer-audit")`,
      to: (p) =>
        `${p}join(__dirname, "..", "..", "src", "tests", "fixtures", "timer-audit")`,
      noop: false,
    },
    // #2 — src/main/bootstrap/config.ts PROJECT_ROOT (depth-4 source)
    // 源码 __dirname = src/main/bootstrap, "..".."".." = 项目根;
    // bundle 后 __dirname = dist/main, 要走 ../.. 才到项目根.
    {
      fromRegex: new RegExp(
        pathPrefix() + `join\\(__dirname, "..", "..", ".."\\)`,
      ),
      toRegex: new RegExp(
        pathPrefix() + `join\\(__dirname, "..", ".."\\)`,
      ),
      fromLiteral: (p) => `${p}join(__dirname, "..", "..", "..")`,
      to: (p) => `${p}join(__dirname, "..", "..")`,
      noop: false,
    },
    // #3 — src/main/tray.ts ASSETS (depth-3 source, no-op rewrite)
    {
      fromRegex: new RegExp(
        pathPrefix() + `join\\(__dirname, "..", "..", "assets"\\)`,
      ),
      fromLiteral: (p) => `${p}join(__dirname, "..", "..", "assets")`,
      to: (p) => `${p}join(__dirname, "..", "..", "assets")`,
      noop: true,
    },
    // #4 — src/main/window.ts preload default (depth-3 source, no-op rewrite)
    {
      fromRegex: new RegExp(
        pathPrefix() + `join\\(__dirname, "..", "..", "dist", "preload.js"\\)`,
      ),
      fromLiteral: (p) =>
        `${p}join(__dirname, "..", "..", "dist", "preload.js")`,
      to: (p) => `${p}join(__dirname, "..", "..", "dist", "preload.js")`,
      noop: true,
    },
    // #5 — src/main/window.ts indexPath default (depth-3 source, no-op rewrite)
    {
      fromRegex: new RegExp(
        pathPrefix() + `join\\(__dirname, "..", "..", "index.html"\\)`,
      ),
      fromLiteral: (p) => `${p}join(__dirname, "..", "..", "index.html")`,
      to: (p) => `${p}join(__dirname, "..", "..", "index.html")`,
      noop: true,
    },
    // #6 — src/main/ai-leaderboard/sample.ts SAMPLE_PATH (depth-4 source)
    // 源码 __dirname = src/main/ai-leaderboard, sample.json 在同目录;
    // bundle 后 __dirname = dist/main, 要走 ../../src/main/ai-leaderboard.
    {
      fromRegex: new RegExp(
        pathPrefix() + `join\\(__dirname, "sample.json"\\)`,
      ),
      toRegex: new RegExp(
        pathPrefix() +
          `join\\(__dirname, "..", "..", "src", "main", "ai-leaderboard", "sample.json"\\)`,
      ),
      fromLiteral: (p) => `${p}join(__dirname, "sample.json")`,
      to: (p) =>
        `${p}join(__dirname, "..", "..", "src", "main", "ai-leaderboard", "sample.json")`,
      noop: false,
    },
    // #7 — src/main/index.ts workerScript (depth-2 source, multi-line no-op)
    // src/main → src/workers/detect-worker.js (dev); dist/main →
    // dist/workers/detect-worker.js (prod bundle from this script).
    {
      fromRegex: new RegExp(
        pathPrefix() +
          `join\\(\\s*__dirname\\s*,\\s*".."\\s*,\\s*"workers"\\s*,\\s*"detect-worker.js"\\s*\\)`,
      ),
      fromLiteral: (p) =>
        `${p}join(\n    __dirname,\n    "..",\n    "workers",\n    "detect-worker.js"\n  )`,
      to: (p) =>
        `${p}join(\n    __dirname,\n    "..",\n    "workers",\n    "detect-worker.js"\n  )`,
      noop: true,
    },
  ];

  for (const r of rewrites) {
    const m = bundle.match(r.fromRegex);
    if (!m) {
      if (r.noop) {
        // Literal not present in bundle — fall back to a no-op assertion only
        // if at least one prefix form was seen. Skip silently otherwise
        // (bundle may have folded / hoisted).
        continue;
      }
      // 合约测试会并行运行 build-main；若另一进程已先完成同一条
      // rewrite，当前 bundle 的目标文本就是合法终态，直接视作成功。
      if (r.toRegex && r.toRegex.test(bundle)) continue;
      throw new Error(
        `build-main: literal path rewrite missed — expected to match ${r.fromRegex} in dist/main/index.js`,
      );
    }
    const prefix = m[0].match(/^path\d*\./)[0].slice(0, -1);
    const literal = r.fromLiteral(prefix + ".");
    if (r.noop) {
      // no-op rule: pattern 已匹配, 验证 literal 存在即可, 不做 replace.
      continue;
    }
    const to = r.to(prefix + ".");
    const before = bundle;
    bundle = bundle.replace(literal, to);
    if (bundle === before) {
      throw new Error(
        `build-main: literal path rewrite missed — expected to find ${JSON.stringify(literal)} in dist/main/index.js`,
      );
    }
  }

  fs.writeFileSync(bundlePath, bundle);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
