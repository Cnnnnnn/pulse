/**
 * tests/main/http-client.test.js
 *
 * Phase 24: HttpClient 网络失败重试.
 * 5 case: 一次性成功 / 重试成功 / 重试用完仍失败 / 4xx/5xx 不重试 / too_large 不重试.
 * body 超限 (real socket): Content-Length 超限 / 流式累计超限 都要 resolve
 * too_large, 不允许 res.destroy() 后 promise 永远 pending (MiniMax Code 挂死修复).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const { HttpClient } = requireMain('http-client');
describe('HttpClient 重试 (Phase 24)', () => {
  it('第一次失败 (network) + 第二次成功 → 返成功 result', async () => {
    const client = new HttpClient({ maxRetries: 1, retryDelayMs: 10 });
    let call = 0;
    vi.spyOn(client, '_getOnce').mockImplementation(async () => {
      call++;
      if (call === 1) return { status: 0, body: '', headers: {}, error: 'network' };
      return { status: 200, body: 'ok', headers: {} };
    });
    const r = await client.get('https://x');
    expect(r).toEqual({ status: 200, body: 'ok', headers: {} });
    expect(call).toBe(2);
  });

  it('第一次失败 (timeout) + 第二次成功 → 返成功 result', async () => {
    const client = new HttpClient({ maxRetries: 1, retryDelayMs: 10 });
    let call = 0;
    vi.spyOn(client, '_getOnce').mockImplementation(async () => {
      call++;
      if (call === 1) return { status: 0, body: '', headers: {}, error: 'timeout' };
      return { status: 200, body: 'ok', headers: {} };
    });
    const r = await client.get('https://x');
    expect(r.status).toBe(200);
    expect(call).toBe(2);
  });

  it('重试用完仍失败 → 返最后一次 result (含 error)', async () => {
    const client = new HttpClient({ maxRetries: 1, retryDelayMs: 10 });
    vi.spyOn(client, '_getOnce').mockResolvedValue({ status: 0, body: '', headers: {}, error: 'network' });
    const r = await client.get('https://x');
    expect(r).toEqual({ status: 0, body: '', headers: {}, error: 'network' });
  });

  it('4xx 不重试, 立即返 4xx result', async () => {
    const client = new HttpClient({ maxRetries: 1, retryDelayMs: 10 });
    let call = 0;
    vi.spyOn(client, '_getOnce').mockImplementation(async () => {
      call++;
      return { status: 404, body: 'not found', headers: {} };
    });
    const r = await client.get('https://x');
    expect(r.status).toBe(404);
    expect(call).toBe(1);
  });

  it('5xx 不重试, 立即返 5xx result', async () => {
    const client = new HttpClient({ maxRetries: 1, retryDelayMs: 10 });
    let call = 0;
    vi.spyOn(client, '_getOnce').mockImplementation(async () => {
      call++;
      return { status: 503, body: 'oops', headers: {} };
    });
    const r = await client.get('https://x');
    expect(r.status).toBe(503);
    expect(call).toBe(1);
  });

  it('too_large 不重试 (caller 当作 body 过大处理)', async () => {
    const client = new HttpClient({ maxRetries: 1, retryDelayMs: 10 });
    let call = 0;
    vi.spyOn(client, '_getOnce').mockImplementation(async () => {
      call++;
      return { status: 200, body: '', headers: {}, error: 'too_large' };
    });
    const r = await client.get('https://x');
    expect(r.error).toBe('too_large');
    expect(call).toBe(1);
  });

  it('maxRetries=0 不重试 (跟旧行为一致)', async () => {
    const client = new HttpClient({ maxRetries: 0, retryDelayMs: 10 });
    let call = 0;
    vi.spyOn(client, '_getOnce').mockImplementation(async () => {
      call++;
      return { status: 0, body: '', headers: {}, error: 'network' };
    });
    const r = await client.get('https://x');
    expect(r.error).toBe('network');
    expect(call).toBe(1);
  });

  it('head + post 同样有重试', async () => {
    const client = new HttpClient({ maxRetries: 1, retryDelayMs: 10 });
    let calls = { head: 0, post: 0 };
    vi.spyOn(client, '_headOnce').mockImplementation(async () => {
      calls.head++;
      if (calls.head === 1) return { status: 0, body: '', headers: {}, error: 'network' };
      return { status: 200, finalUrl: 'https://x', headers: {} };
    });
    vi.spyOn(client, '_postOnce').mockImplementation(async () => {
      calls.post++;
      if (calls.post === 1) return { status: 0, body: '', headers: {}, error: 'timeout' };
      return { status: 201, body: 'created', headers: {} };
    });

    const h = await client.head('https://x');
    expect(h.status).toBe(200);
    expect(calls.head).toBe(2);

    const p = await client.post('https://x', {});
    expect(p.status).toBe(201);
    expect(calls.post).toBe(2);
  });
});

describe('HttpClient body 超限不挂死 (real socket)', () => {
  let server: any;
  let baseUrl: string;
  beforeAll(async () => {
    const http = require('node:http');
    server = http.createServer((req: any, res: any) => {
      if (req.url === '/big-content-length') {
        // MiniMax/Kimi 场景: headers 里 Content-Length 已超限. 故意不 end —
        // 修复前客户端 res.destroy() 后 promise 永远 pending, 测试按超时失败.
        res.writeHead(200, { 'Content-Length': String(2 * 1024 * 1024) });
        res.write('x');
      } else if (req.url === '/big-chunked') {
        // 无 Content-Length, 流式累计超限
        res.writeHead(200, { 'Transfer-Encoding': 'chunked' });
        res.write('x'.repeat(600 * 1024));
        res.write('x'.repeat(600 * 1024));
        res.end();
      } else {
        res.writeHead(200, { 'Content-Length': 2 });
        res.end('ok');
      }
    });
    await new Promise((resolve: any) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => {
    return new Promise((resolve: any) => {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      server.close(resolve);
    });
  });

  it('Content-Length 超限 → res.destroy 后仍要 resolve too_large (不悬挂)', async () => {
    const client = new HttpClient({ maxRetries: 0 });
    const r = await client.get(`${baseUrl}/big-content-length`, {
      maxBodyBytes: 1024 * 1024,
    });
    expect(r.error).toBe('too_large');
    expect(r.status).toBe(200);
  });

  it('无 Content-Length 流式累计超限 → resolve too_large', async () => {
    const client = new HttpClient({ maxRetries: 0 });
    const r = await client.get(`${baseUrl}/big-chunked`, {
      maxBodyBytes: 1024 * 1024,
    });
    expect(r.error).toBe('too_large');
    expect(r.status).toBe(200);
  });

  it('小 body 正常响应不受 close 兜底影响', async () => {
    const client = new HttpClient({ maxRetries: 0 });
    const r = await client.get(`${baseUrl}/ok`);
    expect(r.status).toBe(200);
    expect(r.body).toBe('ok');
    expect(r.error).toBeUndefined();
  });
});
