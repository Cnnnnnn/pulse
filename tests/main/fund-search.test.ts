/**
 * tests/main/fund-search.test.js
 *
 * fund-search.js 单测 — 覆盖:
 *   - parseSearchResponse: 正常 / 过滤股票 / 过滤空 code / 解析失败 / ErrCode!=0
 *   - searchFunds: 短 query 跳过 / 正常拉取 / HTTP 错误 / network error / 空 body
 *   - 字段映射: FundBaseInfo 优先 / NAME fallback / 最新净值解析
 */

import { describe, it, expect } from 'vitest';
import { MockHttp } from '../helpers/mock-http.js';
const { searchFunds, parseSearchResponse } = require('../../src/funds/fund-search.js');

const SAMPLE = JSON.stringify({
  ErrCode: 0,
  ErrMsg: 'ok',
  Datas: [
    {
      CODE: '000001',
      NAME: '华夏成长混合',
      CATEGORYDESC: '基金',
      FundBaseInfo: {
        FCODE: '000001',
        SHORTNAME: '华夏成长混合',
        FTYPE: '混合型-偏股',
        FUNDTYPE: '002',
        JJGS: '华夏基金',
        DWJZ: '1.2860',
        FSRQ: '2026-06-11',
      },
    },
    {
      CODE: '519677',
      NAME: '银河创新成长混合A',
      CATEGORYDESC: '基金',
      FundBaseInfo: {
        FCODE: '519677',
        SHORTNAME: '银河创新成长混合A',
        FTYPE: '混合型-偏股',
        FUNDTYPE: '002',
        JJGS: '银河基金',
        DWJZ: '2.3456',
        FSRQ: '2026-06-11',
      },
    },
    {
      CODE: '002614',
      NAME: '奥佳华',
      CATEGORYDESC: '深市',  // ← 股票, 过滤掉
      FundBaseInfo: null,
    },
    {
      CODE: '00883',
      NAME: '华讯',
      CATEGORYDESC: '港股',  // ← 港股, 过滤掉
      FundBaseInfo: null,
    },
    {
      CODE: 'abc',
      NAME: '非法 code',
      CATEGORYDESC: '基金',  // ← 非 6 位, 过滤掉
    },
  ],
});

describe('parseSearchResponse', () => {
  it('正常解析: 5 条输入 → 2 条基金 (过滤掉股票 + 非法 code)', () => {
    const out = parseSearchResponse(SAMPLE);
    expect(out).toHaveLength(2);
    expect(out[0].code).toBe('000001');
    expect(out[0].name).toBe('华夏成长混合');
    expect(out[0].shortName).toBe('华夏成长混合');
    expect(out[0].ftype).toBe('混合型-偏股');
    expect(out[0].company).toBe('华夏基金');
    expect(out[0].latestNav).toBe(1.286);
    expect(out[0].navDate).toBe('2026-06-11');
    expect(out[1].code).toBe('519677');
  });

  it('FundBaseInfo 缺失 → 字段容错', () => {
    const out = parseSearchResponse(JSON.stringify({
      ErrCode: 0,
      Datas: [{ CODE: '000002', NAME: '无名基金', CATEGORYDESC: '基金', FundBaseInfo: null }],
    }));
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe('000002');
    expect(out[0].name).toBe('无名基金');
    expect(out[0].ftype).toBe('');
    expect(out[0].company).toBe('');
    expect(out[0].latestNav).toBeNull();
  });

  it('NAME 缺失 → 用 code 兜底', () => {
    const out = parseSearchResponse(JSON.stringify({
      ErrCode: 0,
      Datas: [{ CODE: '000003', CATEGORYDESC: '基金' }],
    }));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('基金 000003');
  });

  it('过滤所有非基金条目', () => {
    const out = parseSearchResponse(JSON.stringify({
      ErrCode: 0,
      Datas: [
        { CODE: '002614', NAME: 'x', CATEGORYDESC: '深市' },
        { CODE: '00883',  NAME: 'y', CATEGORYDESC: '港股' },
        { CODE: 'EWBC',   NAME: 'z', CATEGORYDESC: '美股' },
      ],
    }));
    expect(out).toEqual([]);
  });

  it('JSON 解析失败 → 空数组', () => {
    expect(parseSearchResponse('not json')).toEqual([]);
    expect(parseSearchResponse('')).toEqual([]);
    expect(parseSearchResponse(null)).toEqual([]);
    expect(parseSearchResponse(undefined)).toEqual([]);
  });

  it('ErrCode != 0 → 空数组', () => {
    const bad = JSON.stringify({ ErrCode: 1, Datas: [{ CODE: '000001', CATEGORYDESC: '基金' }] });
    expect(parseSearchResponse(bad)).toEqual([]);
  });

  it('Datas 非数组 → 空数组', () => {
    expect(parseSearchResponse(JSON.stringify({ ErrCode: 0, Datas: null }))).toEqual([]);
    expect(parseSearchResponse(JSON.stringify({ ErrCode: 0 }))).toEqual([]);
  });

  it('最新净值 DWJZ 数字解析失败 → null', () => {
    const out = parseSearchResponse(JSON.stringify({
      ErrCode: 0,
      Datas: [{
        CODE: '000001', NAME: 'x', CATEGORYDESC: '基金',
        FundBaseInfo: { DWJZ: 'abc' },
      }],
    }));
    expect(out[0].latestNav).toBeNull();
  });
});

describe('searchFunds', () => {
  it('query < 2 字符 → 空数组 (不发请求)', async () => {
    const http = new MockHttp();
    const out = await searchFunds('', http);
    expect(out).toEqual([]);
    expect(http.getCalls).toHaveLength(0);

    const out2 = await searchFunds('华', http);
    expect(out2).toEqual([]);
    expect(http.getCalls).toHaveLength(0);
  });

  it('正常 200 → 返回过滤后基金列表', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: SAMPLE }] });
    const out = await searchFunds('华夏', http);
    expect(out).toHaveLength(2);
    expect(out[0].code).toBe('000001');
    // 校验 URL 形状
    expect(http.getCalls[0].url).toMatch(/key=/);
    expect(http.getCalls[0].url).toMatch(/key=%E5%8D%8E%E5%A4%8F/);   // "华夏" URL-encoded
    expect(http.getCalls[0].url).toMatch(/m=1/);
    expect(http.getCalls[0].url).toMatch(/pagesize=20/);
    expect(http.getCalls[0].opts.headers['User-Agent']).toMatch(/Mozilla/);
  });

  it('HTTP 500 → 抛错', async () => {
    const http = new MockHttp({ get: [{ status: 500, body: 'oops' }] });
    await expect(searchFunds('华夏', http)).rejects.toThrow(/HTTP 500/);
  });

  it('network error → 抛错', async () => {
    const http = new MockHttp({ get: [{ error: 'network' }] });
    await expect(searchFunds('华夏', http)).rejects.toThrow(/network/);
  });

  it('timeout error → 抛错', async () => {
    const http = new MockHttp({ get: [{ error: 'timeout' }] });
    await expect(searchFunds('华夏', http)).rejects.toThrow(/timeout/);
  });

  it('空 body → 空数组', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: '' }] });
    const out = await searchFunds('华夏', http);
    expect(out).toEqual([]);
  });

  it('body 非 JSON → 空数组 (不抛错)', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: '<html>error</html>' }] });
    const out = await searchFunds('华夏', http);
    expect(out).toEqual([]);
  });

  it('pagesize 自定义', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: SAMPLE }] });
    await searchFunds('华夏', http, { pagesize: 50 });
    expect(http.getCalls[0].url).toMatch(/pagesize=50/);
  });

  it('query 带前后空格 → 自动 trim', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: SAMPLE }] });
    await searchFunds('  华夏  ', http);
    expect(http.getCalls[0].url).toMatch(/key=%E5%8D%8E%E5%A4%8F/);
  });
});