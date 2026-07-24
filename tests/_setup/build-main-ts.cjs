/**
 * vitest globalSetup: transpile migrated src/main + src/platform .ts files into
 * per-file CommonJS artifacts under dist-test/.
 *
 * Phase 3 Batch 9b: dist-test 图自包含 — 相对依赖 external 到 sibling
 * dist-test .cjs (不再绕 src .js shim). 业务 .js shim 可删; 测试用
 * tests/_setup/require-main.cjs 加载产物.
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
const outMainDir = path.join(rootDir, "dist-test", "main", "per-file");
const outPlatformDir = path.join(rootDir, "dist-test", "platform");

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
  const tsFiles = [...mainTs, ...platformTs];
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
