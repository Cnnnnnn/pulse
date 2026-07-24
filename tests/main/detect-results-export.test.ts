/**
 * tests/main/detect-results-export.test.js
 *
 * C7 — detect-results-export 纯函数 + 写盘.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  pickExportFields,
  buildExportPayload,
  toCsv,
  exportDetectResults,
  CSV_COLUMNS,
} = requireMain("detect-results-export");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-c7-export-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("pickExportFields", () => {
  it("摘核心字段, 丢掉 trace/changelog", () => {
    const row = pickExportFields({
      name: "Cursor",
      bundle: "Cursor.app",
      installed_version: "1.0",
      latest_version: "2.0",
      has_update: true,
      status: "update_available",
      source: "brew_formulae",
      note: "",
      brew_cask: "cursor",
      ts: 1000,
      trace: [{ detector: "x" }],
      changelog: "# big markdown",
    });
    expect(row).toEqual({
      name: "Cursor",
      bundle: "Cursor.app",
      installed_version: "1.0",
      latest_version: "2.0",
      has_update: true,
      status: "update_available",
      source: "brew_formulae",
      note: "",
      brew_cask: "cursor",
      ts: 1000,
    });
    expect(row.trace).toBeUndefined();
  });

  it("缺 name → null", () => {
    expect(pickExportFields({ bundle: "x.app" })).toBeNull();
  });
});

describe("buildExportPayload", () => {
  it("按 name 排序 + 计数", () => {
    const payload = buildExportPayload({
      apps: {
        Zed: { name: "Zed", installed_version: "1", latest_version: "1", has_update: false, status: "up_to_date" },
        Cursor: { name: "Cursor", installed_version: "1", latest_version: "2", has_update: true, status: "update_available" },
      },
    }, "2.35.0");
    expect(payload.pulseVersion).toBe("2.35.0");
    expect(payload.count).toBe(2);
    expect(payload.apps.map((a) => a.name)).toEqual(["Cursor", "Zed"]);
    expect(payload.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("toCsv", () => {
  it("表头 + 行, 逗号/引号转义", () => {
    const csv = toCsv([
      {
        name: "App, Inc",
        bundle: "App.app",
        installed_version: "1",
        latest_version: '2"beta',
        has_update: true,
        status: "update_available",
        source: "api",
        note: "line\nbreak",
        brew_cask: "",
        ts: 42,
      },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(csv).toContain('"App, Inc"');
    expect(csv).toContain('"2""beta"');
    expect(csv).toContain('"line\nbreak"');
  });
});

describe("exportDetectResults", () => {
  it("json → 写出文件", () => {
    const state = {
      apps: {
        Foo: { name: "Foo", installed_version: "1", latest_version: "1", has_update: false, status: "up_to_date" },
      },
    };
    const r = exportDetectResults({ state, format: "json", outputDir: tmpDir, pulseVersion: "2.35.0" });
    expect(r.ok).toBe(true);
    expect(r.rowCount).toBe(1);
    expect(fs.existsSync(r.path)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(r.path, "utf8"));
    expect(parsed.apps[0].name).toBe("Foo");
    expect(parsed.pulseVersion).toBe("2.35.0");
  });

  it("csv → 写出文件", () => {
    const r = exportDetectResults({
      state: { apps: { Bar: { name: "Bar", installed_version: "x", latest_version: "y", has_update: true, status: "update_available" } } },
      format: "csv",
      outputDir: tmpDir,
    });
    expect(r.ok).toBe(true);
    const text = fs.readFileSync(r.path, "utf8");
    expect(text).toContain("name,bundle,");
    expect(text).toContain("Bar,");
  });

  it("bad format → ok:false", () => {
    const r = exportDetectResults({ state: {}, format: "xml", outputDir: tmpDir });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("bad_format");
  });
});
