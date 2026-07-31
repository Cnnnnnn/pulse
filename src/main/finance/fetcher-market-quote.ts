/**
 * src/main/finance/fetcher-market-quote.ts
 *
 * 新浪行情（指数 + 汇率）。硬坑：响应体是 GB18030 编码，必须用
 * `new TextDecoder('gb18030')` 解码，否则中文乱码。统一用 `s_` 简化前缀拉指数，
 * 指数与 FX 字段布局不同 → 两套解析函数。
 *
 * 请求必须带 `Referer: https://finance.sina.com.cn` + 浏览器 UA，否则易 403。
 *
 * 导出范式：fetch() + normalize()。
 */

import * as http from "node:http";
import * as https from "node:https";
import { URL } from "node:url";
import { TextDecoder } from "node:util";
import { BROWSER_UA, SINA_TIMEOUT_MS } from "./config";
import { INDEX_SYMBOLS, FX_SYMBOLS } from "../../shared/finance-symbols";

export { INDEX_SYMBOLS, FX_SYMBOLS };

export const id = "sina";
export const label = "新浪财经";

const SINA_HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_UA,
  Referer: "https://finance.sina.com.cn",
  Accept: "*/*",
};

/** 数值兜底：非有限数 → 默认 0。 */
function num(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/**
 * 解码 Sina 响应体。GB18030 是硬约束；解码失败兜底 utf-8，再失败返回 ""。
 */
export function safeDecode(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) return "";
  try {
    return new TextDecoder("gb18030").decode(buffer);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(buffer);
    } catch {
      return "";
    }
  }
}

/**
 * 解析 Sina 返回文本 → { symbol: "名称,字段..." }。
 * Sina 形如：var hq_str_s_sh000001="上证指数,3858.2450,...";
 * FX 形如：var hq_str_USDCNY="18:07:02,6.7659,...";
 */
export function parseSinaBlock(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text) return out;
  const re = /hq_str_([^=]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

/**
 * 指数解析：s_ 简化格式 = 名称,当前价,涨跌额,涨跌%,成交量,成交额。
 */
export function parseIndexLine(symbol: string, data: string): any | null {
  if (!data) return null;
  const f = data.split(",");
  if (f.length < 4) return null;
  return {
    symbol,
    name: f[0] || symbol,
    price: num(f[1]),
    change: num(f[2]),
    changePct: num(f[3]),
  };
}

/**
 * FX 解析。Sina FX 字段布局（实测）：
 *   时间, 当前价, 买一, 卖一, 成交量, ..., 名称, 日期
 * 没有可靠的「昨收」列（第 4 字段实为卖一），用价格减任意列推算涨跌都会误导。
 * 按 D2 决策：FX **仅展示中间价**，不展示涨跌额/涨跌幅，并以 `isFx` 标记供 UI 区分。
 * 若后续接入可靠昨收源，再放开 change/changePct。
 */
export function parseFxLine(symbol: string, data: string): any | null {
  if (!data) return null;
  const f = data.split(",");
  if (f.length < 2) return null;
  const price = num(f[1]);
  return {
    symbol,
    name: FX_SYMBOLS[0] ? FX_SYMBOLS[0].name : "美元/人民币",
    price,
    change: 0,
    changePct: 0,
    isFx: true,
  };
}

/** 单次 GET 拿原始 Buffer（带超时，不依赖 HttpClient 的 utf-8 解码）。 */
function _getBuffer(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; buffer: Buffer; error?: string }> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      resolve({ status: 0, buffer: Buffer.alloc(0), error: "invalid_url" });
      return;
    }
    const mod = parsed.protocol === "https:" ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: SINA_HEADERS,
    };
    const req = mod.request(reqOpts, (res: any) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () =>
        resolve({ status: res.statusCode || 0, buffer: Buffer.concat(chunks) }),
      );
    });
    req.on("error", () =>
      resolve({ status: 0, buffer: Buffer.alloc(0), error: "network" }),
    );
    req.setTimeout(timeoutMs, () => {
      try {
        req.destroy();
      } catch {
        /* noop */
      }
      resolve({ status: 0, buffer: Buffer.alloc(0), error: "timeout" });
    });
    req.end();
  });
}

export interface QuoteFetchResult {
  ok: boolean;
  raw?: { indices: Record<string, any>; fx: Record<string, any>; errors: Record<string, string> };
  error?: string;
}

export async function fetch(opts: any = {}): Promise<QuoteFetchResult> {
  const timeoutMs = opts.timeoutMs || SINA_TIMEOUT_MS;
  const idxUrl = `http://hq.sinajs.cn/list=${INDEX_SYMBOLS.map((s) => s.symbol).join(",")}`;
  const fxUrl = `http://hq.sinajs.cn/list=${FX_SYMBOLS.map((s) => s.symbol).join(",")}`;
  try {
    const [idxRes, fxRes] = await Promise.all([
      _getBuffer(idxUrl, timeoutMs),
      _getBuffer(fxUrl, timeoutMs),
    ]);
    const errors: Record<string, string> = {};
    if (!idxRes.buffer.length || idxRes.status !== 200) {
      errors.indices = idxRes.error || "fetch_failed";
    }
    if (!fxRes.buffer.length || fxRes.status !== 200) {
      errors.fx = fxRes.error || "fetch_failed";
    }
    const idxText = idxRes.buffer.length ? safeDecode(idxRes.buffer) : "";
    const fxText = fxRes.buffer.length ? safeDecode(fxRes.buffer) : "";
    const idxRaw = parseSinaBlock(idxText);
    const fxRaw = parseSinaBlock(fxText);

    const indices: Record<string, any> = {};
    for (const s of INDEX_SYMBOLS) {
      const data = idxRaw[s.symbol];
      indices[s.symbol] = data ? parseIndexLine(s.symbol, data) : null;
    }
    const fx: Record<string, any> = {};
    for (const s of FX_SYMBOLS) {
      const data = fxRaw[s.symbol] || fxRaw[`hq_${s.symbol}`];
      fx[s.symbol] = data ? parseFxLine(s.symbol, data) : null;
    }
    return { ok: true, raw: { indices, fx, errors } };
  } catch (err: any) {
    return { ok: false, error: err && err.message ? err.message : "threw" };
  }
}

/**
 * 把 fetch 的原始结构归一化为 market_quotes 缓存形状。
 * 仅保留成功解析的条目（失败的为 null，由 quote-store 保留旧值）。
 */
export function normalize(raw: any): any {
  const now = Date.now();
  const indices: Record<string, any> = {};
  const srcIndices = (raw && raw.indices) || {};
  for (const [sym, v] of Object.entries(srcIndices)) {
    if (!v) continue;
    indices[sym] = {
      symbol: sym,
      name: (v as any).name,
      price: (v as any).price,
      change: (v as any).change,
      changePct: (v as any).changePct,
      isFx: Boolean((v as any).isFx),
      updatedAt: now,
    };
  }
  const fx: Record<string, any> = {};
  const srcFx = (raw && raw.fx) || {};
  for (const [sym, v] of Object.entries(srcFx)) {
    if (!v) continue;
    fx[sym] = {
      symbol: sym,
      name: (v as any).name,
      price: (v as any).price,
      change: (v as any).change,
      changePct: (v as any).changePct,
      isFx: Boolean((v as any).isFx),
      updatedAt: now,
    };
  }
  return { indices, fx, errors: (raw && raw.errors) || {} };
}

module.exports = {
  id,
  label,
  INDEX_SYMBOLS,
  FX_SYMBOLS,
  safeDecode,
  parseSinaBlock,
  parseIndexLine,
  parseFxLine,
  fetch,
  normalize,
};
