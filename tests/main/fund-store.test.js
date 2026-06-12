/**
 * tests/main/fund-store.test.js
 *
 * fund-store.js 单测 — 覆盖:
 *   - loadAll 兜底 (文件不存在 / 解析失败 / funds 字段缺失)
 *   - add: 正常 / id 自动生成 / code 已存在拒绝 / 字段校验
 *   - update: id 不存在 / 部分字段更新 / 校验
 *   - remove: 软删 + deletedIds / 幂等 / id 不存在
 *   - restore: 恢复 / 不在 deletedIds 里
 *   - cleanExpiredDeleted: 7 天边界
 *   - 持久化: writeAtomic 真的写盘
 */

import { describe, it, expect, beforeEach } from "vitest";
const fs = require("fs");
const path = require("path");
const os = require("os");
const fundStore = require("../../src/main/fund-store.js");

let tmpPath;

beforeEach(() => {
  tmpPath = path.join(
    os.tmpdir(),
    `pulse-fund-store-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  // 兜底空文件
  fs.writeFileSync(
    tmpPath,
    JSON.stringify({ v: 1, ts: 0, apps: {}, mutes: {} }),
  );
});

describe("loadAll", () => {
  it("文件不存在 → 兜底空", () => {
    fs.unlinkSync(tmpPath);
    const r = fundStore.loadAll(tmpPath);
    expect(r.holdings).toEqual([]);
    expect(r.deletedIds).toEqual([]);
  });

  it("空 funds → 兜底空", () => {
    fs.writeFileSync(
      tmpPath,
      JSON.stringify({ v: 1, ts: 0, apps: {}, mutes: {} }),
    );
    const r = fundStore.loadAll(tmpPath);
    expect(r.holdings).toEqual([]);
    expect(r.deletedIds).toEqual([]);
  });

  it("正常 holdings + deletedIds", () => {
    fs.writeFileSync(
      tmpPath,
      JSON.stringify({
        v: 1,
        ts: 0,
        apps: {},
        mutes: {},
        funds: {
          holdings: [
            {
              id: "a",
              code: "000001",
              name: "x",
              category: "stock",
              shares: 100,
              costNav: 1.0,
              addedAt: 1,
            },
          ],
          deletedIds: [
            { id: "b", code: "000002", name: "y", deletedAt: Date.now() },
          ],
        },
      }),
    );
    const r = fundStore.loadAll(tmpPath);
    expect(r.holdings).toHaveLength(1);
    expect(r.holdings[0].code).toBe("000001");
    expect(r.deletedIds).toHaveLength(1);
  });

  it("无效 holdings 过滤掉", () => {
    fs.writeFileSync(
      tmpPath,
      JSON.stringify({
        v: 1,
        ts: 0,
        apps: {},
        mutes: {},
        funds: {
          holdings: [
            {
              id: "a",
              code: "000001",
              name: "x",
              category: "stock",
              shares: 100,
              costNav: 1.0,
              addedAt: 1,
            },
            { id: "b" }, // 缺 code
            null, // null
            "string", // 非对象
            { id: "c", code: "12345", name: "x" }, // code 非 6 位
          ],
          deletedIds: [],
        },
      }),
    );
    const r = fundStore.loadAll(tmpPath);
    expect(r.holdings).toHaveLength(1);
  });
});

describe("add", () => {
  it("基本添加: 自动生成 id + 默认 category + 默认 addedAt", () => {
    const { holding, all } = fundStore.add(
      { code: "000001", name: "华夏", shares: 10000, costNav: 1.5 },
      tmpPath,
    );
    expect(holding.id).toMatch(/^[0-9a-f]{16}$/);
    expect(holding.code).toBe("000001");
    expect(holding.category).toBe("other"); // 默认
    expect(holding.addedAt).toBeGreaterThan(0);
    expect(all.holdings).toHaveLength(1);
  });

  it("同 code 已存在 → ValidationError", () => {
    fundStore.add(
      { code: "000001", name: "x", shares: 100, costNav: 1.0 },
      tmpPath,
    );
    expect(() =>
      fundStore.add(
        { code: "000001", name: "y", shares: 200, costNav: 2.0 },
        tmpPath,
      ),
    ).toThrow(/already exists/);
  });

  it("非法 code → ValidationError", () => {
    expect(() =>
      fundStore.add(
        { code: "12345", name: "x", shares: 100, costNav: 1.0 },
        tmpPath,
      ),
    ).toThrow(/invalid fund code/);
    expect(() =>
      fundStore.add(
        { code: "abcdef", name: "x", shares: 100, costNav: 1.0 },
        tmpPath,
      ),
    ).toThrow(/invalid fund code/);
  });

  it("负 shares / costNav → ValidationError", () => {
    expect(() =>
      fundStore.add({ code: "000001", shares: -1, costNav: 1.0 }, tmpPath),
    ).toThrow(/shares must be >= 0/);
    expect(() =>
      fundStore.add({ code: "000001", shares: 100, costNav: -1 }, tmpPath),
    ).toThrow(/costNav must be >= 0/);
  });

  it("NaN shares / costNav → ValidationError", () => {
    expect(() =>
      fundStore.add({ code: "000001", shares: "abc", costNav: 1.0 }, tmpPath),
    ).toThrow(/shares/);
    expect(() =>
      fundStore.add({ code: "000001", shares: 100, costNav: "xyz" }, tmpPath),
    ).toThrow(/costNav/);
  });

  it("category 非法值 → 默认 other", () => {
    const { holding } = fundStore.add(
      { code: "000001", category: "unknown", shares: 100, costNav: 1.0 },
      tmpPath,
    );
    expect(holding.category).toBe("other");
  });

  it("category 合法值保留", () => {
    const { holding } = fundStore.add(
      { code: "000001", category: "qdii", shares: 100, costNav: 1.0 },
      tmpPath,
    );
    expect(holding.category).toBe("qdii");
  });

  it("确实落盘 (writeAtomic)", () => {
    fundStore.add({ code: "000001", shares: 100, costNav: 1.0 }, tmpPath);
    const raw = JSON.parse(fs.readFileSync(tmpPath, "utf-8"));
    expect(raw.funds.holdings).toHaveLength(1);
    expect(raw.apps).toEqual({}); // 不丢其他字段
  });

  it("note 字段保留 / 缺失", () => {
    const { holding: a } = fundStore.add(
      { code: "000001", shares: 100, costNav: 1.0 },
      tmpPath,
    );
    expect(a.note).toBeUndefined();
    const { holding: b } = fundStore.add(
      { code: "000002", shares: 100, costNav: 1.0, note: "定投" },
      tmpPath,
    );
    expect(b.note).toBe("定投");
  });
});

describe("update", () => {
  it("部分字段更新", () => {
    const { holding } = fundStore.add(
      { code: "000001", shares: 100, costNav: 1.0 },
      tmpPath,
    );
    const r = fundStore.update(holding.id, { shares: 200 }, tmpPath);
    expect(r.holding.shares).toBe(200);
    expect(r.holding.code).toBe("000001"); // 不变
    expect(r.holding.costNav).toBe(1.0); // 不变
  });

  it("id 不存在 → null", () => {
    expect(
      fundStore.update("nonexistent", { shares: 200 }, tmpPath),
    ).toBeNull();
  });

  it("非法 patch → ValidationError", () => {
    const { holding } = fundStore.add(
      { code: "000001", shares: 100, costNav: 1.0 },
      tmpPath,
    );
    expect(() => fundStore.update(holding.id, { shares: -1 }, tmpPath)).toThrow(
      /shares/,
    );
  });
});

describe("remove + restore", () => {
  it("remove: 进 deletedIds, holdings 移除", () => {
    const { holding } = fundStore.add(
      { code: "000001", shares: 100, costNav: 1.0 },
      tmpPath,
    );
    const r = fundStore.remove(holding.id, tmpPath);
    expect(r.ok).toBe(true);
    expect(r.all.holdings).toHaveLength(0);
    expect(r.all.deletedIds).toHaveLength(1);
    expect(r.all.deletedIds[0].code).toBe("000001");
    expect(r.all.deletedIds[0].deletedAt).toBeGreaterThan(0);
  });

  it("remove 幂等 (二次删同 id 不重复进 deletedIds)", () => {
    const { holding } = fundStore.add(
      { code: "000001", shares: 100, costNav: 1.0 },
      tmpPath,
    );
    fundStore.remove(holding.id, tmpPath);
    fundStore.remove(holding.id, tmpPath); // 第二次: id 已不在 holdings, 应返 not_found
    const r = fundStore.loadAll(tmpPath);
    expect(r.deletedIds).toHaveLength(1);
  });

  it("remove 不存在 id → ok:false", () => {
    const r = fundStore.remove("nonexistent", tmpPath);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_found");
  });

  it("restore: 从 deletedIds 回到 holdings, shares/costNav 重置 0", () => {
    const { holding } = fundStore.add(
      { code: "000001", shares: 100, costNav: 1.0 },
      tmpPath,
    );
    fundStore.remove(holding.id, tmpPath);
    const r = fundStore.restore(holding.id, tmpPath);
    expect(r.ok).toBe(true);
    expect(r.holding.shares).toBe(0); // 重置
    expect(r.holding.costNav).toBe(0); // 重置
    expect(r.holding._restored).toBe(true);
    expect(r.holding.id).toBe(holding.id);
    const all = fundStore.loadAll(tmpPath);
    expect(all.holdings).toHaveLength(1);
    expect(all.deletedIds).toHaveLength(0);
  });

  it("restore 不在 deletedIds → ok:false", () => {
    expect(fundStore.restore("nonexistent", tmpPath).ok).toBe(false);
  });
});

describe("cleanExpiredDeleted", () => {
  it("7 天内的保留, 超期的清掉", () => {
    const now = Date.now();
    const ids = [
      { id: "a", code: "000001", deletedAt: now - 1000 }, // 1s 前, 保留
      { id: "b", code: "000002", deletedAt: now - 6 * 24 * 60 * 60 * 1000 }, // 6 天前, 保留
      { id: "c", code: "000003", deletedAt: now - 8 * 24 * 60 * 60 * 1000 }, // 8 天前, 清掉
      { id: "d", code: "000004", deletedAt: 0 }, // deletedAt=0 (异常), 清掉
    ];
    const out = fundStore.cleanExpiredDeleted(ids, now);
    expect(out.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("空数组 / 非数组 → 空", () => {
    expect(fundStore.cleanExpiredDeleted([])).toEqual([]);
    expect(fundStore.cleanExpiredDeleted(null)).toEqual([]);
  });

  it("GC 集成: saveAll 自动调 cleanExpiredDeleted", () => {
    fs.writeFileSync(
      tmpPath,
      JSON.stringify({
        v: 1,
        ts: 0,
        apps: {},
        mutes: {},
        funds: {
          holdings: [
            {
              id: "a",
              code: "000001",
              name: "x",
              category: "stock",
              shares: 100,
              costNav: 1.0,
              addedAt: 1,
            },
          ],
          deletedIds: [
            {
              id: "old",
              code: "000099",
              deletedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
            }, // 8 天前, 应该被清
            { id: "recent", code: "000098", deletedAt: Date.now() - 1000 }, // 1s 前, 保留
          ],
        },
      }),
    );
    fundStore.saveAll({}, tmpPath);
    const r = fundStore.loadAll(tmpPath);
    expect(r.deletedIds.map((d) => d.id)).toEqual(["recent"]);
  });
});

describe("setNavSource", () => {
  it("持久化 navSource", () => {
    fundStore.add(
      { code: "000001", name: "x", category: "stock", shares: 1, costNav: 1 },
      tmpPath,
    );
    const saved = fundStore.setNavSource("sina", tmpPath);
    expect(saved.navSource).toBe("sina");
    expect(fundStore.loadAll(tmpPath).navSource).toBe("sina");
  });

  it("非法值回退 tiantian", () => {
    fundStore.setNavSource("bogus", tmpPath);
    expect(fundStore.loadAll(tmpPath).navSource).toBe("tiantian");
  });
});
