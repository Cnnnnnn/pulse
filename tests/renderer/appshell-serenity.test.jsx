// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/preact';
import { AppShell } from '../../src/renderer/components/AppShell.jsx';
import { activeNav, setActiveNav } from '../../src/renderer/worldcup/navStore.js';

/**
 * Regression (bug fix): 点击 Serenity nav 必须渲染 TwitterSerenityPanel,
 * 不能 fallthrough 到 VersionsLayout (默认 else 分支).
 *
 * Bug 复现: AppShell 三元链没加 'serenity' 分支, 点了 Serenity 后
 * activeNav.value === 'serenity' 但落到 else 显示版本检查页 (看起来"没响应").
 */
describe('AppShell serenity nav', () => {
  beforeEach(() => {
    // twitterList 在生产由 preload 暴露; 测试环境 api.twitterList 走 pick → noop,
    // TwitterSerenityPanel 用 Promise.resolve 包装容错, 不会崩.
    global.window.api = global.window.api || {};
  });

  afterEach(() => {
    cleanup();
    setActiveNav('versions');
  });

  it("nav='serenity' 时渲染 Serenity 面板 (含状态条), 不显示版本检查页", async () => {
    setActiveNav('serenity');
    const { getByText, container } = render(<AppShell onCheck={() => {}} />);
    // TwitterSerenityPanel 顶层 .serenity-panel + 状态条文案
    await waitFor(() => {
      expect(container.querySelector('.serenity-panel')).toBeTruthy();
    });
    // 强制刷新按钮 (VersionsLayout 没有这个)
    expect(getByText('强制刷新')).toBeTruthy();
  });
});
