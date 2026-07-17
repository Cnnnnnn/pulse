/**
 * src/main/diagnostics-aggregator.js
 *
 * 2026-06-23: Phase Q1 v2 — top-failure aggregation + tar.gz 诊断包导出.
 *
 * 职责:
 *   - computeTopFailures(entries): 纯函数, 按 (source, message) 聚合, 返 top 5.
 *   - buildTarHeader(name, size): 构造单个 tar header (512 字节), name < 100 字节.
 *   - buildTar(parts): 把多份 {name, content:Buffer|string} 拼成一个 tar (Buffer).
 *     - 文件按 512 字节块对齐, 末尾两 0 块 (EOF marker).
 *     - 不压缩. gzip 由 buildTarGz 单独做.
 *   - buildTarGz(parts): tar + zlib.gzip, 产出 .tar.gz Buffer.
 *   - bundleDiagnostics({ logsDir, errorAggregator, outputDir, sinceMs })
 *     实战: 拉 error-aggregator entries (默认 7 天) + diagnostics state 副本 + raw 日志
 *     → 写 <outputDir>/pulse-diagnostics-{ts}.tar.gz, 返 { ok, path, sizeBytes, fileCount }.
 *
 * 零第三方依赖: tar 是开放格式, 用 Buffer 拼. gzip 走 Node 内置 zlib.
 *
 * 设计取舍:
 *   - tar 不压缩 (gz 才压缩): 单文件 ~100KB errors 也能压到 ~20KB, 完全够用.
 *   - name 限 100 字节 (tar 格式硬约束), 长路径截断. 用户拿到的 .tar.gz 解压就是平铺,
 *     所以文件名不带目录层级.
 *   - parts 可以传 string 或 Buffer; string 默认按 utf-8 编码.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const zlib = require("zlib");

/**
 * 按 (source, message) 聚合 entries, 返 top N (按 count desc, tie → 最近 ts 优先).
 * 纯函数, 不修改原 entries.
 * @param {Array<object>} entries
 * @param {number} [topN=5]
 * @returns {Array<{ source, message, count, firstTs, lastTs }>}
 */
function computeTopFailures(entries, topN = 5) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const buckets = new Map(); // key → { source, message, count, firstTs, lastTs }
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const source = (typeof e.source === "string" && e.source) || "unknown";
    const message = (typeof e.message === "string" && e.message) || "(no message)";
    const key = `${source}::${message}`;
    let b = buckets.get(key);
    if (!b) {
      b = { source, message, count: 0, firstTs: e.ts || 0, lastTs: e.ts || 0 };
      buckets.set(key, b);
    }
    b.count += 1;
    const ts = e.ts || 0;
    if (ts && (!b.firstTs || ts < b.firstTs)) b.firstTs = ts;
    if (ts && ts > b.lastTs) b.lastTs = ts;
  }
  const arr = Array.from(buckets.values());
  arr.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (b.lastTs || 0) - (a.lastTs || 0);
  });
  return arr.slice(0, Math.max(0, topN));
}

// ─── Tar writer (POSIX ustar, simplified) ─────────────────────

/**
 * 单个 tar header 格式 (POSIX ustar):
 *   name:        100 bytes (offset 0)
 *   mode:         8 bytes (offset 100) "0000644\0"
 *   uid:          8 bytes (offset 108)
 *   gid:          8 bytes (offset 116)
 *   size:        12 bytes (offset 124) octal, right-justified, NUL-terminated
 *   mtime:       12 bytes (offset 136)
 *   checksum:     8 bytes (offset 148) — 6 digits + NUL + space
 *   typeflag:     1 byte  (offset 156) '0' = regular file
 *   linkname:   100 bytes (offset 157)
 *   magic:        6 bytes (offset 257) "ustar\0"
 *   version:      2 bytes (offset 263) "00"
 *   uname:       32 bytes (offset 265)
 *   gname:       32 bytes (offset 297)
 *   devmajor:     8 bytes (offset 329)
 *   devminor:     8 bytes (offset 337)
 *   prefix:     155 bytes (offset 345)
 *   padding:    ... (total 512 bytes)
 * 我们只写必需的字段, mode/uid/gid/mtime 用占位 + checksum 用 unsigned 8-bit sum.
 *
 * @param {string} name
 * @param {number} size
 * @returns {Buffer}
 */
function buildTarHeader(name, size) {
  const buf = Buffer.alloc(512, 0);
  // name: 限 100 字节, 截断 + NUL
  const nameBuf = Buffer.from(name.slice(0, 99), "utf-8");
  nameBuf.copy(buf, 0);
  // mode "0000644\0"
  buf.write("0000644\0", 100, 8, "ascii");
  // uid/gid "0000000\0"
  buf.write("0000000\0", 108, 8, "ascii");
  buf.write("0000000\0", 116, 8, "ascii");
  // size (12 bytes, octal, NUL-terminated)
  const sizeOct = size.toString(8).padStart(11, "0") + "\0";
  buf.write(sizeOct, 124, 12, "ascii");
  // mtime (12 bytes)
  const now = Math.floor(Date.now() / 1000);
  const mtimeOct = now.toString(8).padStart(11, "0") + "\0";
  buf.write(mtimeOct, 136, 12, "ascii");
  // checksum 先填 8 个空格 (offset 148)
  for (let i = 0; i < 8; i++) buf[148 + i] = 0x20;
  // typeflag '0'
  buf[156] = 0x30;
  // magic "ustar\0"
  buf.write("ustar\0", 257, 6, "ascii");
  // version "00"
  buf.write("00", 263, 2, "ascii");
  // uname/gname 留 0 即可
  // 计算 checksum
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += buf[i];
  const chk = sum.toString(8).padStart(6, "0") + "\0 ";
  buf.write(chk, 148, 8, "ascii");
  return buf;
}

/**
 * 把多份 part 拼成一个 tar Buffer.
 * @param {Array<{name: string, content: Buffer|string}>} parts
 * @returns {Buffer}
 */
function buildTar(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    // 一个空 tar = 两块 0 (EOF marker)
    return Buffer.alloc(1024, 0);
  }
  const blocks = [];
  for (const p of parts) {
    if (!p || typeof p.name !== "string") continue;
    const buf = Buffer.isBuffer(p.content) ? p.content : Buffer.from(p.content || "", "utf-8");
    blocks.push(buildTarHeader(p.name, buf.length));
    blocks.push(buf);
    // 填充到 512 字节边界
    const pad = (512 - (buf.length % 512)) % 512;
    if (pad > 0) blocks.push(Buffer.alloc(pad, 0));
  }
  // EOF: 两块 512 字节
  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
}

/**
 * tar + gzip.
 * @param {Array<{name: string, content: Buffer|string}>} parts
 * @returns {Buffer}
 */
function buildTarGz(parts) {
  const tar = buildTar(parts);
  return zlib.gzipSync(tar, { level: zlib.constants.Z_DEFAULT_COMPRESSION });
}

/**
 * 把 diagnostics 数据打包到一个 .tar.gz 写到 outputDir.
 * @param {object} opts
 * @param {string} [opts.logsDir]      error-aggregator 目录 (errors-*.jsonl)
 * @param {string[]} [opts.extraLogsDirs]  其他 raw 日志目录 (e.g. ~/Library/Logs/AppUpdateChecker)
 * @param {object} [opts.aggregator]   createAggregator 实例 (有 query 方法)
 * @param {string} [opts.outputDir]    默认 ~/Desktop
 * @param {number} [opts.sinceMs]      默认 7 天
 * @param {object} [opts.extras]       额外要打的 key/value (e.g. { metricsSummary, startup })
 * @param {string} [opts.filename]     默认 pulse-diagnostics-{ts}.tar.gz
 * @returns {{ ok, path, sizeBytes, fileCount }}
 */
/**
 * Stage 1: 复制 errors-*.jsonl 文件 (不在内存里聚合, 避免大文件吃 heap).
 * 仅取 sinceMs 范围内的日期文件 (粗筛, 精确筛选在 entries.jsonl 里做).
 * @returns {Array<object>}
 */
function collectErrorLogs(logsDir, sinceMs) {
  if (!logsDir) return [];
  const parts = [];
  try {
    const files = fs.readdirSync(logsDir).filter((f) => /^errors-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
    for (const f of files) {
      const full = path.join(logsDir, f);
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      const m = f.match(/^errors-(\d{4})-(\d{2})-(\d{2})\.jsonl$/);
      if (m) {
        const fileMs = Date.UTC(+m[1], +m[2] - 1, +m[3]);
        if (fileMs < sinceMs - 86400_000) continue; // 留一天余量
      }
      parts.push({ name: `errors/${f}`, content: fs.readFileSync(full) });
    }
  } catch { /* noop */ }
  return parts;
}

/**
 * Stage 2: 拉 entries + 算 top failures + 写一份 errors-aggregated.json 索引.
 * @returns {Promise<Array<object>>}
 */
async function collectAggregated(aggregator, sinceMs) {
  if (!aggregator || typeof aggregator.query !== "function") {
    return [];
  }
  try {
    const r = await aggregator.query({ since: sinceMs, limit: 5000 });
    const top = computeTopFailures(r.entries || [], 10);
    const summary = {
      window: { since: sinceMs, generatedAt: Date.now() },
      stats: r.stats || { total: 0, byLevel: {}, skipped: 0 },
      topFailures: top,
      entryCount: (r.entries || []).length,
    };
    return [
      {
        name: "errors-aggregated.json",
        content: JSON.stringify(summary, null, 2),
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Stage 3: 复制 raw 日志 (startup.log / detect.log). 同名文件冲突时第一个目录胜出.
 * @returns {Array<object>}
 */
function collectRawLogs(logsDir, extraLogsDirs, seenNames) {
  const rawLogDirs = [];
  if (logsDir) rawLogDirs.push(logsDir);
  for (const d of extraLogsDirs) {
    if (d && !rawLogDirs.includes(d)) rawLogDirs.push(d);
  }
  const parts = [];
  for (const dir of rawLogDirs) {
    for (const fname of ["startup.log", "detect.log"]) {
      const full = path.join(dir, fname);
      try {
        if (fs.existsSync(full)) {
          // 命名空间用 logs/ 方便用户解压后找到 (避免同名文件冲突: 第一个目录胜出)
          const tarName = `logs/${fname}`;
          if (!seenNames.has(tarName)) {
            parts.push({ name: tarName, content: fs.readFileSync(full) });
            seenNames.add(tarName);
          }
        }
      } catch { /* noop */ }
    }
  }
  return parts;
}

/**
 * Stage 4: extras (metrics summary / startup / etc.). 防御循环引用导致
 * JSON.stringify 抛错 — extras 是调用方拼的对象, 源不可控.
 * @returns {Array<object>}
 */
function collectExtras(extras) {
  if (!extras || typeof extras !== "object" || Object.keys(extras).length === 0) {
    return [];
  }
  let content;
  try {
    content = JSON.stringify(extras, null, 2);
  } catch {
    return [];
  }
  return [{ name: "diagnostics.json", content }];
}

/**
 * Stage 5: manifest.txt — 文件清单.
 */
function buildManifestPart(parts, fileCount) {
  const manifest = [
    "Pulse diagnostics bundle",
    `generated: ${new Date().toISOString()}`,
    `fileCount: ${fileCount}`,
    "",
    "Files:",
    ...parts.map((p) => `  - ${p.name} (${p.content.length} bytes)`),
  ].join("\n");
  return { name: "manifest.txt", content: manifest };
}

async function bundleDiagnostics(opts) {
  const {
    logsDir,
    extraLogsDirs = [],
    aggregator,
    outputDir = path.join(os.homedir(), "Desktop"),
    sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000,
    extras = {},
    filename,
  } = opts || {};

  const parts = [];
  const seenNames = new Set(); // for collectRawLogs 去重

  // 1. errors-*.jsonl — 直接复制文件
  parts.push(...collectErrorLogs(logsDir, sinceMs));

  // 2. errors-aggregated.json — 拉 entries + 算 top failures
  parts.push(...await collectAggregated(aggregator, sinceMs));

  // 3. raw 日志: startup.log / detect.log
  parts.push(...collectRawLogs(logsDir, extraLogsDirs, seenNames));

  // 4. extras (metrics summary / startup / etc.)
  parts.push(...collectExtras(extras));

  // 5. manifest.txt — 文件清单
  parts.push(buildManifestPart(parts, parts.length));
  const fileCount = parts.length;

  const buf = buildTarGz(parts);

  // 写盘
  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: `mkdir failed: ${err && err.message}`, fileCount };
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outName = filename || `pulse-diagnostics-${ts}.tar.gz`;
  const outPath = path.join(outputDir, outName);
  try {
    fs.writeFileSync(outPath, buf);
  } catch (err) {
    return { ok: false, error: `write failed: ${err && err.message}`, fileCount };
  }
  return { ok: true, path: outPath, sizeBytes: buf.length, fileCount };
}

module.exports = {
  computeTopFailures,
  buildTarHeader,
  buildTar,
  buildTarGz,
  bundleDiagnostics,
};