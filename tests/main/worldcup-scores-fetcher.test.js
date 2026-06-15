/**
 * tests/main/worldcup-scores-fetcher.test.js
 *
 * 直接测 _fetchScoresLayered (DI 设计, 接收可注入 fetchers).
 * 这样测试不依赖 mock state-store / http-client, 完全聚焦 fetcher 编排逻辑:
 *  - 并行性 (Promise.all)
 *  - 优先级 (ESPN > wc26 > openfootball)
 *  - 兜底 (任一源失败不影响其他)
 *  - openfootball 串行依赖前两层
 */
import { describe, it, expect, vi } from "vitest";
import { _fetchScoresLayered } from "../../src/main/worldcup/scores-fetcher.js";

const KEY = "2026-06-11|20:00|Mexico|South Africa";

function _makeFixtures(keys) {
  // 每个 key 假定是 "date|time|team1|team2" 格式
  return keys.map((k) => {
    const [date, time, team1, team2] = k.split("|");
    return { date, time, team1, team2 };
  });
}

describe("_fetchScoresLayered", () => {
  it("empty keys: fetcher 调用走空 fixtures 路径, merged 空", async () => {
    const fetchEspn = vi.fn(async () => ({}));
    const fetchWc26 = vi.fn(async () => ({}));
    const fetchFreshTxt = vi.fn(async () => ({
      ok: true,
      data: { matches: [] },
    }));

    const r = await _fetchScoresLayered([], [], {
      fetchEspn,
      fetchWc26,
      fetchFreshTxt,
      scoreEntryFromMatch: () => null,
    });

    expect(r.merged).toEqual({});
    expect(r.updatedKeys).toEqual([]);
    expect(r.sources).toEqual({ espn: 0, worldcup26: 0, openfootball: 0 });
    // empty keys → missingKeys 也 empty → fetchFreshTxt 不应被调
    expect(fetchFreshTxt).not.toHaveBeenCalled();
  });

  it("ESPN + wc26 并行: 两 fetcher 同时被调 (不串行)", async () => {
    // 用 spy + 时序检测: fetchEspn 进入时, fetchWc26 也应该已启动
    let espnStartTs = 0;
    let wc26StartTs = 0;
    const startEvents = [];

    const fetchEspn = vi.fn(() => {
      espnStartTs = Date.now();
      startEvents.push("espn");
      return new Promise((res) => {
        // 给 wc26 一个机会启动
        setTimeout(() => {
          startEvents.push("espn-resolve");
          res({ [KEY]: { ft: [1, 0], source: "espn" } });
        }, 20);
      });
    });
    const fetchWc26 = vi.fn(() => {
      wc26StartTs = Date.now();
      startEvents.push("wc26");
      return new Promise((res) => {
        setTimeout(() => {
          startEvents.push("wc26-resolve");
          res({});
        }, 20);
      });
    });

    await _fetchScoresLayered([KEY], _makeFixtures([KEY]), {
      fetchEspn,
      fetchWc26,
      fetchFreshTxt: vi.fn(async () => ({ ok: true, data: { matches: [] } })),
      scoreEntryFromMatch: () => null,
    });

    // 关键: 两 fetcher 都被调
    expect(fetchEspn).toHaveBeenCalledTimes(1);
    expect(fetchWc26).toHaveBeenCalledTimes(1);
    // 并行: espn 和 wc26 的 start 都在任一 resolve 之前
    const espnStartIdx = startEvents.indexOf("espn");
    const wc26StartIdx = startEvents.indexOf("wc26");
    const firstResolveIdx = startEvents.indexOf("espn-resolve");
    expect(wc26StartIdx).toBeLessThan(firstResolveIdx);
    expect(wc26StartIdx).toBeGreaterThan(espnStartIdx);
  });

  it("并行总耗时 ≈ max(espn, wc26), 不是 espn + wc26", async () => {
    const ESPN_DELAY = 100;
    const WC26_DELAY = 100;

    const fetchEspn = vi.fn(
      () =>
        new Promise((res) =>
          setTimeout(
            () => res({ [KEY]: { ft: [1, 0], source: "espn" } }),
            ESPN_DELAY,
          ),
        ),
    );
    const fetchWc26 = vi.fn(
      () => new Promise((res) => setTimeout(() => res({}), WC26_DELAY)),
    );

    const t0 = Date.now();
    await _fetchScoresLayered([KEY], _makeFixtures([KEY]), {
      fetchEspn,
      fetchWc26,
      fetchFreshTxt: vi.fn(async () => ({ ok: true, data: { matches: [] } })),
      scoreEntryFromMatch: () => null,
    });
    const elapsed = Date.now() - t0;

    // 并行: 应 ≈ max(100, 100) = 100, 串行会 ≈ 200
    // 留 buffer 50: 并行 < 150, 串行 > 150
    expect(elapsed).toBeLessThan(ESPN_DELAY + WC26_DELAY - 50);
  });

  it("ESPN 优先级: 同 key ESPN+wc26 都返, 用 ESPN", async () => {
    const espnEntry = { ft: [1, 0], status: "final", source: "espn" };
    const wc26Entry = { ft: [2, 0], status: "final", source: "worldcup26" };

    const fetchEspn = vi.fn(async () => ({ [KEY]: espnEntry }));
    const fetchWc26 = vi.fn(async () => ({ [KEY]: wc26Entry }));

    const r = await _fetchScoresLayered([KEY], _makeFixtures([KEY]), {
      fetchEspn,
      fetchWc26,
      fetchFreshTxt: vi.fn(async () => ({ ok: true, data: { matches: [] } })),
      scoreEntryFromMatch: () => null,
    });

    expect(r.merged[KEY]).toBe(espnEntry);
    expect(r.sources).toEqual({ espn: 1, worldcup26: 0, openfootball: 0 });
    expect(r.updatedKeys).toEqual([KEY]);
  });

  it("wc26 兜底: ESPN 没覆盖的 key 由 wc26 补", async () => {
    const wc26Entry = { ft: [1, 1], status: "live", source: "worldcup26" };

    const fetchEspn = vi.fn(async () => ({}));
    const fetchWc26 = vi.fn(async () => ({ [KEY]: wc26Entry }));

    const r = await _fetchScoresLayered([KEY], _makeFixtures([KEY]), {
      fetchEspn,
      fetchWc26,
      fetchFreshTxt: vi.fn(async () => ({ ok: true, data: { matches: [] } })),
      scoreEntryFromMatch: () => null,
    });

    expect(r.merged[KEY]).toBe(wc26Entry);
    expect(r.sources).toEqual({ espn: 0, worldcup26: 1, openfootball: 0 });
  });

  it("openfootball 兜底: ESPN+wc26 都没覆盖时, fetchFreshTxt + scoreEntryFromMatch", async () => {
    const openfootballEntry = {
      ft: [0, 0],
      status: "final",
      source: "openfootball",
    };

    const fetchEspn = vi.fn(async () => ({}));
    const fetchWc26 = vi.fn(async () => ({}));
    const fetchFreshTxt = vi.fn(async () => ({
      ok: true,
      data: {
        matches: [
          {
            // matchKey() 算出来必须等于 KEY
            date: "2026-06-11",
            time: "20:00",
            team1: "Mexico",
            team2: "South Africa",
            score: { ft: [0, 0] },
          },
        ],
      },
    }));
    const scoreEntryFromMatch = vi.fn(() => openfootballEntry);

    const r = await _fetchScoresLayered([KEY], _makeFixtures([KEY]), {
      fetchEspn,
      fetchWc26,
      fetchFreshTxt,
      scoreEntryFromMatch,
    });

    expect(fetchFreshTxt).toHaveBeenCalledTimes(1);
    expect(scoreEntryFromMatch).toHaveBeenCalled();
    expect(r.merged[KEY]).toBe(openfootballEntry);
    expect(r.sources.openfootball).toBe(1);
  });

  it("openfootball 不触发: ESPN 已覆盖所有 keys 时 fetchFreshTxt 不被调", async () => {
    const fetchEspn = vi.fn(async () => ({
      [KEY]: { ft: [1, 0], source: "espn" },
    }));
    const fetchWc26 = vi.fn(async () => ({}));
    const fetchFreshTxt = vi.fn();

    await _fetchScoresLayered([KEY], _makeFixtures([KEY]), {
      fetchEspn,
      fetchWc26,
      fetchFreshTxt,
      scoreEntryFromMatch: () => null,
    });

    expect(fetchFreshTxt).not.toHaveBeenCalled();
  });

  it("openfootball 失败 (fetchFreshTxt 返 ok:false): 不抛错, merged 为空", async () => {
    const fetchEspn = vi.fn(async () => ({}));
    const fetchWc26 = vi.fn(async () => ({}));
    const fetchFreshTxt = vi.fn(async () => ({ ok: false }));

    const r = await _fetchScoresLayered([KEY], _makeFixtures([KEY]), {
      fetchEspn,
      fetchWc26,
      fetchFreshTxt,
      scoreEntryFromMatch: () => null,
    });

    expect(r.merged).toEqual({});
    expect(r.sources.openfootball).toBe(0);
  });

  it("ESPN throw: _fetchScoresLayered 整体 throw (上游 refreshWorldcupScores catch)", async () => {
    const fetchEspn = vi.fn(async () => {
      throw new Error("espn network");
    });
    const fetchWc26 = vi.fn(async () => ({}));

    await expect(
      _fetchScoresLayered([KEY], _makeFixtures([KEY]), {
        fetchEspn,
        fetchWc26,
        fetchFreshTxt: vi.fn(async () => ({ ok: true, data: { matches: [] } })),
        scoreEntryFromMatch: () => null,
      }),
    ).rejects.toThrow("espn network");
  });
});
