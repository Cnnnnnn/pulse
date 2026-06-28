/**
 * tests/main/release-notes-loader.test.js
 *
 * ON: loader 纯函数测试. 用 __setTestRepoRoot 注入 repoRoot,
 * 在 tmpDir 里造 fixture 文件 (versions/<ver>.md + src/release-notes-content/<ver>/slides.json),
 * 测 readReleaseNotes / readSlides 的所有路径.
 *
 * 不走 vi.mock('fs') — 真实 fs 行为更可靠, 跟现有 state-store 测试风格一致.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import os from "os";
import fs from "fs";
import {
  readReleaseNotes,
  readSlides,
  __setTestRepoRoot,
  __resetTestRepoRoot,
} from "../../src/release-notes/loader.js";

let tmpDir;
let repoRoot;
let contentRoot;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-rn-loader-"));
  repoRoot = tmpDir;
  contentRoot = path.join(tmpDir, "src", "release-notes-content");
  fs.mkdirSync(contentRoot, { recursive: true });
  __setTestRepoRoot(repoRoot);
});

afterEach(() => {
  __resetTestRepoRoot();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("readReleaseNotes", () => {
  it("returns md content when file exists", () => {
    fs.mkdirSync(path.join(repoRoot, "versions"), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, "versions", "2.32.0.md"),
      "# v2.32.0\n\n## 新增\n- foo",
    );
    const md = readReleaseNotes("2.32.0");
    expect(md).toContain("# v2.32.0");
    expect(md).toContain("foo");
  });

  it("returns null when file missing", () => {
    expect(readReleaseNotes("9.9.9")).toBeNull();
  });

  it("returns null on read error (does not throw)", () => {
    // 目录占位 versions/2.32.0.md → readFileSync 会 EISDIR
    fs.mkdirSync(path.join(repoRoot, "versions"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "versions", "2.32.0.md"));
    expect(readReleaseNotes("2.32.0")).toBeNull();
  });
});

describe("readSlides", () => {
  it("returns parsed slides when file exists and valid", () => {
    const dir = path.join(contentRoot, "2.32.0");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "slides.json"),
      JSON.stringify({
        version: "2.32.0",
        slides: [
          { id: "a", title: "A", subtitle: "s", body: "a-body" },
          { id: "b", title: "B", subtitle: "s", body: "b-body" },
        ],
      }),
    );
    const result = readSlides("2.32.0");
    expect(result).toEqual({
      version: "2.32.0",
      slides: [
        { id: "a", title: "A", subtitle: "s", body: "a-body" },
        { id: "b", title: "B", subtitle: "s", body: "b-body" },
      ],
    });
  });

  it("returns null when file missing", () => {
    expect(readSlides("2.32.0")).toBeNull();
  });

  it("returns null on JSON parse error", () => {
    const dir = path.join(contentRoot, "2.32.0");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "slides.json"), "{ invalid json");
    expect(readSlides("2.32.0")).toBeNull();
  });

  it("returns null on schema failure (missing version)", () => {
    const dir = path.join(contentRoot, "2.32.0");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "slides.json"),
      JSON.stringify({ slides: [] }),
    );
    expect(readSlides("2.32.0")).toBeNull();
  });

  it("returns null on schema failure (missing slides)", () => {
    const dir = path.join(contentRoot, "2.32.0");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "slides.json"),
      JSON.stringify({ version: "2.32.0" }),
    );
    expect(readSlides("2.32.0")).toBeNull();
  });

  it("returns null when slides array is empty", () => {
    const dir = path.join(contentRoot, "2.32.0");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "slides.json"),
      JSON.stringify({ version: "2.32.0", slides: [] }),
    );
    expect(readSlides("2.32.0")).toBeNull();
  });
});
