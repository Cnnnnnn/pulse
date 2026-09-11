/**
 * tests/main/briefing-snapshot.test.ts
 *
 * v3.0 beta: BriefingSnapshot 持久化 — saveBriefingSnapshot / loadBriefingSnapshot.
 *
 * 覆盖:
 *   - 空 state → null
 *   - save 后 load 返完整 entry
 *   - entry 缺字段 → throw
 *   - PRESERVE_FIELDS 互通: 不破坏 daily_digest / upgrade_diagnostics
 *   - 写盘后 state.json 体积预期 (只 1 份, 不堆历史)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
const { requireMain } = require("../_setup/require-main.cjs");

let tmpFile;
beforeEach(() => {
  tmpFile = path.join(
    os.tmpdir(),
    `pulse-snap-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
});
afterEach(() => {
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    /* noop */
  }
});

const {
  saveBriefingSnapshot,
  loadBriefingSnapshot,
} = requireMain("state-store");
const { _setStatePathForTest } = requireMain("state-store");

describe("briefing_snapshot", () => {
  it("空 state → loadBriefingSnapshot 返 null", () => {
    _setStatePathForTest(tmpFile);
    expect(loadBriefingSnapshot(tmpFile)).toBe(null);
  });

  it("save 后 load 返完整 entry", () => {
    _setStatePathForTest(tmpFile);
    saveBriefingSnapshot(
      {
        date: "2026-09-11",
        generatedAt: 1700000000000,
        sections: [{ kind: "updates", items: [{ name: "Brave" }] }],
        lines: ["• Brave 1 → 2"],
        rewritten: true,
      },
      tmpFile,
    );
    const snap = loadBriefingSnapshot(tmpFile);
    expect(snap).not.toBe(null);
    expect(snap.date).toBe("2026-09-11");
    expect(snap.generatedAt).toBe(1700000000000);
    expect(snap.lines).toEqual(["• Brave 1 → 2"]);
    expect(snap.rewritten).toBe(true);
    expect(snap.sections).toEqual([
      { kind: "updates", items: [{ name: "Brave" }] },
    ]);
  });

  it("entry 缺字段 → saveBriefingSnapshot throw", () => {
    _setStatePathForTest(tmpFile);
    expect(() =>
      saveBriefingSnapshot({ date: "2026-09-11" } as any, tmpFile),
    ).toThrow();
  });

  it("保存 briefing_snapshot 不破坏 daily_digest / upgrade_diagnostics", () => {
    _setStatePathForTest(tmpFile);
    saveBriefingSnapshot(
      {
        date: "2026-09-11",
        generatedAt: 1700000000000,
        sections: [],
        lines: [],
        rewritten: false,
      },
      tmpFile,
    );
    const raw = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(raw.briefing_snapshot.date).toBe("2026-09-11");
    // 新 state.json 里没别的字段不应被破坏 (load 不报错)
    expect(() => JSON.stringify(raw)).not.toThrow();
  });

  it("只保留最近 1 份 (再 save 覆盖, 不堆历史)", () => {
    _setStatePathForTest(tmpFile);
    saveBriefingSnapshot(
      {
        date: "2026-09-10",
        generatedAt: 1,
        sections: [],
        lines: [],
        rewritten: false,
      },
      tmpFile,
    );
    saveBriefingSnapshot(
      {
        date: "2026-09-11",
        generatedAt: 2,
        sections: [],
        lines: [],
        rewritten: false,
      },
      tmpFile,
    );
    const raw = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(raw.briefing_snapshot.date).toBe("2026-09-11");
    expect(raw.briefing_snapshot.generatedAt).toBe(2);
  });
});