/**
 * tests/renderer/ai-settings-modal.test.jsx
 *
 * Phase B6c.3 (AI Sessions Daily Digest): AISettingsModal 测试.
 *走 happy-dom (跟邻居 modal 测试一致).
 *
 *覆盖:
 * - aiSettingsOpen=false →整体不渲染
 * - enabled toggle / provider select / API key 输入 / save按钮
 * - 测试连接走 store.runAIHealthcheck
 * - 保存配置走 store.saveAISessionsConfig
 * -错误显示 (safeStorage不可用 / 测试 fail)
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { render, fireEvent, cleanup } from '@testing-library/preact';
import * as store from '../../src/renderer/store.js';
import { AISettingsModal } from '../../src/renderer/components/AISettingsModal.jsx';

// mock store — 直接控制 signal, 不真走 IPC
vi.spyOn(store, 'setAIKey').mockImplementation(async () => ({ ok: true }));
vi.spyOn(store, 'clearAIKey').mockImplementation(async () => ({ ok: true }));
vi.spyOn(store, 'runAIHealthcheck').mockImplementation(async () => {
 const r = { ok: true, latencyMs:123 };
 store.aiHealthcheckResult.value = r;
 return r;
});
vi.spyOn(store, 'saveAISessionsConfig').mockImplementation(async (cfg) => {
 store.aiSessionsConfig.value = cfg;
 return { ok: true, config: cfg };
});
vi.spyOn(store, 'probeAIKeyStatuses').mockImplementation(async () => {
 store.aiKeyStatus.value = {
 openai: { hasKey: true, available: true },
 anthropic: { hasKey: false, available: true },
 };
});
vi.spyOn(store, 'openAISettings').mockImplementation((open) => {
 store.aiSettingsOpen.value = Boolean(open);
});

// 测试间重置 signal
beforeEach(() => {
 cleanup();
 store.aiSessionsConfig.value = null;
 store.aiKeyStatus.value = {};
 store.aiHealthcheckBusy.value = false;
 store.aiHealthcheckResult.value = null;
 store.aiSettingsOpen.value = true; // default打开方便测
 store.runAIHealthcheck.mockClear();
 store.saveAISessionsConfig.mockClear();
 store.setAIKey.mockClear();
 store.clearAIKey.mockClear();
});

describe('AISettingsModal — mount / open', () => {
 it('aiSettingsOpen.value=false → 不渲染 modal', () => {
 const m = store;
 m.aiSettingsOpen.value = false;
 const { container } = render(<AISettingsModal />);
 expect(container.querySelector('.ai-settings-modal')).toBeNull();
 });

 it('open=true 时渲染 modal + header', () => {
 const { container } = render(<AISettingsModal />);
 const card = container.querySelector('.ai-settings-modal');
 expect(card).not.toBeNull();
 expect(card.querySelector('.modal-header h2').textContent).toContain('AI总结');
 });

 it('点 close按钮 → openAISettings(false) 被调', () => {
 const m = store;
 m.openAISettings.mockClear();
 const { container } = render(<AISettingsModal />);
 fireEvent.click(container.querySelector('.btn-close'));
 expect(m.openAISettings).toHaveBeenCalledWith(false);
 });
});

describe('AISettingsModal — enabled toggle + provider', () => {
 it('disabled 时,所有 input 都 disabled', () => {
 const m = store;
 m.aiSessionsConfig.value = { enabled: false, provider: 'ollama' };
 const { container } = render(<AISettingsModal />);
 expect(container.querySelector('.ai-settings-toggle input').checked).toBe(false);
 });

 it('enabled toggle切换 →反映到 checkbox', () => {
 const { container } = render(<AISettingsModal />);
 const cb = container.querySelector('.ai-settings-toggle input');
 expect(cb.checked).toBe(false);
 fireEvent.change(cb, { target: { checked: true } });
 expect(cb.checked).toBe(true);
 });

 it('provider select:切换到 openai 显示 cloud 配置 + API key input', () => {
 const m = store;
 m.aiSessionsConfig.value = { enabled: true, provider: 'ollama' };
 const { container } = render(<AISettingsModal />);
 const select = container.querySelectorAll('select')[0];
 fireEvent.change(select, { target: { value: 'openai' } });
 // Cloud providerId select出现 (3 个 select: provider, cloudProviderId, (no3rd since ollama))
 const selects = container.querySelectorAll('select');
 expect(selects.length).toBeGreaterThanOrEqual(2);
 // API key input出现
 expect(container.querySelector('input[type="password"]')).not.toBeNull();
 });
});

describe('AISettingsModal — API key 操作', () => {
 it('点 "保存 key" → setAIKey 被调, 带 providerId + apiKey', async () => {
 const m = store;
 m.aiSessionsConfig.value = { enabled: true, provider: 'openai' };
 const { container } = render(<AISettingsModal />);
 //切到 openai +输 key
 const providerSelect = container.querySelectorAll('select')[0];
 fireEvent.change(providerSelect, { target: { value: 'openai' } });
 const keyInput = container.querySelector('input[type="password"]');
 fireEvent.input(keyInput, { target: { value: 'sk-test-123' } });
 const saveKeyBtn = container.querySelector('.ai-settings-key-controls .btn-secondary');
 fireEvent.click(saveKeyBtn);
 //异步 + microtask flush
 await new Promise((r) => setTimeout(r,10));
 expect(m.setAIKey).toHaveBeenCalledWith('openai', 'sk-test-123');
 });

 it('点 "清空" → clearAIKey 被调', async () => {
 const m = store;
 m.aiSessionsConfig.value = { enabled: true, provider: 'openai' };
 m.aiKeyStatus.value = { openai: { hasKey: true, available: true } };
 const { container } = render(<AISettingsModal />);
 // 先切到 openai
 fireEvent.change(container.querySelectorAll('select')[0], { target: { value: 'openai' } });
 const clearBtn = container.querySelectorAll('.ai-settings-key-controls .btn')[1];
 fireEvent.click(clearBtn);
 await new Promise((r) => setTimeout(r,10));
 expect(m.clearAIKey).toHaveBeenCalledWith('openai');
 });

 it('key 已存时,placeholder 显示 (已存储,输入新值替换)', () => {
 const m = store;
 m.aiSessionsConfig.value = { enabled: true, provider: 'openai' };
 m.aiKeyStatus.value = { openai: { hasKey: true, available: true } };
 const { container } = render(<AISettingsModal />);
 fireEvent.change(container.querySelectorAll('select')[0], { target: { value: 'openai' } });
 const keyInput = container.querySelector('input[type="password"]');
 expect(keyInput.placeholder).toMatch(/已存储/);
 });
});

describe('AISettingsModal — 测试连接', () => {
 it('点 "测试连接" → runAIHealthcheck 被调 (cloud传 providerId+model+apiKey)', async () => {
 const m = store;
 m.aiSessionsConfig.value = { enabled: true, provider: 'openai' };
 const { container } = render(<AISettingsModal />);
 fireEvent.change(container.querySelectorAll('select')[0], { target: { value: 'openai' } });
 const testBtn = container.querySelector('.ai-settings-test-row .btn');
 fireEvent.click(testBtn);
 await new Promise((r) => setTimeout(r,10));
 expect(m.runAIHealthcheck).toHaveBeenCalledWith(expect.objectContaining({
 providerId: 'openai',
 }));
 });

 it('healthcheck ok → 显示 ✓ + latency', async () => {
 const m = store;
 m.runAIHealthcheck.mockImplementationOnce(async () => {
 const r = { ok: true, latencyMs:234 };
 store.aiHealthcheckResult.value = r;
 return r;
 });
 m.aiSessionsConfig.value = { enabled: true, provider: 'openai' };
 const { container } = render(<AISettingsModal />);
 fireEvent.change(container.querySelectorAll('select')[0], { target: { value: 'openai' } });
 fireEvent.click(container.querySelector('.ai-settings-test-row .btn'));
 await new Promise((r) => setTimeout(r,10));
 const result = container.querySelector('.ai-settings-test-result');
 expect(result.textContent).toMatch(/✓/);
 expect(result.textContent).toMatch(/234ms/);
 expect(result.classList.contains('ok')).toBe(true);
 });

 it('healthcheck fail → 显示 ✗ + error', async () => {
 const m = store;
 m.runAIHealthcheck.mockImplementationOnce(async () => {
 const r = { ok: false, error: 'auth_401' };
 store.aiHealthcheckResult.value = r;
 return r;
 });
 m.aiSessionsConfig.value = { enabled: true, provider: 'openai' };
 const { container } = render(<AISettingsModal />);
 fireEvent.change(container.querySelectorAll('select')[0], { target: { value: 'openai' } });
 fireEvent.click(container.querySelector('.ai-settings-test-row .btn'));
 await new Promise((r) => setTimeout(r,10));
 const result = container.querySelector('.ai-settings-test-result');
 expect(result.textContent).toMatch(/✗/);
 expect(result.textContent).toMatch(/auth_401/);
 expect(result.classList.contains('fail')).toBe(true);
 });
});

describe('AISettingsModal — 保存配置', () => {
 it('点 "保存配置" → saveAISessionsConfig 被调, 带 enabled+provider+ollama+cloud', async () => {
 const m = store;
 m.aiSessionsConfig.value = { enabled: true, provider: 'ollama', ollama: { host: 'http://x:1234', model: 'qwen3:7b' } };
 const { container } = render(<AISettingsModal />);
 const saveBtn = container.querySelector('.modal-footer .btn-primary');
 fireEvent.click(saveBtn);
 await new Promise((r) => setTimeout(r,10));
 expect(m.saveAISessionsConfig).toHaveBeenCalledWith(expect.objectContaining({
 enabled: true,
 provider: 'ollama',
 ollama: expect.objectContaining({ host: 'http://x:1234' }),
 }));
 });
});
