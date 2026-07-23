/**
 * vitest globalSetup: build each migrated src/main .ts file into a per-file
 * CommonJS bundle under dist-test/main/per-file/.
 *
 * 解 Phase 3 Batch 4 vitest blocker: 测试用 createRequire(import.meta.url) 拿到
 * native Node cjs require, 绕开 vite-node 解析链. 业务代码 .js shim 必须指向
 * 真实可加载的产物. 这里同步 esbuild 每个 .ts → .cjs, shim 改 require 到
 * 生成的 .cjs (native cjs 直接 require 工作).
 *
 * 性能: 68 个 .ts × esbuild.buildSync ~10ms ≈ 700ms; mtime cache 跳过无改动
 * 的文件. 产物 .cjs 内部 require 走 native node cjs, 链上业务 .js 文件 native
 * require 直接工作.
 *
 * ponytail: 与 scripts/build-main.cjs (生产 bundle) 分离 — 那条链负责
 *          整个 main bundle, 这条链只服务于测试侧 native cjs require.
 * ceiling: Phase 3 Batch 9 把所有业务 require 改为 "./*.ts" 显式后缀,
 *          业务 .js shim 可删, 此 setup 同步退役.
 */
const path = require("node:path");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..", "..");
const srcMainDir = path.join(rootDir, "src", "main");
const outDir = path.join(rootDir, "dist-test", "main", "per-file");

function findTsFiles(dir) {
  const out = [];
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

module.exports = function setup() {
  if (!fs.existsSync(srcMainDir)) return;
  const tsFiles = findTsFiles(srcMainDir);
  if (tsFiles.length === 0) return;
  let newestTsMtime = 0;
  for (const f of tsFiles) {
    const m = fs.statSync(f).mtimeMs;
    if (m > newestTsMtime) newestTsMtime = m;
  }
  let needBuild = false;
  for (const f of tsFiles) {
    const rel = path.relative(srcMainDir, f).replace(/\.ts$/, ".cjs");
    const outFile = path.join(outDir, rel);
    if (!fs.existsSync(outFile)) {
      needBuild = true;
      break;
    }
    if (fs.statSync(outFile).mtimeMs < newestTsMtime) {
      needBuild = true;
      break;
    }
  }
  if (!needBuild) return;

  fs.mkdirSync(outDir, { recursive: true });
  const esbuild = require("esbuild");
  for (const f of tsFiles) {
    const rel = path.relative(srcMainDir, f).replace(/\.ts$/, ".cjs");
    const outFile = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    esbuild.buildSync({
      entryPoints: [f],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "es2020",
      external: ["electron", "electron-*"],
      packages: "external",
      outfile: outFile,
      logLevel: "silent",
    });
  }
};
