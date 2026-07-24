/**
 * tests/main/diagnostics-aggregator.test.js
 *
 * 2026-06-23: Phase Q1 v2 — top-failure aggregation + tar.gz bundle.
 *
 * 覆盖:
 *   - computeTopFailures: 排序 + 桶化 + topN 截断 / 空 / 异常 entries 兜底
 *   - buildTarHeader: 512 字节固定 + magic/version/typeflag 正确 + checksum 验算
 *   - buildTar: 多文件 + 512 边界填充 + EOF 两块 0
 *   - buildTarGz: 产出 Buffer 头部是 gzip magic (0x1f 0x8b)
 *   - bundleDiagnostics: aggregator query + raw 日志 + extras → 写出 .tar.gz
 *
 * 端到端检查: tar 里有一个 `manifest.txt` + 用户数据, 文件数对得上.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import zlib from "zlib";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  computeTopFailures,
  buildTarHeader,
  buildTar,
  buildTarGz,
  bundleDiagnostics,
} = requireMain("diagnostics-aggregator");

describe("computeTopFailures", () => {
  it("按 (source, message) 桶化, 按 count desc 排序, 返 top 5", () => {
    const entries = [
      { ts: 100, source: "main", message: "boom A" },
      { ts: 200, source: "main", message: "boom A" },
      { ts: 300, source: "main", message: "boom A" },
      { ts: 400, source: "main", message: "boom B" },
      { ts: 500, source: "renderer", message: "boom C" },
      { ts: 600, source: "renderer", message: "boom C" },
    ];
    const top = computeTopFailures(entries, 5);
    expect(top).toHaveLength(3);
    expect(top[0]).toMatchObject({ source: "main", message: "boom A", count: 3, firstTs: 100, lastTs: 300 });
    // tie between B (1) and C (2): C wins by count
    expect(top[1].message).toBe("boom C");
    expect(top[2].message).toBe("boom B");
  });

  it("tie 时按最近 ts 优先", () => {
    const entries = [
      { ts: 100, source: "a", message: "x" },
      { ts: 200, source: "b", message: "x" },
      { ts: 300, source: "c", message: "x" },
    ];
    const top = computeTopFailures(entries, 5);
    expect(top[0].source).toBe("c"); // ts=300 最新
    expect(top[2].source).toBe("a"); // ts=100 最旧
  });

  it("topN 截断", () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({ ts: i, source: "s", message: `m${i}` }));
    expect(computeTopFailures(entries, 3)).toHaveLength(3);
  });

  it("空 entries → 返 []; null/undefined/非对象 → 跳过; 对象但字段缺 → 桶化到 unknown/(no message)", () => {
    expect(computeTopFailures([])).toEqual([]);
    expect(computeTopFailures(null)).toEqual([]);
    expect(computeTopFailures(undefined)).toEqual([]);
    // null / undefined / 字符串 → skip; {} → 桶化到 default 一次
    const r = computeTopFailures([null, undefined, {}, "str"]);
    expect(r).toHaveLength(1);
    expect(r[0].count).toBe(1);
    expect(r[0].source).toBe("unknown");
    expect(r[0].message).toBe("(no message)");
  });

  it("缺 source/message 字段 → 用 unknown / (no message) 兜底", () => {
    const entries = [
      { ts: 1 },                       // 没 source + message
      { ts: 2, source: "main" },        // 没 message
      { ts: 3, message: "x" },          // 没 source
      { ts: 4, source: 123, message: 456 }, // 类型不对
    ];
    const top = computeTopFailures(entries);
    expect(top.length).toBeGreaterThanOrEqual(2);
    const key0 = `${top[0].source}::${top[0].message}`;
    expect(["unknown::(no message)", "main::(no message)", "unknown::x"]).toContain(key0);
  });
});

describe("buildTarHeader", () => {
  it("产出 512 字节固定大小", () => {
    const h = buildTarHeader("test.txt", 100);
    expect(h.length).toBe(512);
  });
  it("magic / version / typeflag 正确", () => {
    const h = buildTarHeader("foo.json", 12);
    // magic = "ustar\0"
    expect(h.slice(257, 263).toString("ascii")).toBe("ustar\0");
    // version = "00"
    expect(h.slice(263, 265).toString("ascii")).toBe("00");
    // typeflag = '0' (regular file)
    expect(h[156]).toBe(0x30);
  });
  it("name 写入前 100 字节", () => {
    const h = buildTarHeader("hello.txt", 5);
    expect(h.slice(0, 9).toString("ascii")).toBe("hello.txt");
  });
  it("name > 99 字节被截断", () => {
    const longName = "x".repeat(200);
    const h = buildTarHeader(longName, 1);
    // 截断后 99 字节 + 1 NUL
    const nameBuf = h.slice(0, 100);
    const nameStr = nameBuf.toString("ascii").replace(/\0+$/, "");
    expect(nameStr.length).toBe(99);
  });
  it("checksum 字段是 6 位 octal + NUL + space", () => {
    const h = buildTarHeader("a", 0);
    // offset 148, 8 bytes
    const chk = h.slice(148, 156).toString("ascii");
    expect(chk).toMatch(/^[0-7]{6}\0 $/);
  });
});

describe("buildTar", () => {
  it("空 parts → 1024 字节 (EOF marker)", () => {
    const t = buildTar([]);
    expect(t.length).toBe(1024);
    // 最后两块全 0
    expect(t.slice(512, 1024).equals(Buffer.alloc(512, 0))).toBe(true);
  });
  it("单文件 → header(512) + content + padding 到 512 边界 + EOF(1024)", () => {
    const t = buildTar([{ name: "a.txt", content: "hello" }]);
    // header 512 + "hello" (5) + 507 padding + EOF 1024 = 2048
    expect(t.length).toBe(512 + 512 + 1024);
    // content 在 offset 512 起始
    expect(t.slice(512, 517).toString("utf-8")).toBe("hello");
  });
  it("多文件按顺序拼接", () => {
    const t = buildTar([
      { name: "a", content: "AA" },
      { name: "b", content: "BBB" },
    ]);
    // 总: 512 + 512 + 512 + 512 + 1024 = 3072
    expect(t.length).toBe(3072);
  });
  it("支持 Buffer content", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    const t = buildTar([{ name: "bin", content: buf }]);
    expect(t.slice(512, 516).equals(buf)).toBe(true);
  });
  it("parts 跳过非法项 (null / 无 name)", () => {
    const t = buildTar([
      null,
      { content: "no name" },          // 没 name → skip
      { name: 123, content: "x" },      // name 非 string → skip
      { name: "good", content: "ok" },
    ]);
    // 只有 "good" 被写入 (空字符串 name 算合法 string, 也会写)
    expect(t.length).toBe(512 + 512 + 1024);
  });

  it("name 是空字符串 仍写入 (tar 格式允许, 但文件无法解压)", () => {
    const t = buildTar([{ name: "", content: "x" }]);
    expect(t.length).toBe(512 + 512 + 1024);
  });
});

describe("buildTarGz", () => {
  it("产物以 gzip magic 开头 (0x1f 0x8b)", () => {
    const gz = buildTarGz([{ name: "a.txt", content: "hello world" }]);
    expect(gz[0]).toBe(0x1f);
    expect(gz[1]).toBe(0x8b);
  });
  it("gunzip 回去跟原 tar 一致", () => {
    const gz = buildTarGz([{ name: "a", content: "x" }, { name: "b", content: "yy" }]);
    const back = zlib.gunzipSync(gz);
    const tar = buildTar([{ name: "a", content: "x" }, { name: "b", content: "yy" }]);
    expect(back.equals(tar)).toBe(true);
  });
});

describe("bundleDiagnostics", () => {
  let tmpDir, outDir;
  let todayErrorsName;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-bundle-"));
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-bundle-out-"));
    // ponytail: 用今日日期生成 errors-YYYY-MM-DD.jsonl — bundleDiagnostics 按
    // sinceMs-1d 过滤, 写死日期 (如 2026-06-23) 跨年/跨周后会被静默丢弃, tar 缺文件.
    const d = new Date();
    todayErrorsName = `errors-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}.jsonl`;
    fs.writeFileSync(
      path.join(tmpDir, todayErrorsName),
      [
        JSON.stringify({ ts: Date.now() - 86400_000, source: "main", level: "error", message: "boom A" }),
        JSON.stringify({ ts: Date.now(), source: "main", level: "error", message: "boom A" }),
        JSON.stringify({ ts: Date.now(), source: "renderer", level: "warn", message: "boom C" }),
      ].join("\n") + "\n",
    );
    // 写一个 startup.log
    fs.mkdirSync(path.join(tmpDir, "logs"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "logs", "startup.log"), "[startup] mock log content\n");
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("写出 .tar.gz + manifest.txt + errors + aggregated + logs", async () => {
    const fakeAgg = {
      query: async () => ({
        entries: [
          { ts: 1, source: "main", message: "boom A" },
          { ts: 2, source: "main", message: "boom A" },
          { ts: 3, source: "main", message: "boom B" },
        ],
        stats: { total: 3, byLevel: { error: 2, warn: 1 }, skipped: 0 },
      }),
    };
    const r = await bundleDiagnostics({
      logsDir: tmpDir,                       // error-aggregator 目录 (errors-*.jsonl)
      extraLogsDirs: [path.join(tmpDir, "logs")],  // main/log.js 日志目录
      aggregator: fakeAgg,
      outputDir: outDir,
      extras: { metricsSummary: { count: 5 } },
    });
    expect(r.ok).toBe(true);
    expect(r.path).toBeTruthy();
    expect(fs.existsSync(r.path)).toBe(true);
    expect(r.sizeBytes).toBeGreaterThan(0);
    expect(r.fileCount).toBeGreaterThanOrEqual(4);

    // 验证 gunzip + tar 解出来确实有这些文件
    const gz = fs.readFileSync(r.path);
    const tar = zlib.gunzipSync(gz);
    const names = [];
    let i = 0;
    while (i < tar.length) {
      const header = tar.slice(i, i + 512);
      if (header[0] === 0) break; // EOF
      const name = header.slice(0, 100).toString("ascii").replace(/\0+$/, "");
      const sizeOct = header.slice(124, 136).toString("ascii").replace(/\0+$/, "");
      const size = parseInt(sizeOct, 8) || 0;
      const content = tar.slice(i + 512, i + 512 + size).toString("utf-8");
      names.push({ name, size, content });
      const padded = Math.ceil(size / 512) * 512;
      i += 512 + padded;
    }
    const namesList = names.map((n) => n.name);
    expect(namesList).toContain("manifest.txt");
    expect(namesList).toContain(`errors/${todayErrorsName}`);
    expect(namesList).toContain("errors-aggregated.json");
    expect(namesList).toContain("logs/startup.log");
    expect(namesList).toContain("diagnostics.json");
    expect(r.fileCount).toBe(names.length);
    expect(names.find((n) => n.name === "manifest.txt").content).toContain(
      `fileCount: ${names.length - 1}`,
    );
  });

  it("aggregator missing → 跳过 aggregated 但 manifest 仍在", async () => {
    const r = await bundleDiagnostics({
      logsDir: tmpDir,
      aggregator: null,
      outputDir: outDir,
    });
    expect(r.ok).toBe(true);
    // 至少有 manifest + raw 日志
    expect(r.fileCount).toBeGreaterThanOrEqual(2);
  });

  it("outputDir 创建失败 → ok:false reason", async () => {
    // 用一个已存在的文件作为 outputDir 父目录: 不能在文件下建子目录,
    // 跨平台一致 (Linux/macOS/Windows 都拒绝 mkdir <file>/blah).
    // 之前用 "/nonexistent-root-abc-xyz/blah" 想靠根目录不可写触发失败,
    // 但 Windows 没有根目录概念, 该路径会落到当前盘符下可创建 → mkdir 成功.
    const blockingFile = path.join(tmpDir, "a-file-not-a-dir");
    fs.writeFileSync(blockingFile, "x");
    const r = await bundleDiagnostics({
      logsDir: tmpDir,
      outputDir: path.join(blockingFile, "blah"),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/mkdir failed/);
  });
});