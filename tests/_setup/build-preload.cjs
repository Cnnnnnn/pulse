/**
 * vitest globalSetup: 干净 checkout 兜底.
 *
 * dist/preload.js 是 esbuild 从 preload.ts 编译的 CommonJS bundle, 已被 .gitignore 排除.
 * 任何 require('../dist/preload.js') / readFileSync('dist/preload.js') 的测试在干净
 * checkout 下都找不到产物. npm test 有 pretest 钩子跑 build:preload; 但 pnpm exec
 * vitest --run (CI release job 当前用法) 不会触发 npm lifecycle.
 *
 * 这里在 vitest worker fork 启动前同步构建一次 — 覆盖所有 vitest 入口 (npm test,
 * pnpm exec vitest, vitest run) 与并发测试. 同步 esbuild.buildSync ~10ms 一次,
 * ponytail: 升级 esbuild 大版本 (改 API 签名) 时, 这是唯一的同步点; 实际 build
 *          逻辑可平移到其他 bundler.
 */
const path = require("node:path");
const fs = require("node:fs");

const PRELOAD_TS = path.resolve(__dirname, "..", "..", "preload.ts");
const PRELOAD_JS = path.resolve(__dirname, "..", "..", "dist", "preload.js");

module.exports = function setup() {
  if (fs.existsSync(PRELOAD_JS)) return;
  fs.mkdirSync(path.dirname(PRELOAD_JS), { recursive: true });
  // 解析 esbuild 走 vitest node_modules (vitest 已把 esbuild 列为 peer/dep,
  // 仓库 devDependencies 也列了 esbuild — 不引入新依赖).
  const esbuild = require("esbuild");
  esbuild.buildSync({
    entryPoints: [PRELOAD_TS],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    outfile: PRELOAD_JS,
    target: "es2020",
    logLevel: "silent",
  });
};
