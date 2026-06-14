import { describe, test, expect } from 'vitest';
const { _pickNumber, _pickString, _parseDdHhMmSs } = require('../../src/ai-usage/normalize');

describe('_pickNumber', () => {
  test('returns first present key value as number', () => {
    expect(_pickNumber({ a: '42', b: 100 }, ['a', 'b'])).toBe(42);
    expect(_pickNumber({ b: 100 }, ['a', 'b'])).toBe(100);
  });
  test('coerces numeric string to number', () => {
    expect(_pickNumber({ x: '6000' }, ['x'])).toBe(6000);
  });
  test('returns null when no candidate key present', () => {
    expect(_pickNumber({ foo: 1 }, ['a', 'b'])).toBe(null);
  });
  test('returns null for negative or NaN', () => {
    expect(_pickNumber({ x: -5 }, ['x'])).toBe(null);
    expect(_pickNumber({ x: 'abc' }, ['x'])).toBe(null);
    expect(_pickNumber({ x: NaN }, ['x'])).toBe(null);
  });
  test('returns null when obj is null/undefined', () => {
    expect(_pickNumber(null, ['x'])).toBe(null);
    expect(_pickNumber(undefined, ['x'])).toBe(null);
  });
  test('returns null when keys is empty', () => {
    expect(_pickNumber({ x: 5 }, [])).toBe(null);
  });
});

describe('_pickString', () => {
  test('returns first present key value as string', () => {
    expect(_pickString({ a: 'hello', b: 'world' }, ['a', 'b'])).toBe('hello');
    expect(_pickString({ b: 'world' }, ['a', 'b'])).toBe('world');
  });
  test('coerces non-string to string', () => {
    expect(_pickString({ x: 42 }, ['x'])).toBe('42');
  });
  test('returns null when no candidate key present', () => {
    expect(_pickString({ foo: 1 }, ['a', 'b'])).toBe(null);
  });
  test('returns null when obj is null/undefined', () => {
    expect(_pickString(null, ['x'])).toBe(null);
  });
});

describe('_parseDdHhMmSs', () => {
  test('parses DD:HH:MM:SS to total seconds', () => {
    expect(_parseDdHhMmSs('00:01:00:00')).toBe(3600);
    expect(_parseDdHhMmSs('01:00:00:00')).toBe(86400);
    expect(_parseDdHhMmSs('00:00:01:00')).toBe(60);
    expect(_parseDdHhMmSs('00:00:00:30')).toBe(30);
    expect(_parseDdHhMmSs('00:00:00:00')).toBe(0);
  });
  test('returns null for malformed input', () => {
    expect(_parseDdHhMmSs('garbage')).toBe(null);
    expect(_parseDdHhMmSs('')).toBe(null);
    expect(_parseDdHhMmSs(null)).toBe(null);
    expect(_parseDdHhMmSs(undefined)).toBe(null);
  });
  test('returns null for partial input', () => {
    expect(_parseDdHhMmSs('01:02:03')).toBe(null);
  });
});
