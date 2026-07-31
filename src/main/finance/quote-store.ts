/**
 * src/main/finance/quote-store.ts
 *
 * 行情本地缓存 — finance_quotes.json（独立落盘，见 finance-files；独立于新闻）。
 * 拉取新浪指数 + 汇率，GB18030 解码由 fetcher-market-quote 处理。
 * 单部分失败（指数 / FX）不影响另一部分：失败侧保留旧值，仅记错误。
 */

import * as marketFetcher from "./fetcher-market-quote";
import { mainLog } from "../log";
import {
  readQuotesState,
  writeQuotesState,
} from "./finance-files";

function _emptyQuotes(): any {
  return { ts: 0, indices: {}, fx: {} };
}

export function loadQuotes(statePath?: any): any {
  const q = readQuotesState(statePath);
  if (!q || typeof q !== "object") return _emptyQuotes();
  return {
    ts: typeof q.ts === "number" ? q.ts : 0,
    indices: q.indices && typeof q.indices === "object" ? q.indices : {},
    fx: q.fx && typeof q.fx === "object" ? q.fx : {},
  };
}

/**
 * 拉取指数 + 汇率写 state。返回 {ok, ts, errorsPerSource}。
 * ok 表示全部成功；部分失败仍写成功部分，错误信息汇总。
 */
export async function refreshQuotes(
  statePath?: any,
  opts: any = {},
): Promise<any> {
  let res: any;
  try {
    res = await marketFetcher.fetch({ timeoutMs: opts.timeoutMs || 10000 });
  } catch (err: any) {
    mainLog.warn("[finance/quote-store] fetch failed", {
      msg: err && err.message,
    });
    res = { ok: false, error: err && err.message ? err.message : "threw" };
  }
  const now = Date.now();
  const quotes = loadQuotes(statePath);
  const errorsPerSource: Record<string, string> = {};
  if (res && res.ok && res.raw) {
    const mq = marketFetcher.normalize(res.raw);
    quotes.ts = now;
    quotes.indices = { ...(quotes.indices || {}), ...(mq.indices || {}) };
    quotes.fx = { ...(quotes.fx || {}), ...(mq.fx || {}) };
    const errs = mq.errors || {};
    for (const [k, v] of Object.entries(errs)) {
      if (v) errorsPerSource[k] = String(v);
    }
  } else {
    errorsPerSource.market = (res && res.error) || "fetch_failed";
  }
  writeQuotesState(quotes, statePath);
  return {
    ok: Object.keys(errorsPerSource).length === 0,
    ts: now,
    errorsPerSource,
  };
}

module.exports = { loadQuotes, refreshQuotes };
