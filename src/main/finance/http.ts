/**
 * src/main/finance/http.ts
 *
 * 轻量文本 GET 助手（包装 HttpClient）。
 * RSS 源为 UTF-8，HttpClient 默认 utf-8 解码即可；
 * 新浪行情需 GB18030，由 fetcher-market-quote 单独处理（不走这里）。
 */

import { HttpClient } from "../http-client";

interface ClientEntry {
  client: HttpClient;
}
const _clients: Record<string, ClientEntry> = {};

function client(timeoutMs?: number): HttpClient {
  const key = String(timeoutMs || 0);
  if (!_clients[key]) {
    _clients[key] = {
      client: new HttpClient({
        timeout: timeoutMs || 20000,
        maxRetries: 0,
        maxBodyBytes: 6 * 1024 * 1024,
      }),
    };
  }
  return _clients[key].client;
}

export interface FetchTextResult {
  ok: boolean;
  status: number;
  body: string;
  error?: string;
}

export interface FetchTextOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** 字节上限（国家统计局 RSS 4.5MB 需调大）。 */
  maxBodyBytes?: number;
}

export async function fetchText(
  url: string,
  opts: FetchTextOpts = {},
): Promise<FetchTextResult> {
  try {
    const r = await client(opts.timeoutMs).get(url, {
      timeout: opts.timeoutMs,
      headers: opts.headers,
      maxBodyBytes: opts.maxBodyBytes,
    });
    if (!r || r.status !== 200 || !r.body) {
      return {
        ok: false,
        status: r ? r.status : 0,
        body: "",
        error: r && r.error ? r.error : "fetch_failed",
      };
    }
    return { ok: true, status: r.status, body: String(r.body) };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      body: "",
      error: err && err.message ? err.message : "threw",
    };
  }
}
