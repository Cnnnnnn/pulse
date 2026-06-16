/**
 * tests/main/bulk-upgrade-winget.test.js
 *
 * P3: winget_show source → winget action. 镜像 brew_formulae 的形态.
 * 跟 bulk-upgrade-actions.test.js 的 brew 用例同构.
 */
import { describe, it, expect } from 'vitest';
import { getActionForApp } from '../../src/main/bulk-upgrade-actions.js';

describe('getActionForApp — winget source (P3)', () => {
  it('winget_show + winget_id → winget action', () => {
    const r = getActionForApp({
      id: 'cursor', name: 'Cursor', source: 'winget_show',
      current: '3.6.31', latest: '3.7.12',
      wingetId: 'Anysphere.Cursor',
    });
    expect(r).toEqual({
      type: 'winget',
      id: 'Anysphere.Cursor',
    });
  });

  it('winget_show 缺 wingetId → none', () => {
    const r = getActionForApp({
      id: 'x', name: 'X', source: 'winget_show',
      current: '1', latest: '2',
    });
    expect(r).toEqual({ type: 'none', reason: 'winget: missing id' });
  });

  it('winget_show 接受 winget_id (snake_case) 字段 (renderer 可能两种命名都传)', () => {
    const r = getActionForApp({
      id: 'code', name: 'Code', source: 'winget_show',
      winget_id: 'OpenAI.Codex',
    });
    expect(r.type).toBe('winget');
    expect(r.id).toBe('OpenAI.Codex');
  });

  it('null item → none (回归)', () => {
    expect(getActionForApp(null)).toEqual({ type: 'none', reason: 'invalid item' });
  });
});
