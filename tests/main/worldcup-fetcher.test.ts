/**
 * tests/main/worldcup-fetcher.test.js
 *
 * TDD for src/main/worldcup/fetcher.js — loadFinalsTxt + cup_finals URL.
 *
 * 注入 mock HTTP (opts.http) 隔离外部依赖.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

describe("loadFinalsTxt", () => {
  let loadFinalsTxt;
  let FINALS_URL;

  beforeEach(async () => {
    // fresh require so module-level state is clean
    delete require.cache[mainArtifactPath("worldcup/fetcher")];
    const mod = requireMain("worldcup/fetcher");
    loadFinalsTxt = mod.loadFinalsTxt;
    FINALS_URL = mod.FINALS_URL;
  });

  test("FINALS_URL points to openfootball cup_finals.txt", () => {
    expect(FINALS_URL).toMatch(
      /openfootball\/worldcup\/master\/2026--usa\/cup_finals\.txt$/,
    );
  });

  test("returns ok with txt body on 200", async () => {
    const fakeTxt =
      "= World Cup 2026\n▪ Round of 32\nSun Jun 28\n  (73) 12:00 UTC-7 A v B @ LA\n";
    const r = await loadFinalsTxt({
      http: { get: async () => ({ body: fakeTxt }) },
    });
    expect(r.ok).toBe(true);
    expect(r.txt).toBe(fakeTxt);
  });

  test("returns ok:false when http returns error object", async () => {
    const r = await loadFinalsTxt({
      http: { get: async () => ({ error: "network_down" }) },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("network_down");
  });

  test("returns ok:false empty_body when body is empty", async () => {
    const r = await loadFinalsTxt({
      http: { get: async () => ({ body: "" }) },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("empty_body");
  });

  test("returns ok:false threw when http throws", async () => {
    const r = await loadFinalsTxt({
      http: {
        get: async () => {
          throw new Error("conn reset");
        },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("threw");
    expect(r.error).toContain("conn reset");
  });

  test("accepts string body fallback (legacy http-client)", async () => {
    const r = await loadFinalsTxt({
      http: { get: async () => "raw text body" },
    });
    expect(r.ok).toBe(true);
    expect(r.txt).toBe("raw text body");
  });
});
