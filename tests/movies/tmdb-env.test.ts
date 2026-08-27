import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const { requireMain } = require("../_setup/require-main.cjs");
const { loadTmdbApiKey, saveTmdbApiKey, getTmdbApiKeySource, resetTmdbApiKeyCache } =
  requireMain("movies/tmdb-env");

describe("loadTmdbApiKey", () => {
  const prev = process.env.TMDB_API_KEY;
  afterEach(() => {
    resetTmdbApiKeyCache();
    if (prev === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = prev;
  });

  it("无 prefs 时用进程环境变量", () => {
    process.env.TMDB_API_KEY = "  envkey123  ";
    const missing = path.join(os.tmpdir(), `pulse-tmdb-missing-${Date.now()}.json`);
    expect(loadTmdbApiKey(missing)).toBe("envkey123");
    expect(getTmdbApiKeySource()).toBe("env");
  });

  it("settings 落盘优先于环境变量", () => {
    process.env.TMDB_API_KEY = "envkey";
    const prefs = path.join(os.tmpdir(), `pulse-tmdb-prefs-${Date.now()}.json`);
    saveTmdbApiKey("setkey", prefs);
    resetTmdbApiKeyCache();
    expect(loadTmdbApiKey(prefs)).toBe("setkey");
    expect(getTmdbApiKeySource()).toBe("settings");
    fs.unlinkSync(prefs);
  });
});
