/**
 * tests/renderer/ai-settings-modal.test.jsx
 *
 * Phase B7g (Drawer-Integrated Config): AISettingsModal 已不挂载,改成测 <AIConfigForm />.
 * (AIConfigForm来自 AISettingsModal.jsx,被 drawer + (legacy) modal 共用)
 *
 * Phase B7e: 只 deepseek + minimax (cloud provider, ollama取消)
 * Phase B7f: 没有 enabled toggle — enabled 从 cfg派生 (有 provider 即 enabled)
 *
 *走 happy-dom跟邻居 modal 测试一致.
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { render, fireEvent, cleanup } from '@testing-library/preact';
import * as store from '../../src/renderer/store.js';
import { AIConfigForm } from '../../src/renderer/components/AISettingsModal.jsx';

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
 deepseek: { hasKey: true, available: true },
 minimax: { hasKey: false, available: true },
 };
});
vi.spyOn(store, 'openAISettings').mockImplementation((open) => {
 store.aiSettingsOpen.value = Boolean(open);
});

beforeEach(() => {
 cleanup();
 store.aiSessionsConfig.value = null;
 store.aiKeyStatus.value = {};
 store.aiHealthcheckBusy.value = false;
 store.aiHealthcheckResult.value = null;
 store.aiSettingsOpen.value = true;
 store.digestConfigMode.value = false;
 store.runAIHealthcheck.mockClear();
 store.saveAISessionsConfig.mockClear();
 store.setAIKey.mockClear();
 store.clearAIKey.mockClear();
});

// ── <AIConfigForm /> — shared form (drawer + legacy modal 都用) ───────

describe('<AIConfigForm /> — Phase B7e: 只 deepseek + minimax', () => {
 it('渲染 provider-card (deepseek + minimax + glm), 没有 ollama/openai/anthropic', () => {
 const onSaved = vi.fn();
 const { container } = render(<AIConfigForm onSaved={onSaved} />);
 const cards = container.querySelectorAll('.settings-list--radiogroup .settings-list__row');
 expect(cards.length).toBe(3);
 const labels = Array.from(cards).map((c) => c.querySelector('.settings-list__row-name').textContent);
 expect(labels.some((text) => text.includes('DeepSeek'))).toBe(true);
 expect(labels.some((text) => text.includes('MiniMax'))).toBe(true);
 expect(labels.some((text) => text.includes('GLM'))).toBe(true);
 expect(labels.some((text) => text.includes('Ollama'))).toBe(false);
 expect(labels.some((text) => text.includes('OpenAI'))).toBe(false);
 expect(labels.some((text) => text.includes('Anthropic'))).toBe(false);
 });

 it('默认选中 deepseek (没 cfg 时)', () => {
 const { container } = render(<AIConfigForm />);
 const cards = container.querySelectorAll('.settings-list--radiogroup .settings-list__row');
 const selected = Array.from(cards).find((c) => c.classList.contains('is-selected'));
 expect(selected.querySelector('.settings-list__row-name').textContent).toBe('DeepSeek');
 });

 it('点 MiniMax card →切换 provider, model input跟 minimax走', () => {
 const { container } = render(<AIConfigForm />);
 const cards = container.querySelectorAll('.settings-list--radiogroup .settings-list__row');
 const minimaxCard = Array.from(cards).find((c) =>
 c.querySelector('.settings-list__row-name').textContent.includes('MiniMax'));
 // P16.2: 点内部 button (radio role 行为) 触发 onClick, li 重新渲染加 is-selected.
 const minimaxBtn = minimaxCard.querySelector('.settings-list__row-btn');
 fireEvent.click(minimaxBtn);
 expect(minimaxCard.classList.contains('is-selected')).toBe(true);
 expect(minimaxCard.querySelector('.settings-list__row-name').textContent).toBe('MiniMax');
 const inputs = container.querySelectorAll('input[type="text"]');
 //第一个是 model,第二个是 baseUrl
 expect(inputs[0].value).toBe('MiniMax-M3');
 });

 it('从 state.json读 cfg 时,恢复上次选的 provider', () => {
 store.aiSessionsConfig.value = {
 provider: 'minimax',
 cloud: { providerId: 'minimax', model: 'm1', baseUrl: 'https://x' },
 };
 const { container } = render(<AIConfigForm />);
 const cards = container.querySelectorAll('.settings-list--radiogroup .settings-list__row');
 const selected = Array.from(cards).find((c) => c.classList.contains('is-selected'));
 expect(selected.querySelector('.settings-list__row-name').textContent).toBe('MiniMax');
 });
});

describe('<AIConfigForm /> — Phase B7f: 没有 enabled toggle', () => {
 it('不渲染 .ai-settings-toggle (checkbox)', () => {
 const { container } = render(<AIConfigForm />);
 expect(container.querySelector('.ai-settings-toggle')).toBeNull();
 });

 it('不渲染 enabled字段在保存 payload 中', async () => {
 store.aiSessionsConfig.value = {
 provider: 'deepseek',
 cloud: { providerId: 'deepseek', model: 'deepseek-chat' },
 };
 const { container } = render(<AIConfigForm />);
 const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('保存配置'));
 fireEvent.click(saveBtn);
 await new Promise((r) => setTimeout(r,10));
 const call = store.saveAISessionsConfig.mock.calls[0][0];
 expect(call).not.toHaveProperty('enabled');
 });

 it('保存后调 onSaved回调 (drawer用来自动 rerun)', async () => {
 store.aiSessionsConfig.value = {
 provider: 'deepseek',
 cloud: { providerId: 'deepseek', model: 'deepseek-chat' },
 };
 const onSaved = vi.fn();
 const { container } = render(<AIConfigForm onSaved={onSaved} />);
 fireEvent.click(Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('保存配置')));
 await new Promise((r) => setTimeout(r,10));
 expect(onSaved).toHaveBeenCalledOnce();
 });

 it('点 "返回" / "关闭"按钮 →调 onCancel', () => {
 const onCancel = vi.fn();
 const { container } = render(<AIConfigForm compact onCancel={onCancel} />);
 // compact=true 时按钮文案是 "返回"
 const cancelBtn = Array.from(container.querySelectorAll('.ai-config-form-actions .settings-btn'))
 .find((b) => b.textContent.includes('返回'));
 fireEvent.click(cancelBtn);
 expect(onCancel).toHaveBeenCalledOnce();
 });
});

describe('<AIConfigForm /> — API key 操作', () => {
 it('点 "保存 key" → setAIKey + saveAISessionsConfig 同步写入', async () => {
 store.aiSessionsConfig.value = {
 provider: 'deepseek',
 cloud: { providerId: 'deepseek', model: 'deepseek-chat' },
 };
 const { container } = render(<AIConfigForm />);
 const keyInput = container.querySelector('input[type="password"]');
 fireEvent.input(keyInput, { target: { value: 'sk-test-123' } });
 const saveKeyBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('保存 key'));
 fireEvent.click(saveKeyBtn);
 await new Promise((r) => setTimeout(r,10));
 expect(store.setAIKey).toHaveBeenCalledWith('deepseek', 'sk-test-123');
 expect(store.saveAISessionsConfig).toHaveBeenCalledWith(
 expect.objectContaining({
 provider: 'deepseek',
 cloud: expect.objectContaining({
 providerId: 'deepseek',
 model: 'deepseek-chat',
 }),
 }),
 );
 });

 it('点 "清空" → clearAIKey 被调', async () => {
 store.aiSessionsConfig.value = {
 provider: 'deepseek',
 cloud: { providerId: 'deepseek', model: 'deepseek-chat' },
 };
 store.aiKeyStatus.value = { deepseek: { hasKey: true, available: true } };
 const { container } = render(<AIConfigForm />);
 const clearBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('清空'));
 fireEvent.click(clearBtn);
 await new Promise((r) => setTimeout(r,10));
 expect(store.clearAIKey).toHaveBeenCalledWith('deepseek');
 });

 it('key 已存时, placeholder 显示 (已存储, 输入新值替换)', () => {
 store.aiSessionsConfig.value = {
 provider: 'deepseek',
 cloud: { providerId: 'deepseek', model: 'deepseek-chat' },
 };
 store.aiKeyStatus.value = { deepseek: { hasKey: true, available: true } };
 const { container } = render(<AIConfigForm />);
 const keyInput = container.querySelector('input[type="password"]');
 expect(keyInput.placeholder).toMatch(/已存储/);
 });
});

describe('<AIConfigForm /> — 测试连接', () => {
 it('点 "测试连接" → runAIHealthcheck 被调 (cloud传 providerId + model + apiKey)', async () => {
 store.aiSessionsConfig.value = {
 provider: 'deepseek',
 cloud: { providerId: 'deepseek', model: 'deepseek-chat' },
 };
 const { container } = render(<AIConfigForm />);
 const testBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('测试连接'));
 fireEvent.click(testBtn);
 await new Promise((r) => setTimeout(r,10));
 expect(store.runAIHealthcheck).toHaveBeenCalledWith(expect.objectContaining({
 providerId: 'deepseek',
 }));
 });

it('healthcheck ok → 显示 IconCheck + latency', async () => {
 store.runAIHealthcheck.mockImplementationOnce(async () => {
 const r = { ok: true, latencyMs:234 };
 store.aiHealthcheckResult.value = r;
 return r;
 });
 store.aiSessionsConfig.value = {
 provider: 'deepseek',
 cloud: { providerId: 'deepseek', model: 'deepseek-chat' },
 };
 const { container } = render(<AIConfigForm />);
 fireEvent.click(Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('测试连接')));
 await new Promise((r) => setTimeout(r,10));
 const result = container.querySelectorAll('.settings-card')[3].querySelector('.ai-settings-test-result');
 expect(result.textContent).toMatch(/234ms/);
 expect(result.classList.contains('is-ok')).toBe(true);
 });

it('healthcheck fail → 显示 IconX + error', async () => {
 store.runAIHealthcheck.mockImplementationOnce(async () => {
 const r = { ok: false, error: 'auth_401' };
 store.aiHealthcheckResult.value = r;
 return r;
 });
 store.aiSessionsConfig.value = {
 provider: 'deepseek',
 cloud: { providerId: 'deepseek', model: 'deepseek-chat' },
 };
 const { container } = render(<AIConfigForm />);
 fireEvent.click(Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('测试连接')));
 await new Promise((r) => setTimeout(r,10));
 const result = container.querySelectorAll('.settings-card')[3].querySelector('.ai-settings-test-result');
 expect(result.textContent).toMatch(/auth_401/);
 expect(result.classList.contains('is-fail')).toBe(true);
 });
});

describe('<AIConfigForm /> — 保存配置 (Phase B7g schema: 无 enabled)', () => {
 it('点 "保存配置" → saveAISessionsConfig 被调, 带 provider + cloud (没有 ollama, 没有 enabled)', async () => {
 store.aiSessionsConfig.value = {
 provider: 'deepseek',
 cloud: { providerId: 'deepseek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
 };
 const { container } = render(<AIConfigForm />);
 const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('保存配置'));
 fireEvent.click(saveBtn);
 await new Promise((r) => setTimeout(r,10));
 expect(store.saveAISessionsConfig).toHaveBeenCalledWith(expect.objectContaining({
 provider: 'deepseek',
 cloud: expect.objectContaining({
 providerId: 'deepseek',
 model: 'deepseek-chat',
 }),
 }));
 const call = store.saveAISessionsConfig.mock.calls[0][0];
 expect(call).not.toHaveProperty('enabled'); // B7f:派生, 不传
 expect(call).not.toHaveProperty('ollama'); // B7e: 只 cloud
 });
});

describe('<AIConfigForm /> — compact mode (drawer 用)', () => {
 it('compact=true → 不渲染回填按钮 (重做版: 回填已删除)', () => {
 const { container } = render(<AIConfigForm compact />);
 const btns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent.includes('测试连接') || b.textContent.includes('回填'));
 const labels = Array.from(btns).map((b) => b.textContent);
 expect(labels.some((l) => l.includes('回填'))).toBe(false);
 });

 it('compact=false → 也不渲染回填按钮 (重做版: 按需生成, 无回填)', () => {
 const { container } = render(<AIConfigForm />);
 const btns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent.includes('测试连接') || b.textContent.includes('回填'));
 const labels = Array.from(btns).map((b) => b.textContent);
 expect(labels.some((l) => l.includes('回填'))).toBe(false);
 // 测试连接按钮仍在
 expect(labels.some((l) => l.includes('测试连接'))).toBe(true);
 });
});

// ── P15: AISettingsModal 已废弃 — AI 配置统一在 SettingsPage 'ai' tab,
//         Modal 测试块已删除. AIConfigForm 测试保留.
