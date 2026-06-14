import { describe, test, expect } from 'vitest';
const { _resolveEndpoint } = require('../../src/ai-usage/client');

describe('_resolveEndpoint', () => {
  test('returns CN endpoint by default', () => {
    expect(_resolveEndpoint({ region: 'cn' })).toBe('https://www.minimaxi.com/v1/token_plan/remains');
  });
  test('returns Global endpoint when region=global', () => {
    expect(_resolveEndpoint({ region: 'global' })).toBe('https://www.minimax.io/v1/token_plan/remains');
  });
  test('opts.endpoint overrides', () => {
    expect(_resolveEndpoint({ region: 'cn', endpoint: 'https://custom.example.com/x' }))
      .toBe('https://custom.example.com/x');
  });
  test('env override MINIMAX_TOKEN_PLAN_URL wins over opts', () => {
    const prev = process.env.MINIMAX_TOKEN_PLAN_URL;
    process.env.MINIMAX_TOKEN_PLAN_URL = 'https://env.example.com/y';
    try {
      expect(_resolveEndpoint({ region: 'cn' })).toBe('https://env.example.com/y');
    } finally {
      if (prev === undefined) delete process.env.MINIMAX_TOKEN_PLAN_URL;
      else process.env.MINIMAX_TOKEN_PLAN_URL = prev;
    }
  });
});
