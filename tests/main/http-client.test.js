/**
 * tests/main/http-client.test.js
 *
 * Phase 24: HttpClient 网络失败重试.
 * 5 case: 一次性成功 / 重试成功 / 重试用完仍失败 / 4xx/5xx 不重试 / too_large 不重试.
 */
import { describe, it, expect, vi } from 'vitest';
import { HttpClient } from '../../src/main/http-client.js';

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
