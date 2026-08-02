/**
 * src/shared/electron/http-client-adapter.d.ts
 *
 * Adapter type surface for src/main/http-client.js.
 *
 * ponytail: 1:1 mirrors the existing public surface (HttpClient class).
 *           Public methods: `get`, `head`, `post`. The internal helpers
 *           (`_withRetry`, `_follow`, `_followHead`, `_absUrl`, `_getOnce`,
 *           `_headOnce`, `_postOnce`, `_request`) are private — do not widen
 *           this adapter to expose them. Result shape matches what the .js
 *           returns: `{ status, body, headers }` plus optional `finalUrl`
 *           and an error tag (`'network' | 'timeout' | 'too_large'`).
 */

export type HttpRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type HttpResponse = {
  status: number;
  body: string | Buffer;
  headers: Record<string, string>;
  finalUrl?: string;
  /** populated only when the request bailed out before/during the response */
  error?: "network" | "timeout" | "too_large";
};

export type HttpGetOptions = {
  headers?: Record<string, string>;
  timeout?: number;
  follow?: boolean;
  maxBodyBytes?: number;
  /** binary:true 时 body 返回 Buffer（不 toString），用于拉 gz/图片等二进制。
   *  默认 false → body 为 UTF-8 string（保持现有 detector 调用兼容）。 */
  binary?: boolean;
};

export type HttpPostOptions = {
  timeout?: number;
  maxBodyBytes?: number;
};

export type HttpHeadOptions = {
  headers?: Record<string, string>;
  timeout?: number;
  follow?: boolean;
};

export interface HttpClientAdapter {
  get(url: string, opts?: HttpGetOptions): Promise<HttpResponse>;
  head(url: string, opts?: HttpHeadOptions): Promise<HttpResponse>;
  post(
    url: string,
    body: string | unknown,
    headers?: Record<string, string>,
    opts?: HttpPostOptions,
  ): Promise<HttpResponse>;
}

export type ElectronHttpClientCtor = new (
  opts?: Record<string, unknown>,
) => HttpClientAdapter;
