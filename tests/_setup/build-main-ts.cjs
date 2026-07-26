/**
 * vitest globalSetup: transpile migrated src/main + src/platform + src/utils
 * + src/config .ts files into per-file CommonJS artifacts under dist-test/.
 *
 * Phase 3 Batch 9b: dist-test 图自包含 — 相对依赖 external 到 sibling
 * dist-test .cjs (不再绕 src .js shim). 业务 .js shim 可删; 测试用
 * tests/_setup/require-main.cjs 加载产物.
 *
 * Phase 5 Batch B: 加 src/utils（workers/detectors 仍 require 裸路径；
 *   源真相在 .ts，src/utils/*.js 为 shim → dist-test/utils/*.cjs）。
 *   同步把 src/config 编进 dist-test（Batch A 迁 TS 后 main bootstrap
 *   require("../../config/category") 必须 external 到 .cjs，不能指裸 .ts）。
 *
 * Phase 5 Batch C: 加 src/detectors（workers 仍 require 裸路径；
 *   源真相在 .ts，src/detectors/*.js 为 shim → dist-test/detectors/*.cjs）。
 *
 * Phase 5 Batch D: 加 src/metals（main 仍 require .js shim；
 *   源真相在 .ts，src/metals/*.js 为 shim → dist-test/metals/*.cjs）。
 *   metal-config/metal-calc 为 renderer 共享，export-only（禁止 module.exports）。
 *
 * Phase 5 Batch E: 加 src/funds（main 仍 require .js shim；
 *   源真相在 .ts，src/funds/*.js 为 shim → dist-test/funds/*.cjs）。
 *   fundCalc/fund-history/fund-nav-merge/format/fund-category/
 *   concentration/pnlCsv 为 renderer 共享，export-only（禁止 module.exports）。
 *
 * Phase 5 Batch F: 加 src/stocks（含 detail-fetchers/；main 仍 require .js shim；
 *   源真相在 .ts，src/stocks 下 .js 为 shim → dist-test/stocks 对应 .cjs）。
 *   diagnosis-scorer/strategies/stock-constants/stock-filter 为 renderer
 *   共享，export-only（禁止 module.exports）。
 *
 * Phase 5 Batch G: 加 src/ai（main 仍 require .js shim；
 *   源真相在 .ts，src/ai/*.js 为 shim → dist-test/ai/*.cjs）。
 *   default-models/ai-errors 为 renderer 共享，export-only（禁止 module.exports）。
 *
 * Phase 5 Batch H: 加 src/ai-sessions + src/ai-usage（main 仍 require .js shim；
 *   源真相在 .ts，.js 为 shim → dist-test/{ai-sessions,ai-usage}/*.cjs）。
 *   anomaly-detect/history-series/format-glm 为 renderer 共享，
 *   export-only（禁止 module.exports）；ai-sessions 全部 dual-export。
 *
 * Phase 5 Batch I: 加 src/workers + src/release-notes（main/tests 仍 require .js shim；
 *   源真相在 .ts，.js 为 shim → dist-test/{workers,release-notes}/*.cjs）。
 *   全部 dual-export。生产 detect-worker 另见 scripts/build-main.cjs
 *   打出的 dist/workers/detect-worker.js（自包含 bundle）。
 *
 * 重要: 相对依赖必须 external (不能 bundle 进同一文件):
 *   - bundle 会把 module.exports = singleton 收成 named-export 包装
 *   - bundle 会使 require.cache stub 失效
 *
 * ponytail: 与 scripts/build-main.cjs (生产 bundle) 分离.
 */
const path = require("node:path");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..", "..");
const srcMainDir = path.join(rootDir, "src", "main");
const srcPlatformDir = path.join(rootDir, "src", "platform");
const srcUtilsDir = path.join(rootDir, "src", "utils");
const srcConfigDir = path.join(rootDir, "src", "config");
const srcDetectorsDir = path.join(rootDir, "src", "detectors");
const srcMetalsDir = path.join(rootDir, "src", "metals");
const srcFundsDir = path.join(rootDir, "src", "funds");
const srcStocksDir = path.join(rootDir, "src", "stocks");
const srcAiDir = path.join(rootDir, "src", "ai");
const srcAiSessionsDir = path.join(rootDir, "src", "ai-sessions");
const srcAiUsageDir = path.join(rootDir, "src", "ai-usage");
const srcWorkersDir = path.join(rootDir, "src", "workers");
const srcReleaseNotesDir = path.join(rootDir, "src", "release-notes");
const outMainDir = path.join(rootDir, "dist-test", "main", "per-file");
const outPlatformDir = path.join(rootDir, "dist-test", "platform");
const outUtilsDir = path.join(rootDir, "dist-test", "utils");
const outConfigDir = path.join(rootDir, "dist-test", "config");
const outDetectorsDir = path.join(rootDir, "dist-test", "detectors");
const outMetalsDir = path.join(rootDir, "dist-test", "metals");
const outFundsDir = path.join(rootDir, "dist-test", "funds");
const outStocksDir = path.join(rootDir, "dist-test", "stocks");
const outAiDir = path.join(rootDir, "dist-test", "ai");
const outAiSessionsDir = path.join(rootDir, "dist-test", "ai-sessions");
const outAiUsageDir = path.join(rootDir, "dist-test", "ai-usage");
const outWorkersDir = path.join(rootDir, "dist-test", "workers");
const outReleaseNotesDir = path.join(rootDir, "dist-test", "release-notes");

function findTsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...findTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function outFileFor(tsFile) {
  if (tsFile.startsWith(srcMainDir + path.sep)) {
    const rel = path.relative(srcMainDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outMainDir, rel);
  }
  if (tsFile.startsWith(srcPlatformDir + path.sep)) {
    const rel = path.relative(srcPlatformDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outPlatformDir, rel);
  }
  if (tsFile.startsWith(srcUtilsDir + path.sep)) {
    const rel = path.relative(srcUtilsDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outUtilsDir, rel);
  }
  if (tsFile.startsWith(srcConfigDir + path.sep)) {
    const rel = path.relative(srcConfigDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outConfigDir, rel);
  }
  if (tsFile.startsWith(srcDetectorsDir + path.sep)) {
    const rel = path.relative(srcDetectorsDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outDetectorsDir, rel);
  }
  if (tsFile.startsWith(srcMetalsDir + path.sep)) {
    const rel = path.relative(srcMetalsDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outMetalsDir, rel);
  }
  if (tsFile.startsWith(srcFundsDir + path.sep)) {
    const rel = path.relative(srcFundsDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outFundsDir, rel);
  }
  if (tsFile.startsWith(srcStocksDir + path.sep)) {
    const rel = path.relative(srcStocksDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outStocksDir, rel);
  }
  if (tsFile.startsWith(srcAiDir + path.sep)) {
    const rel = path.relative(srcAiDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outAiDir, rel);
  }
  if (tsFile.startsWith(srcAiSessionsDir + path.sep)) {
    const rel = path.relative(srcAiSessionsDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outAiSessionsDir, rel);
  }
  if (tsFile.startsWith(srcAiUsageDir + path.sep)) {
    const rel = path.relative(srcAiUsageDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outAiUsageDir, rel);
  }
  if (tsFile.startsWith(srcWorkersDir + path.sep)) {
    const rel = path.relative(srcWorkersDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outWorkersDir, rel);
  }
  if (tsFile.startsWith(srcReleaseNotesDir + path.sep)) {
    const rel = path.relative(srcReleaseNotesDir, tsFile).replace(/\.ts$/, ".cjs");
    return path.join(outReleaseNotesDir, rel);
  }
  return null;
}

function resolveSrcDep(importer, reqPath) {
  const base = path.resolve(path.dirname(importer), reqPath);
  const candidates = [];
  const ext = path.extname(base);
  if (ext) {
    candidates.push(base);
    if (ext === ".ts") candidates.push(base.slice(0, -3) + ".js");
    if (ext === ".js") candidates.push(base.slice(0, -3) + ".ts");
  } else {
    candidates.push(
      base + ".ts",
      base + ".js",
      path.join(base, "index.ts"),
      path.join(base, "index.js"),
    );
  }
  let hit = candidates.find((c) => {
    try {
      return fs.existsSync(c) && fs.statSync(c).isFile();
    } catch {
      return false;
    }
  });
  if (!hit) return null;

  // Prefer .ts as source of truth when both exist.
  if (hit.endsWith(".js")) {
    const ts = hit.slice(0, -3) + ".ts";
    if (fs.existsSync(ts)) hit = ts;
  }

  // Batch 9b: map migrated sources to dist-test .cjs (self-contained graph).
  const mapped = outFileFor(hit);
  if (mapped) return mapped;
  return hit;
}

function buildGroup(esbuild, tsFiles, skip) {
  const jobs = [];
  for (const f of tsFiles) {
    if (skip.has(f)) continue;
    const outFile = outFileFor(f);
    if (!outFile) continue;
    const rel = path.relative(rootDir, outFile);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    jobs.push(
      esbuild
        .build({
          entryPoints: [f],
          bundle: true,
          platform: "node",
          format: "cjs",
          target: "es2020",
          packages: "external",
          outfile: outFile,
          logLevel: "silent",
          // ponytail: Phase 11 — logLevel=silent 已静默, 显式 logOverride 仍是
          // 文档化 (让 reader 知道这些 warnings 故意忽略). 145 file dual-export
          // (module.exports + export {}) 兼容 CJS caller, esbuild 报 commonjs-variable-in-esm.
          logOverride: {
            "commonjs-variable-in-esm": "silent",
          },
          plugins: [
            {
              name: "externalize-src-deps",
              setup(build) {
                build.onResolve({ filter: /.*/ }, (args) => {
                  if (args.kind === "entry-point") return undefined;
                  if (!args.path.startsWith(".") && !path.isAbsolute(args.path)) {
                    return { path: args.path, external: true };
                  }
                  const hit = resolveSrcDep(args.importer, args.path);
                  if (!hit) return { path: args.path, external: true };
                  return { path: hit, external: true };
                });
              },
            },
          ],
        })
        .catch((err) => {
          console.warn(`[build-main-ts] skip ${rel}: ${err && err.message}`);
        }),
    );
  }
  return jobs;
}

module.exports = async function setup() {
  const mainTs = findTsFiles(srcMainDir);
  const platformTs = findTsFiles(srcPlatformDir);
  const configTs = findTsFiles(srcConfigDir);
  const detectorsTs = findTsFiles(srcDetectorsDir);
  const metalsTs = findTsFiles(srcMetalsDir);
  const fundsTs = findTsFiles(srcFundsDir);
  const stocksTs = findTsFiles(srcStocksDir);
  const aiTs = findTsFiles(srcAiDir);
  const aiSessionsTs = findTsFiles(srcAiSessionsDir);
  const aiUsageTs = findTsFiles(srcAiUsageDir);
  const workersTs = findTsFiles(srcWorkersDir);
  const releaseNotesTs = findTsFiles(srcReleaseNotesDir);
  // ponytail: match-key.ts 是 ESM-only（仅 renderer 用），不进 dist-test CJS 图
  const utilsTs = findTsFiles(srcUtilsDir).filter(
    (f) => path.basename(f) !== "match-key.ts",
  );
  const tsFiles = [
    ...mainTs,
    ...platformTs,
    ...configTs,
    ...utilsTs,
    ...detectorsTs,
    ...metalsTs,
    ...fundsTs,
    ...stocksTs,
    ...aiTs,
    ...aiSessionsTs,
    ...aiUsageTs,
    ...workersTs,
    ...releaseNotesTs,
  ];
  if (tsFiles.length === 0) return;

  let newestTsMtime = 0;
  for (const f of tsFiles) {
    const m = fs.statSync(f).mtimeMs;
    if (m > newestTsMtime) newestTsMtime = m;
  }
  const setupMtime = fs.statSync(__filename).mtimeMs;
  if (setupMtime > newestTsMtime) newestTsMtime = setupMtime;

  let needBuild = false;
  for (const f of tsFiles) {
    const outFile = outFileFor(f);
    if (!outFile || !fs.existsSync(outFile)) {
      needBuild = true;
      break;
    }
    if (fs.statSync(outFile).mtimeMs < newestTsMtime) {
      needBuild = true;
      break;
    }
  }

  fs.mkdirSync(outMainDir, { recursive: true });
  fs.mkdirSync(outPlatformDir, { recursive: true });
  fs.mkdirSync(outUtilsDir, { recursive: true });
  fs.mkdirSync(outConfigDir, { recursive: true });
  fs.mkdirSync(outDetectorsDir, { recursive: true });
  fs.mkdirSync(outMetalsDir, { recursive: true });
  fs.mkdirSync(outFundsDir, { recursive: true });
  fs.mkdirSync(outStocksDir, { recursive: true });
  fs.mkdirSync(outAiDir, { recursive: true });
  fs.mkdirSync(outAiSessionsDir, { recursive: true });
  fs.mkdirSync(outAiUsageDir, { recursive: true });
  fs.mkdirSync(outWorkersDir, { recursive: true });
  fs.mkdirSync(outReleaseNotesDir, { recursive: true });

  if (needBuild) {
    const esbuild = require("esbuild");
    const skip = new Set([
      path.join(srcMainDir, "index.ts"),
      path.join(srcMainDir, "ipc.ts"),
      path.join(srcMainDir, "ipc", "index.ts"),
    ]);
    await Promise.all(buildGroup(esbuild, tsFiles, skip));
  }

  copyJsonAssets(srcMainDir, outMainDir);
};

function copyJsonAssets(srcDir, destRoot) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const full = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      copyJsonAssets(full, destRoot);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const rel = path.relative(srcMainDir, full);
    const dest = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(full, dest);
  }
}
