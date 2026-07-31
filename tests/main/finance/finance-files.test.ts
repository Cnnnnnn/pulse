/**
 * tests/main/finance/finance-files.test.ts
 *
 * QA 独立验证：B1 财经独立落盘 + 从 legacy state.json 的一次性迁移。
 *  - 无专属文件 / 无 legacy → 返回 null（冷启动）
 *  - legacy state.json 含 financial_news / market_quotes → 迁移写入专属文件并清理 legacy key
 *  - write*State / read*State 经专属文件往返一致
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const { requireMain } = require("../../_setup/require-main.cjs");
const files = requireMain("finance/finance-files");

let tmp = "";

beforeEach(() => {
  tmp = path.join(
    os.tmpdir(),
    `finance-files-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    "state.json",
  );
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
});
afterEach(() => {
  try {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("finance-files · 冷启动与往返", () => {
  it("无文件 → readNewsState / readQuotesState 返回 null", () => {
    expect(files.readNewsState(tmp)).toBeNull();
    expect(files.readQuotesState(tmp)).toBeNull();
  });

  it("writeNewsState → readNewsState 往返一致", () => {
    const state = {
      ts: 123,
      articles: { a: { id: "a" } },
      favorites: {},
    };
    files.writeNewsState(state, tmp);
    const got = files.readNewsState(tmp);
    expect(got).not.toBeNull();
    expect(got.ts).toBe(123);
    expect(got.articles.a.id).toBe("a");
  });

  it("writeQuotesState → readQuotesState 往返一致", () => {
    const q = { ts: 9, indices: { x: { price: 1 } }, fx: {} };
    files.writeQuotesState(q, tmp);
    const got = files.readQuotesState(tmp);
    expect(got).not.toBeNull();
    expect(got.indices.x.price).toBe(1);
  });
});

describe("finance-files · 从 legacy state.json 迁移", () => {
  it("financial_news 迁移：写入专属文件并清理 legacy key", () => {
    const legacy = {
      v: 1,
      apps: {},
      financial_news: {
        ts: 500,
        articles: { "em:1": { id: "em:1" } },
        favorites: {},
      },
    };
    fs.writeFileSync(tmp, JSON.stringify(legacy));

    const got = files.readNewsState(tmp);
    expect(got).not.toBeNull();
    expect(got.ts).toBe(500);
    expect(got.articles["em:1"]).toBeTruthy();

    // 专属文件已生成
    expect(fs.existsSync(files.newsFilePath(tmp))).toBe(true);
    // legacy key 已清理（其它字段保留）
    const after = JSON.parse(fs.readFileSync(tmp, "utf-8"));
    expect(after.financial_news).toBeUndefined();
    expect(after.apps).toBeTruthy();
  });

  it("market_quotes 迁移：写入专属文件并清理 legacy key", () => {
    const legacy = {
      v: 1,
      apps: {},
      market_quotes: { ts: 600, indices: { sh: { price: 2 } }, fx: {} },
    };
    fs.writeFileSync(tmp, JSON.stringify(legacy));

    const got = files.readQuotesState(tmp);
    expect(got).not.toBeNull();
    expect(got.indices.sh.price).toBe(2);

    expect(fs.existsSync(files.quotesFilePath(tmp))).toBe(true);
    const after = JSON.parse(fs.readFileSync(tmp, "utf-8"));
    expect(after.market_quotes).toBeUndefined();
    expect(after.apps).toBeTruthy();
  });

  it("无 legacy key 时不生成专属文件（保持冷启动语义）", () => {
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, apps: {} }));
    expect(files.readNewsState(tmp)).toBeNull();
    expect(fs.existsSync(files.newsFilePath(tmp))).toBe(false);
  });
});
