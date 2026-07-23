/**
 * vitest globalSetup: transpile each migrated src/main .ts file into a per-file
 * CommonJS artifact under dist-test/main/per-file/.
 *
 * 解 Phase 3 Batch 4 vitest blocker: 测试用 createRequire(import.meta.url) 拿到
 * native Node cjs require, 绕开 vite-node 解析链. 业务 .js shim 指向本产物.
 *
 * 重要: 相对依赖必须 external (不能 bundle 进同一文件):
 *   - bundle 会把 module.exports = singleton 收成 named-export 包装,
 *     导致 livebenchFetcher.fetch 变成 undefined
 *   - bundle 会使 require.cache stub (如 register-ai-usage) 失效
 *
 * 相对 require 重写为 src 下绝对路径: 有 .js shim 优先走 shim→dist-test;
 * 仅有 .ts 的模块 (如 ipc/register-ai-usage.ts) 保留 .ts 绝对路径,
 * 供测试 require.cache stub.
 *
 * ponytail: 与 scripts/build-main.cjs (生产 bundle) 分离.
 * ceiling: Phase 3 Batch 9 业务 require 改 "./*.ts" 显式后缀后,
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
      base + ".js",
      base + ".ts",
      path.join(base, "index.js"),
      path.join(base, "index.ts"),
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
  // Prefer .js shim when both exist so dual-path → dist-test works.
  if (hit.endsWith(".ts")) {
    const js = hit.slice(0, -3) + ".js";
    if (fs.existsSync(js)) hit = js;
  }
  return hit;
}

module.exports = async function setup() {
  if (!fs.existsSync(srcMainDir)) return;
  const tsFiles = findTsFiles(srcMainDir);
  if (tsFiles.length === 0) return;
  let newestTsMtime = 0;
  for (const f of tsFiles) {
    const m = fs.statSync(f).mtimeMs;
    if (m > newestTsMtime) newestTsMtime = m;
  }
  // Also rebuild when this setup script itself changes.
  const setupMtime = fs.statSync(__filename).mtimeMs;
  if (setupMtime > newestTsMtime) newestTsMtime = setupMtime;

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
  fs.mkdirSync(outDir, { recursive: true });

  if (needBuild) {
    const esbuild = require("esbuild");
    // Skip app entry points — they pull the whole graph and aren't required as
    // per-file test artifacts. Leaf modules use shim fallback to .ts when
    // dist-test is missing mid-build.
    const skip = new Set([
      path.join(srcMainDir, "index.ts"),
      path.join(srcMainDir, "ipc.ts"),
      path.join(srcMainDir, "ipc", "index.ts"),
    ]);

    const jobs = [];
    for (const f of tsFiles) {
      if (skip.has(f)) continue;
      const rel = path.relative(srcMainDir, f).replace(/\.ts$/, ".cjs");
      const outFile = path.join(outDir, rel);
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
            // ponytail: one leaf failure shouldn't abort the whole setup; the
            // affected test will surface the missing .cjs clearly.
            console.warn(`[build-main-ts] skip ${rel}: ${err && err.message}`);
          }),
      );
    }
    await Promise.all(jobs);
  }

  // Colocated JSON (e.g. ai-leaderboard/sample.json) must sit next to the
  // per-file .cjs so path.join(__dirname, "sample.json") still resolves.
  // Always refresh — cheap, and covers the needBuild=false path.
  copyJsonAssets(srcMainDir);
};

function copyJsonAssets(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      copyJsonAssets(full);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const rel = path.relative(srcMainDir, full);
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(full, dest);
  }
}
