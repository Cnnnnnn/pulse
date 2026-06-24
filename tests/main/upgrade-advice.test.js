/**
 * tests/main/upgrade-advice.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const stateStore = require("../../src/main/state-store.js");
const {
  adviceCacheKey,
  parseAdviceResponse,
  buildAdviceMessages,
  usageTierLabel,
} = require("../../src/ai/upgrade-advice.js");

let tmpFile;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `pulse-a2-${Date.now()}.json`);
  fs.writeFileSync(
    tmpFile,
    JSON.stringify({
      v: 1,
      apps: {
        Cursor: {
          name: "Cursor",
          installed_version: "1.0",
          latest_version: "2.0",
          has_update: true,
          changelog: "Fix crash on startup",
          source: "brew_formulae",
        },
      },
    }),
    "utf-8",
  );
  stateStore._setStatePathForTest(tmpFile);
});

afterEach(() => {
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    /* noop */
  }
});

describe("upgrade-advice", () => {
  it("adviceCacheKey", () => {
    expect(adviceCacheKey("Cursor", "2.0")).toBe("Cursor::2.0");
  });

  it("usageTierLabel tiers", () => {
    const now = Date.now();
    expect(usageTierLabel(now - 2 * 86400_000, now)).toContain("hot");
    expect(usageTierLabel(now - 15 * 86400_000, now)).toContain("warm");
    expect(usageTierLabel(now - 40 * 86400_000, now)).toContain("cold");
    expect(usageTierLabel(null, now)).toContain("unknown");
  });

  it("parseAdviceResponse valid JSON", () => {
    const r = parseAdviceResponse(
      '{"recommendation":"upgrade","confidence":"high","summary":"建议升级","reasons":["修复崩溃"]}',
    );
    expect(r).toEqual({
      recommendation: "upgrade",
      confidence: "high",
      summary: "建议升级",
      reasons: ["修复崩溃"],
    });
  });

  it("parseAdviceResponse invalid → null", () => {
    expect(parseAdviceResponse("not json")).toBeNull();
    expect(
      parseAdviceResponse('{"recommendation":"maybe","summary":"x"}'),
    ).toBeNull();
  });

  it("buildAdviceMessages includes app + changelog", () => {
    const msgs = buildAdviceMessages(
      {
        name: "Cursor",
        installed_version: "1",
        latest_version: "2",
        changelog: "bugfix",
      },
      { ms: Date.now() - 86400_000 },
    );
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content).toContain("Cursor");
    expect(msgs[1].content).toContain("bugfix");
  });
});
