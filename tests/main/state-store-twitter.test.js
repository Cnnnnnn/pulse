/**
 * tests/main/state-store-twitter.test.js
 *
 * 验证 twitter cache / sources 的 load/save 函数遵循 patchState 范式
 * (atomic write + preserveExtraFields 保留其他字段), 跟 saveWorldcupTxt 同款.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  loadTwitterCache,
  saveTwitterCache,
  loadTwitterSources,
  saveTwitterSources,
  DEFAULT_TWITTER_SOURCES,
} from "../../src/main/state-store.js";

let tmpDir;
let statePath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-tw-"));
  statePath = path.join(tmpDir, "state.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seed(j) {
  fs.writeFileSync(statePath, JSON.stringify(j, null, 2));
}

describe("state-store twitter cache/sources", () => {
  it("loadTwitterCache 无值返回 null", () => {
    seed({ v: 1, ts: 0, apps: {} });
    expect(loadTwitterCache(statePath)).toBeNull();
  });

  it("saveTwitterCache + loadTwitterCache round-trip", () => {
    seed({ v: 1, ts: 0, apps: {} });
    saveTwitterCache(
      {
        handle: "aleabitoreddit",
        lastFetchedAt: "2026-06-22T10:00:00Z",
        consecutiveFailureCount: 0,
        tweets: [{ id: "1", text: "hi" }],
        translations: {},
      },
      statePath,
    );
    const loaded = loadTwitterCache(statePath);
    expect(loaded).toBeTruthy();
    expect(loaded.handle).toBe("aleabitoreddit");
    expect(loaded.tweets).toHaveLength(1);
    expect(loaded.tweets[0].id).toBe("1");
  });

  it("saveTwitterCache 保留 state 其他字段 (apps / mutes)", () => {
    seed({
      v: 1,
      ts: 0,
      apps: { Cursor: { name: "Cursor" } },
      mutes: {},
    });
    saveTwitterCache(
      { handle: "h", tweets: [], translations: {} },
      statePath,
    );
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect(raw.apps.Cursor).toEqual({ name: "Cursor" });
    expect(raw.mutes).toEqual({});
    expect(raw.twitterCache).toBeTruthy();
  });

  it("loadTwitterSources 无值返回默认 4 镜像", () => {
    seed({ v: 1, ts: 0, apps: {} });
    const sources = loadTwitterSources(statePath);
    expect(sources).toHaveLength(4);
    const types = sources.map((s) => s.type);
    expect(types.filter((t) => t === "nitter").length).toBe(3);
    expect(types).toContain("rsshub");
  });

  it("saveTwitterSources + loadTwitterSources round-trip", () => {
    seed({ v: 1, ts: 0, apps: {} });
    saveTwitterSources(
      [
        {
          id: "x",
          type: "nitter",
          url: "http://x",
          enabled: true,
          priority: 1,
        },
      ],
      statePath,
    );
    const loaded = loadTwitterSources(statePath);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("x");
  });

  it("loadTwitterSources 空数组回退默认 (不返回 [])", () => {
    seed({ v: 1, ts: 0, apps: {} });
    saveTwitterSources([], statePath);
    const loaded = loadTwitterSources(statePath);
    expect(loaded).toHaveLength(4);
  });

  it("DEFAULT_TWITTER_SOURCES 导出可见且含 4 项", () => {
    expect(Array.isArray(DEFAULT_TWITTER_SOURCES)).toBe(true);
    expect(DEFAULT_TWITTER_SOURCES).toHaveLength(4);
  });
});
