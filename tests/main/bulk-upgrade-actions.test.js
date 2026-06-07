/**
 * tests/main/bulk-upgrade-actions.test.js
 *
 * getActionForApp 纯函数 — 各 source → action 映射.
 * 12 case: 6 source type + 4 fallback + 2 edge.
 */
import { describe, it, expect } from 'vitest';
import { getActionForApp, buildAppPath } from '../../src/main/bulk-upgrade-actions.js';

describe('getActionForApp', () => {
  describe('brew sources', () => {
    it('brew_formulae → brew action with --cask', () => {
      const r = getActionForApp({
        id: 'cursor', name: 'Cursor', source: 'brew_formulae',
        current: '3.6.31', latest: '3.7.12', cask: 'cursor',
      });
      expect(r).toEqual({
        type: 'brew',
        cmd: 'brew',
        args: ['upgrade', '--cask', 'cursor'],
      });
    });

    it('brew_local_cask → 同上 (cask 来自 detectors)', () => {
      const r = getActionForApp({
        id: 'kimi', name: 'Kimi', source: 'brew_local_cask',
        current: '3.0.14', latest: '3.0.15', cask: 'kimi',
      });
      expect(r.type).toBe('brew');
      expect(r.args).toEqual(['upgrade', '--cask', 'kimi']);
    });

    it('brew 缺 cask → none', () => {
      const r = getActionForApp({
        id: 'x', name: 'X', source: 'brew_formulae',
        current: '1', latest: '2',
      });
      expect(r).toEqual({ type: 'none', reason: 'brew: missing cask' });
    });
  });

  describe('app store source', () => {
    it('app_store_lookup 带 trackId → mas action + fallback', () => {
      const r = getActionForApp({
        id: 'ima', name: 'IMA', source: 'app_store_lookup',
        current: '2.5.0', latest: '2.5.1', trackId: 6737188438,
      });
      expect(r).toEqual({
        type: 'mas',
        trackId: 6737188438,
        fallbackUrl: 'https://apps.apple.com/app/id6737188438',
      });
    });

    it('app_store_lookup 缺 trackId → none', () => {
      const r = getActionForApp({
        id: 'ima', name: 'IMA', source: 'app_store_lookup',
        current: '2.5.0', latest: '2.5.1',
      });
      expect(r).toEqual({ type: 'none', reason: 'app_store: missing trackId' });
    });

    it('app_store_lookup trackId=0 → none (无效)', () => {
      const r = getActionForApp({
        id: 'ima', name: 'IMA', source: 'app_store_lookup',
        trackId: 0,
      });
      expect(r.type).toBe('none');
    });
  });

  describe('open-source 类型 (sparkle / electron)', () => {
    it('sparkle_appcast 带 releaseUrl → open_url (Phase 22: 比 openPath 更可靠)', () => {
      const r = getActionForApp({
        id: 'codex', name: 'Codex', source: 'sparkle_appcast',
        current: '26.602.30954', latest: '26.602.40724',
        releaseUrl: 'https://persistent.oaistatic.com/codex-app-prod/Codex-darwin-arm64-26.602.40724.zip',
      });
      expect(r).toEqual({
        type: 'open_url',
        url: 'https://persistent.oaistatic.com/codex-app-prod/Codex-darwin-arm64-26.602.40724.zip',
        reason: 'sparkle download',
      });
    });

    it('sparkle_appcast 没 releaseUrl → fallback open app', () => {
      const r = getActionForApp({
        id: 'codexbar', name: 'CodexBar', source: 'sparkle_appcast',
        current: '0.32.3', latest: '0.32.4',
      });
      expect(r).toEqual({
        type: 'open',
        path: '/Applications/CodexBar.app',
      });
    });

    it('sparkle_appcast 没 releaseUrl 没 bundleName → none', () => {
      const r = getActionForApp({
        id: 'x', source: 'sparkle_appcast',
      });
      expect(r.type).toBe('none');
      expect(r.reason).toMatch(/missing bundleName/);
    });

    it('electron_yml → open (auto-updater)', () => {
      const r = getActionForApp({
        id: 'qoderwork', name: 'QoderWork CN', source: 'electron_yml',
        current: '1.0.0', latest: '1.1.0',
      });
      expect(r.type).toBe('open');
      expect(r.path).toBe('/Applications/QoderWork CN.app');
    });

    it('api_json → open (假设 electron 自带 updater)', () => {
      const r = getActionForApp({
        id: 'workbuddy', name: 'WorkBuddy', source: 'api_json',
        current: '1.0.0', latest: '1.1.0',
      });
      expect(r.type).toBe('open');
      expect(r.path).toBe('/Applications/WorkBuddy.app');
    });

    it('app_update_yml → open', () => {
      const r = getActionForApp({
        id: 'wb', name: 'WB', source: 'app_update_yml',
        current: '1', latest: '2',
      });
      expect(r.type).toBe('open');
    });
  });

  describe('无 auto-upgrade 源', () => {
    it('redirect_filename → none', () => {
      const r = getActionForApp({
        id: 'kimi', name: 'Kimi', source: 'redirect_filename',
        current: '3.0.14', latest: '3.0.15',
      });
      expect(r).toEqual({
        type: 'none',
        reason: "source 'redirect_filename' has no auto-upgrade",
      });
    });

    it('cursor_redirect → none (虽然有 brew chain, 但单独看就是 none)', () => {
      const r = getActionForApp({
        id: 'cursor', name: 'Cursor', source: 'cursor_redirect',
        current: '3.6.31', latest: '3.7.12',
      });
      expect(r.type).toBe('none');
    });

    it('未知 source → none', () => {
      const r = getActionForApp({
        id: 'x', name: 'X', source: 'mystery_detector',
        current: '1', latest: '2',
      });
      expect(r.type).toBe('none');
      expect(r.reason).toContain('mystery_detector');
    });
  });

  describe('edge cases', () => {
    it('null item → none', () => {
      expect(getActionForApp(null)).toEqual({ type: 'none', reason: 'invalid item' });
    });

    it('undefined item → none', () => {
      expect(getActionForApp(undefined)).toEqual({ type: 'none', reason: 'invalid item' });
    });

    it('open source 缺 name/bundleName → none', () => {
      const r = getActionForApp({ id: 'x', source: 'sparkle_appcast' });
      expect(r).toEqual({ type: 'none', reason: 'sparkle: missing bundleName and no release_url' });
    });

    it('open source 显式给 bundleName 覆盖 name', () => {
      const r = getActionForApp({
        id: 'x', name: 'Display Name', bundleName: 'Bundle.app',
        source: 'sparkle_appcast',
      });
      expect(r.path).toBe('/Applications/Bundle.app');
    });
  });
});

describe('buildAppPath', () => {
  it('不带 .app 后缀 → 自动加', () => {
    expect(buildAppPath('Cursor')).toBe('/Applications/Cursor.app');
  });

  it('已带 .app → 不重复加', () => {
    expect(buildAppPath('Cursor.app')).toBe('/Applications/Cursor.app');
  });

  it('空字符串 → 空字符串 (不拼 /Applications/)', () => {
    expect(buildAppPath('')).toBe('');
  });

  it('带空格 name', () => {
    expect(buildAppPath('QoderWork CN')).toBe('/Applications/QoderWork CN.app');
  });
});
