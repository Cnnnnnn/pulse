/**
 * tests/main/finance/quote-store.test.ts
 *
 * QA 独立验证：行情部分失败保留旧值。
 * vi.mock 替换 fetcher-market-quote（不触网），用临时 finance_quotes.json 验证（B1 后独立落盘）：
 * 刷新时「成功侧覆盖、失败侧保留旧值、ok 反映是否有错误」。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

vi.mock("../../../src/main/finance/fetcher-market-quote", () => ({
  fetch: vi.fn(),
  normalize: vi.fn((raw: any) => raw),
}));

import * as quoteStore from "../../../src/main/finance/quote-store";
import * as mq from "../../../src/main/finance/fetcher-market-quote";
import * as financeFiles from "../../../src/main/finance/finance-files";

const mqFetch = vi.mocked(mq.fetch);
const mqNorm = vi.mocked(mq.normalize);

let tmp = "";

function seedQuotes(indices: any, fx: any): void {
  fs.writeFileSync(
    financeFiles.quotesFilePath(tmp),
    JSON.stringify({ ts: 1000, indices, fx }),
  );
}

beforeEach(() => {
  tmp = path.join(
    os.tmpdir(),
    `finance-quote-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    "state.json",
  );
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  vi.clearAllMocks();
  mqNorm.mockImplementation((raw: any) => raw);
});

afterEach(() => {
  try {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("finance quote-store · 部分失败保留旧值", () => {
  it("指数成功、FX 失败：指数更新、FX 保留旧值、errorsPerSource.fx 记录", async () => {
    seedQuotes(
      { sh000001: { symbol: "sh000001", name: "上证指数", price: 3700 } },
      { USDCNY: { symbol: "USDCNY", name: "美元/人民币", price: 7.1 } },
    );
    mqFetch.mockResolvedValue({
      ok: true,
      raw: {
        indices: {
          s_sh000001: {
            symbol: "s_sh000001",
            name: "上证指数",
            price: 3858.2,
            change: 10,
            changePct: 0.26,
          },
        },
        fx: {},
        errors: { fx: "fetch_failed" },
      },
    });
    const r = await quoteStore.refreshQuotes(tmp);
    const q = quoteStore.loadQuotes(tmp);
    expect(q.indices.s_sh000001.price).toBeCloseTo(3858.2); // 更新
    expect(q.fx.USDCNY).toBeTruthy(); // 旧值保留
    expect(q.fx.USDCNY.price).toBe(7.1);
    expect(r.errorsPerSource.fx).toBe("fetch_failed");
    expect(r.ok).toBe(false);
  });

  it("FX 成功、指数失败：FX 更新、指数保留旧值", async () => {
    seedQuotes(
      { sh000001: { symbol: "sh000001", name: "上证指数", price: 3700 } },
      { USDCNY: { symbol: "USDCNY", name: "美元/人民币", price: 7.1 } },
    );
    mqFetch.mockResolvedValue({
      ok: true,
      raw: {
        indices: {},
        fx: {
          USDCNY: {
            symbol: "USDCNY",
            name: "美元/人民币",
            price: 6.7659,
            change: 0,
            changePct: 0,
          },
        },
        errors: { indices: "fetch_failed" },
      },
    });
    await quoteStore.refreshQuotes(tmp);
    const q = quoteStore.loadQuotes(tmp);
    expect(q.fx.USDCNY.price).toBeCloseTo(6.7659); // 更新
    expect(q.indices.sh000001).toBeTruthy(); // 旧值保留
    expect(q.indices.sh000001.price).toBe(3700);
  });

  it("整次 fetch 失败：ok=false，旧值完全保留不丢失", async () => {
    seedQuotes(
      { sh000001: { symbol: "sh000001", name: "上证指数", price: 3700 } },
      { USDCNY: { symbol: "USDCNY", name: "美元/人民币", price: 7.1 } },
    );
    mqFetch.mockResolvedValue({ ok: false, error: "network" });
    const r = await quoteStore.refreshQuotes(tmp);
    const q = quoteStore.loadQuotes(tmp);
    expect(r.ok).toBe(false);
    expect(r.errorsPerSource.market).toBe("network");
    expect(q.indices.sh000001.price).toBe(3700);
    expect(q.fx.USDCNY.price).toBe(7.1);
  });

  it("全成功：ok=true 且 errorsPerSource 为空", async () => {
    seedQuotes({}, {});
    mqFetch.mockResolvedValue({
      ok: true,
      raw: {
        indices: {
          s_sh000001: {
            symbol: "s_sh000001",
            name: "上证指数",
            price: 3858.2,
            change: 10,
            changePct: 0.26,
          },
        },
        fx: {
          USDCNY: {
            symbol: "USDCNY",
            name: "美元/人民币",
            price: 6.7659,
            change: 0,
            changePct: 0,
          },
        },
        errors: {},
      },
    });
    const r = await quoteStore.refreshQuotes(tmp);
    expect(r.ok).toBe(true);
    expect(r.errorsPerSource).toEqual({});
    const q = quoteStore.loadQuotes(tmp);
    expect(q.indices.s_sh000001).toBeTruthy();
    expect(q.fx.USDCNY).toBeTruthy();
  });
});
