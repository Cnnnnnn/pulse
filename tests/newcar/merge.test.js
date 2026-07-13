/**
 * tests/newcar/merge.test.js
 *
 * src/newcar/merge.js — mergeByRemoteFirst 纯函数验收 (vitest).
 *
 * 覆盖: 远程覆盖本地同 id / 远程独有补入 / 本地独有保留 /
 *       幂等 (merge 两次结果相等) / 远程非法行被丢弃不污染 / 空 remote 返回 local 原样.
 */

import { describe, it, expect } from "vitest";
import { mergeByRemoteFirst } from "../../src/newcar/merge.js";

const local = [
  { id: "a", brand: "A", releaseDate: "2026-01-01" },
  { id: "b", brand: "B", releaseDate: "2026-02-01" },
  { id: "c", brand: "C", releaseDate: "2026-03-01" },
];

describe("mergeByRemoteFirst", () => {
  it("① 远程覆盖本地同 id (远程优先)", () => {
    const remote = [
      { id: "a", brand: "A-updated", releaseDate: "2026-01-15" },
    ];
    const merged = mergeByRemoteFirst(local, remote);
    expect(merged.length).toBe(3);
    const a = merged.find((r) => r.id === "a");
    expect(a.brand).toBe("A-updated");
    expect(a.releaseDate).toBe("2026-01-15");
  });

  it("② 远程独有补入", () => {
    const remote = [
      { id: "x", brand: "X", releaseDate: "2026-12-01" },
    ];
    const merged = mergeByRemoteFirst(local, remote);
    expect(merged.length).toBe(local.length + 1);
    expect(merged.some((r) => r.id === "x")).toBe(true);
  });

  it("③ 本地独有保留", () => {
    const remote = [{ id: "x", brand: "X", releaseDate: "2026-12-01" }];
    const merged = mergeByRemoteFirst(local, remote);
    for (const rec of local) {
      expect(merged.some((r) => r.id === rec.id)).toBe(true);
    }
  });

  it("④ 幂等: merge 两次结果相等", () => {
    const remote = [
      { id: "a", brand: "A-updated", releaseDate: "2026-01-15" },
      { id: "x", brand: "X", releaseDate: "2026-12-01" },
    ];
    const once = mergeByRemoteFirst(local, remote);
    const twice = mergeByRemoteFirst(local, remote);
    expect(once).toEqual(twice);
    // 也与 (once, remote) 再合并一致
    expect(mergeByRemoteFirst(once, remote)).toEqual(once);
  });

  it("⑤ 远程非法记录被丢弃不污染", () => {
    const remote = [
      { id: "x", brand: "X", releaseDate: "2026-12-01" },
      { id: "", brand: "no-id", releaseDate: "2026-05-01" }, // 缺 id
      { brand: "no-id-2", releaseDate: "2026-05-02" }, // 无 id 字段
      { id: "bad-date", brand: "Y", releaseDate: "2026/05/01" }, // 日期格式非法
      null,
      "garbage",
    ];
    const merged = mergeByRemoteFirst(local, remote);
    expect(merged.length).toBe(local.length + 1); // 仅合法 x 补入
    expect(merged.every((r) => r.id && /^\d{4}-\d{2}-\d{2}$/.test(r.releaseDate))).toBe(true);
  });

  it("⑥ 远程空数组返回 local 原样 (长度不变, 顺序稳定)", () => {
    const merged = mergeByRemoteFirst(local, []);
    expect(merged.length).toBe(local.length);
    expect(merged).toEqual(local);
  });

  it("⑦ 额外: 缺失/非数组入参不崩, 安全降级", () => {
    expect(mergeByRemoteFirst(local, null).length).toBe(local.length);
    expect(mergeByRemoteFirst(undefined, [{ id: "z", brand: "Z", releaseDate: "2026-06-01" }]).length).toBe(1);
    expect(mergeByRemoteFirst(null, null)).toEqual([]);
  });

  it("⑧ [QA关注点] 远程 releaseDate 日历非法(2026-13-01 月=13) → 被丢弃不污染", () => {
    const merged = mergeByRemoteFirst([], [
      { id: "ok", brand: "O", releaseDate: "2026-07-13" },
      { id: "bad-month", brand: "B", releaseDate: "2026-13-01" },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("ok");
    // 其余日历非法样例
    const merged2 = mergeByRemoteFirst([], [
      { id: "ok2", brand: "O", releaseDate: "2026-02-30" }, // 2 月无 30 日
      { id: "ok3", brand: "O", releaseDate: "2026-04-31" }, // 4 月无 31 日
    ]);
    expect(merged2.length).toBe(0);
  });
});

/**
 * QA (严过关) 第二层补充: 边界 / 错误路径.
 * 依据 team-lead 验收清单独立补充, 重点覆盖: 非数组 remote / 重复 id /
 * 缺字段记录 / 非法 releaseDate (格式 & 日历) / 大交集 / 严格幂等.
 */
describe("mergeByRemoteFirst — QA边界/错误路径补充", () => {
  const base = [
    { id: "a", brand: "A", releaseDate: "2026-01-01" },
    { id: "b", brand: "B", releaseDate: "2026-02-01" },
    { id: "c", brand: "C", releaseDate: "2026-03-01" },
  ];

  it("A. remote 为 null/undefined/非数组(string/object/number) → 不崩, 安全降级", () => {
    expect(() => mergeByRemoteFirst(base, null)).not.toThrow();
    expect(() => mergeByRemoteFirst(base, undefined)).not.toThrow();
    expect(() => mergeByRemoteFirst(base, "not-array")).not.toThrow();
    expect(() => mergeByRemoteFirst(base, { foo: 1 })).not.toThrow();
    expect(() => mergeByRemoteFirst(base, 42)).not.toThrow();
    expect(mergeByRemoteFirst(base, "not-array").length).toBe(base.length);
    expect(mergeByRemoteFirst(base, { foo: 1 }).length).toBe(base.length);
    expect(mergeByRemoteFirst(base, 42).length).toBe(base.length);
    // 三态入参均为空 → 绝不抛
    expect(() => mergeByRemoteFirst(null, null)).not.toThrow();
    expect(() => mergeByRemoteFirst(undefined, undefined)).not.toThrow();
    expect(mergeByRemoteFirst(undefined, undefined)).toEqual([]);
  });

  it("B. remote 含重复 id → 结果唯一, 取最后一次出现", () => {
    const remote = [
      { id: "dup", brand: "first", releaseDate: "2026-01-01" },
      { id: "dup", brand: "second", releaseDate: "2026-02-02" },
    ];
    const merged = mergeByRemoteFirst([], remote);
    const dups = merged.filter((r) => r.id === "dup");
    expect(dups.length).toBe(1);
    expect(dups[0].brand).toBe("second");
    expect(dups[0].releaseDate).toBe("2026-02-02");
  });

  it("C. remote 合法 id 但缺字段(缺 brand/status) → 仍并入", () => {
    const remote = [{ id: "sparse", releaseDate: "2026-03-03" }];
    const merged = mergeByRemoteFirst([], remote);
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("sparse");
    expect(merged[0].brand).toBeUndefined();
    expect(merged[0].status).toBeUndefined();
  });

  it("D. remote releaseDate 格式非法(2026/07/13 斜杠) → 被丢弃不污染", () => {
    const remote = [
      { id: "ok", releaseDate: "2026-07-13" },
      { id: "bad", releaseDate: "2026/07/13" },
    ];
    const merged = mergeByRemoteFirst([], remote);
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("ok");
    expect(merged.some((r) => r.id === "bad")).toBe(false);
  });

  it("E. [QA关注点] remote releaseDate 日历非法(2026-13-01 月=13) → 期望被丢弃", () => {
    const remote = [
      { id: "ok", releaseDate: "2026-07-13" },
      { id: "bad-month", releaseDate: "2026-13-01" },
    ];
    const merged = mergeByRemoteFirst([], remote);
    // 期望: 仅保留 ok, bad-month 因日历非法被丢弃
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("ok");
    expect(merged.some((r) => r.id === "bad-month")).toBe(false);
  });

  it("F. 大交集: local/remote 各100条, 重叠50 → 合并150条且重叠取remote", () => {
    const local = Array.from({ length: 100 }, (_, i) => ({
      id: `L${i}`,
      releaseDate: "2026-01-01",
      v: "local",
    }));
    const remote = Array.from({ length: 100 }, (_, i) => ({
      id: `R${i}`,
      releaseDate: "2026-01-01",
      v: "remote",
    }));
    for (let i = 0; i < 50; i++) {
      remote[i].id = `L${i}`; // 前50个 id 与 local 重叠
    }
    const merged = mergeByRemoteFirst(local, remote);
    expect(merged.length).toBe(150);
    const overlap = merged.find((r) => r.id === "L0");
    expect(overlap.v).toBe("remote");
    // 独有部分都保留
    expect(merged.some((r) => r.id === "L99")).toBe(true);
    expect(merged.some((r) => r.id === "R99")).toBe(true);
  });

  it("G. 严格幂等: 相同 (local, remote) 连续 merge 两次深度相等", () => {
    const remote = [
      { id: "a", brand: "A-updated", releaseDate: "2026-01-15" },
      { id: "x", brand: "X", releaseDate: "2026-12-01" },
    ];
    const once = mergeByRemoteFirst(base, remote);
    const twice = mergeByRemoteFirst(base, remote);
    expect(once).toEqual(twice);
    expect(mergeByRemoteFirst(once, remote)).toEqual(once);
    expect(mergeByRemoteFirst(twice, [])).toEqual(once);
  });
});
