/**
 * src/renderer/components/AISettingsModal.jsx
 *
 * P15: AISettingsModal 函数已废弃删除 — AI 配置现在统一在 SettingsPage 'ai' tab.
 *      本文件保留 AIConfigForm / PROVIDERS / DEFAULT_BASE_URL 给 AISettingsScene 复用.
 *
 * Phase B7g (Drawer-Integrated Config): 配置表单不再单独 modal.
 *
 *拆出 <AIConfigForm /> —共享组件, AISettingsModal (legacy) + AIDigestDrawer 都用.
 *  P15 之后: AISettingsScene 在 SettingsPage 内嵌, AITasksDrawer 也指向 SettingsPage.
 *
 * Phase B7e简化:
 * - 只支持 cloud provider (deepseek / minimax / glm).
 * - 没有 "enabled" toggle (B7f 起 enabled 从 cfg 自动派生: 有 provider 即 enabled).
 */

import { useState, useEffect } from 'preact/hooks';
import {
  aiSessionsConfig,
  aiKeyStatus,
  aiHealthcheckBusy,
  aiHealthcheckResult,
  probeAIKeyStatuses,
  setAIKey,
  clearAIKey,
  runAIHealthcheck,
  saveAISessionsConfig,
  aiUseVaultKey,
} from '../store.ts';
import { showToast } from '../store/toast-store.ts';
import { api } from '../api.ts';
import { IconCheck, IconX } from './icons.tsx';
import {
  formatModelPresetsText,
  parseModelPresetsText,
  partitionModelPresetsByProvider,
} from '../assistant/assistant-model-presets.ts';

// Phase B7g: 默认 model + base URL 用2026官网最新.
// - DeepSeek: deepseek-chat = DeepSeek-V3.1 (128K context, 默认非思考模式).
// 想用思考模式可手动改成 deepseek-reasoner.
// - MiniMax: MiniMax-M3 (用户指定2026 最新). base URL = api.minimaxi.com/v1.
// - GLM: 智谱 z.ai, 用于"AI 用量"页监控 GLM 编程套餐配额.
export const PROVIDERS = [
 { id: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-chat', hint: 'DeepSeek-V3.1 ·128K上下文' },
 { id: 'minimax', label: 'MiniMax', defaultModel: 'MiniMax-M3', hint: 'MiniMax 最新 M3 · 中文优化' },
 { id: 'glm', label: 'GLM (智谱)', defaultModel: 'glm-4.6', hint: 'z.ai · 编程套餐用量监控' },
];

export const DEFAULT_BASE_URL = {
 deepseek: 'https://api.deepseek.com',
 minimax: 'https://api.minimaxi.com/v1',
 glm: 'https://api.z.ai/api/paas/v4',
};

function findProvider(id) {
 return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}

function buildConfigPayload(providerId, model, baseUrl) {
 const prov = findProvider(providerId);
 return {
 provider: providerId,
 cloud: {
 providerId,
 model: model || prov.defaultModel,
 baseUrl: baseUrl || undefined,
 },
 };
}

function getSaveStatusMeta(saveStatus) {
 if (typeof saveStatus === 'object' && saveStatus && saveStatus.error) {
 return { text: saveStatus.error, tone: 'error', icon: 'x' };
 }
 switch (saveStatus) {
 case 'saving':
 return { text: '保存中...', tone: 'info' };
 case 'saved':
 return { text: '配置已保存', tone: 'success', icon: 'check' };
 case 'saving-key':
 return { text: '正在写入 Keychain...', tone: 'info' };
 case 'key-saved':
 return { text: 'key 已存储，配置已同步', tone: 'success', icon: 'check' };
 case 'clearing-key':
 return { text: '正在清空 key...', tone: 'info' };
 case 'key-cleared':
 return { text: 'key 已清空', tone: 'success', icon: 'check' };
 case 'testing':
 return { text: '测试连接中...', tone: 'info' };
 case 'test-ok':
 return { text: '测试通过', tone: 'success', icon: 'check' };
 default:
 return null;
 }
}

/**
 *共享 AI config 表单.
 *
 * Props:
 * - onSaved?: () => void 保存成功后回调 (drawer 用: 关 config mode +跑 rerun)
 * - onCancel?: () => void取消回调 (drawer 用: 关 config mode 回列表 view)
 * - compact?: boolean true 时去掉 backfill按钮 /简化文案 (drawer 用)
 */
export function AIConfigForm({ onSaved, onCancel, compact = false }) {
 const cfg = aiSessionsConfig.value;

 const initialProviderId =
 (cfg && cfg.cloud && cfg.cloud.providerId)
 || (cfg && cfg.provider && PROVIDERS.some(p => p.id === cfg.provider) ? cfg.provider : null)
 || 'deepseek';
 const [cloudProviderId, setCloudProviderId] = useState(initialProviderId);
 const [cloudModel, setCloudModel] = useState(
 (cfg && cfg.cloud && cfg.cloud.model) || findProvider(initialProviderId).defaultModel,
 );
 const [cloudBaseUrl, setCloudBaseUrl] = useState(
 (cfg && cfg.cloud && cfg.cloud.baseUrl) || DEFAULT_BASE_URL[initialProviderId] || '',
 );
 const [assistantFastModel, setAssistantFastModel] = useState(
 (cfg && typeof cfg.assistantFastModel === 'string' && cfg.assistantFastModel) || '',
 );
 const [assistantLlmHistorySummary, setAssistantLlmHistorySummary] = useState(
 cfg?.assistantLlmHistorySummary !== false,
 );
 const [assistantModelPresetsText, setAssistantModelPresetsText] = useState(
 formatModelPresetsText(cfg?.assistantModelPresets),
 );
 const [keyInput, setKeyInput] = useState('');
 const [saveStatus, setSaveStatus] = useState(null);
 // v2.83: 密钥库引用 — 下拉选一条已存的 key, 主进程解密直写 Keychain, 明文不经过界面
 const [vaultOptions, setVaultOptions] = useState([]);
 const [vaultPick, setVaultPick] = useState('');
 const [vaultBusy, setVaultBusy] = useState(false);

 // mount 时拉一次 keyStatus (modal复用也会调; drawer 用也安全 — 已 cached)
 useEffect(() => {
 probeAIKeyStatuses();
 api.vaultList?.().then((r) => {
 if (r && r.ok) setVaultOptions(r.entries || []);
 }).catch(() => {});
 }, []);

 //外部 cfg变化 (e.g.另一个 settings同步了),重置表单
 useEffect(() => {
 if (cfg) {
 if (cfg.cloud) {
 const pid = cfg.cloud.providerId;
 if (pid && PROVIDERS.some(p => p.id === pid)) {
 setCloudProviderId(pid);
 setCloudModel(cfg.cloud.model || findProvider(pid).defaultModel);
 setCloudBaseUrl(cfg.cloud.baseUrl || DEFAULT_BASE_URL[pid] || '');
 }
 if (typeof cfg.assistantFastModel === 'string') {
 setAssistantFastModel(cfg.assistantFastModel);
 }
 setAssistantLlmHistorySummary(cfg.assistantLlmHistorySummary !== false);
 if (Array.isArray(cfg.assistantModelPresets)) {
 setAssistantModelPresetsText(formatModelPresetsText(cfg.assistantModelPresets));
 }
 }
 }
 }, [cfg]);

 async function persistCloudConfig() {
 const next: Record<string, unknown> = {
 ...(cfg && typeof cfg === 'object' ? cfg : {}),
 ...buildConfigPayload(cloudProviderId, cloudModel, cloudBaseUrl),
 };
 const trimmedFast = (assistantFastModel || '').trim();
 if (trimmedFast) next.assistantFastModel = trimmedFast;
 else delete next.assistantFastModel;
 if (assistantLlmHistorySummary) delete next.assistantLlmHistorySummary;
 else next.assistantLlmHistorySummary = false;
 const presets = parseModelPresetsText(assistantModelPresetsText);
 if (presets.length > 0) next.assistantModelPresets = presets;
 else delete next.assistantModelPresets;
 return saveAISessionsConfig(next as any);
 }

 async function handleSaveKey() {
 if (!keyInput || !cloudProviderId) return;
 setSaveStatus('saving-key');
 const r = await setAIKey(cloudProviderId, keyInput);
 if (!r.ok) {
 setSaveStatus({ error: r.reason || 'threw' });
 return;
 }
 setKeyInput('');
 const cfgR = await persistCloudConfig();
 if (!cfgR.ok) {
 setSaveStatus({ error: cfgR.reason || 'config_save_failed' });
 return;
 }
 setSaveStatus('key-saved');
 if (typeof onSaved === 'function') onSaved(cfgR.config);
 }

 async function handleClearKey() {
 if (!cloudProviderId) return;
 setSaveStatus('clearing-key');
 const r = await clearAIKey(cloudProviderId);
 setSaveStatus(r.ok ? 'key-cleared' : { error: 'threw' });
 }

 async function handleUseVaultKey() {
 if (!vaultPick || !cloudProviderId || vaultBusy) return;
 setVaultBusy(true);
 const r = await aiUseVaultKey(cloudProviderId, vaultPick);
 setVaultBusy(false);
 if (r && r.ok) {
 setVaultPick('');
 setKeyInput('');
 setSaveStatus('key-saved');
 showToast('已从密钥库导入 key 到 Keychain', 'success', 2400);
 } else {
 showToast(r && r.reason === 'vault_entry_unreadable'
 ? '密钥库条目读取失败'
 : '从密钥库导入失败', 'error', 3000);
 }
 }

 async function handleTestConnection() {
 setSaveStatus('testing');
 const opts = {
 providerId: cloudProviderId,
 model: cloudModel || findProvider(cloudProviderId).defaultModel,
 apiKey: keyInput || undefined,
 baseUrl: cloudBaseUrl || DEFAULT_BASE_URL[cloudProviderId],
 };
 const r = await runAIHealthcheck(opts);
 setSaveStatus(r.ok ? 'test-ok' : { error: r.error || 'threw' });
 }

 async function handleSaveConfig() {
 setSaveStatus('saving');
 const r = await persistCloudConfig();
 if (r.ok) {
 setSaveStatus('saved');
 if (typeof onSaved === 'function') onSaved(r.config);
 } else {
 setSaveStatus({ error: r.reason || 'threw' });
 }
 }

 const prov = findProvider(cloudProviderId);
 const keyStatus = aiKeyStatus.value[cloudProviderId] || { hasKey: false, available: false };
 const busy = aiHealthcheckBusy.value;
 const lastTest = aiHealthcheckResult.value;
 const statusMeta = getSaveStatusMeta(saveStatus);
 const providerDescriptor = cloudProviderId === 'deepseek' ? '推理稳定，适合通用总结' : '中文表现更强，适合高频日更';
 const keyStatusText = keyStatus.available
 ? (keyStatus.hasKey ? { icon: 'check', text: `${cloudProviderId} 已存 key` } : { text: `${cloudProviderId} 尚未存 key` })
 : 'safeStorage 不可用，可临时改用环境变量';
 const presetMismatch = partitionModelPresetsByProvider(
  parseModelPresetsText(assistantModelPresetsText),
  cloudProviderId,
 ).mismatched;

 return (
 <div class="ai-config-form">
 <header class="ai-config-form__hero">
  <div>
   <span class="ai-config-form__eyebrow">AI 工作台</span>
   <h2>连接你的模型服务</h2>
   <p>选择 Provider，保存密钥，然后用一次轻量请求确认连接。</p>
  </div>
  <div class={`ai-config-form__health ${keyStatus.hasKey ? 'is-ready' : ''}`}>
   <span class="ai-config-form__health-dot" />
   {keyStatus.hasKey ? '密钥已就绪' : '需要 API Key'}
  </div>
 </header>

 {/* ── Provider 段 ── */}
 <section class="settings-card ai-config-form__provider-card">
 <div class="settings-card__heading">
 <div>
  <h3 class="settings-card__title">选择 Provider</h3>
 <p class="settings-card__intro">
先确定模型提供方，下面的默认参数会自动同步。当前方案偏向 {providerDescriptor}。
 </p>
 </div>
 <span class="settings-ai-badge settings-ai-badge--ready">当前 · {prov.label}</span>
 </div>
 <ul class="settings-list settings-list--radiogroup" role="radiogroup" aria-label="AI Provider 选择">
 {PROVIDERS.map((p) => {
 const selected = cloudProviderId === p.id;
 return (
 <li
 key={p.id}
 class={`settings-list__row ${selected ? 'is-selected' : ''}`}
 >
 <button
 type="button"
 role="radio"
 aria-checked={selected}
 class="settings-list__row-btn"
 onClick={() => {
 setCloudProviderId(p.id);
 setCloudModel(p.defaultModel);
 setCloudBaseUrl(DEFAULT_BASE_URL[p.id] || '');
 }}
 >
 <span class="settings-list__row-main">
 <span class="settings-list__row-name">{p.label}</span>
 <span class="settings-list__row-hint">{p.hint}</span>
 </span>
 <span class={`settings-list__radio ${selected ? 'is-checked' : ''}`} aria-hidden="true" />
 </button>
 </li>
 );
 })}
 </ul>
 </section>

 {/* ── 连接参数段 ── */}
 <section class="settings-card ai-config-form__connection-card">
 <div class="settings-card__heading">
 <div>
 <h3 class="settings-card__title">连接参数</h3>
 <p class="settings-card__intro">
 保留自动填好的默认值即可，只有自建代理时才需要改 Base URL。
 </p>
 </div>
 <span class="ai-config-form__provider-label">{prov.label}</span>
 </div>
 <div class="ai-settings-field-grid">
 <div class="settings-row">
 <div class="settings-row__label-block">
 <label class="settings-row__label">Model</label>
 <span class="settings-row__hint">建议先用默认模型，确认可用后再细调。</span>
 </div>
 <input
 class="settings-input"
 type="text"
 value={cloudModel}
 onInput={(e) => setCloudModel(e.currentTarget.value)}
 placeholder={prov.defaultModel}
 />
 </div>
 <div class="settings-row">
 <div class="settings-row__label-block">
 <label class="settings-row__label">Base URL (可选)</label>
 <span class="settings-row__hint">留空使用官方地址，末尾的 /v1 会自动兼容。</span>
 </div>
 <input
 class="settings-input"
 type="text"
 value={cloudBaseUrl}
 onInput={(e) => setCloudBaseUrl(e.currentTarget.value)}
 placeholder={DEFAULT_BASE_URL[cloudProviderId] || 'https://...'}
 />
 </div>
 <div class="settings-row">
 <div class="settings-row__label-block">
 <label class="settings-row__label">助手轻量模型 (可选)</label>
 <span class="settings-row__hint">简单问答路由用；留空则用内置默认（如 gpt-4o-mini）。</span>
 </div>
 <input
 class="settings-input"
 type="text"
 value={assistantFastModel}
 onInput={(e) => setAssistantFastModel(e.currentTarget.value)}
 placeholder="留空使用内置默认"
 />
 </div>
 <div class="settings-row">
 <div class="settings-row__label-block">
 <label class="settings-row__label">长会话 LLM 摘要</label>
 <span class="settings-row__hint">超过 18 条消息时，用轻量模型压缩更早历史（有少量 token 消耗）。</span>
 </div>
 <label class="settings-row__checkbox">
 <input
 type="checkbox"
 checked={assistantLlmHistorySummary}
 onChange={(e) => setAssistantLlmHistorySummary((e.target as HTMLInputElement).checked)}
 />
 启用
 </label>
 </div>
 <div class="settings-row settings-row--stack">
 <div class="settings-row__label-block">
 <label class="settings-row__label">助手模型候选 (可选)</label>
 <span class="settings-row__hint">每行一个模型 ID，用于助手抽屉自定义模型输入补全。</span>
 </div>
 <textarea
 class="settings-input settings-input--block"
 rows={3}
 value={assistantModelPresetsText}
 onInput={(e) => setAssistantModelPresetsText(e.currentTarget.value)}
 placeholder="gpt-4o-mini&#10;deepseek-chat"
 />
 {presetMismatch.length > 0 && (
 <span class="settings-row__hint settings-row__hint--warn">
 以下候选可能不属于当前 Provider（{prov.label}）：{presetMismatch.join('、')}
 </span>
 )}
 </div>
 </div>
 </section>

 {/* ── API Key 段 ── */}
 <section class="settings-card ai-config-form__key-card">
 <div class="settings-card__heading">
 <div>
 <h3 class="settings-card__title">
 API Key
 <span class={`settings-ai-badge ${keyStatus.hasKey ? 'settings-ai-badge--ready' : 'settings-ai-badge--missing'}`}>
 {typeof keyStatusText === 'string'
 ? keyStatusText
 : keyStatusText.text}
 </span>
 </h3>
 <p class="settings-card__intro">
 密钥只写入系统 Keychain，不会明文保存在配置文件里。
 {keyStatus.available
 ? '修改 key 后可以直接点"测试连接"验证，再保存最终配置。'
 : '当前系统不支持 safeStorage，可改用环境变量提供 key。'}
 </p>
 </div>
 </div>
 <div class="ai-settings-key-input">
 <label class="settings-row__label" for="ai-api-key-input">新 Key</label>
 <input
 id="ai-api-key-input"
 class="settings-input settings-input--block"
 type="password"
 value={keyInput}
 onInput={(e) => setKeyInput(e.currentTarget.value)}
 placeholder={keyStatus.hasKey ? '(已存储，输入新值替换)' : 'sk-...'}
 autocomplete="off"
 spellcheck={false}
 />
 </div>
 <div class="ai-settings-key-actions">
 <button
 type="button"
 class="settings-btn settings-btn--primary"
 onClick={handleSaveKey}
 disabled={!keyInput || busy}
 title="把当前输入的 key 存到 OS keychain"
 >
 保存 key
 </button>
 <button
 type="button"
 class="settings-btn settings-btn--danger-ghost"
 onClick={handleClearKey}
 disabled={!keyStatus.hasKey || busy}
 title="从 OS keychain 删除已存的 key"
 >
 清空
 </button>
 </div>
 {vaultOptions.length > 0 ? (
 <div class="ai-settings-key-actions ai-settings-key-vault">
 <select
 class="settings-input"
 value={vaultPick}
 onChange={(e) => setVaultPick(e.currentTarget.value)}
 disabled={vaultBusy || busy}
 title="从密钥库选一条已保存的 key, 主进程解密后直接写入 Keychain"
 >
 <option value="">从密钥库导入…</option>
 {vaultOptions.map((o) => (
 <option key={o.id} value={o.id}>{o.name}</option>
 ))}
 </select>
 <button
 type="button"
 class="settings-btn"
 onClick={handleUseVaultKey}
 disabled={!vaultPick || vaultBusy || busy}
 title="引用所选密钥库条目作为当前 Provider 的 key"
 >
 {vaultBusy ? '导入中…' : '导入'}
 </button>
 </div>
 ) : null}
 </section>

 {/* ── 验证连接段 ── */}
 <section class="settings-card ai-config-form__test-card">
 <div>
 <h3 class="settings-card__title">验证连接</h3>
 <p class="settings-card__intro">
 保存前先测试连接，确认 key 和模型可用。用当前 Provider + Model + API Key 发一次轻量请求。
 </p>
 </div>
 <div class="ai-settings-test">
 <button
 type="button"
 class="settings-btn settings-btn--primary"
 onClick={handleTestConnection}
 disabled={busy}
 >
 {busy ? '测试中…' : '测试连接'}
 </button>
 {lastTest && (
 <span class={`ai-settings-test-result ${lastTest.ok ? 'is-ok' : 'is-fail'}`}>
 {lastTest.ok
 ? `✓ 连接正常 · ${lastTest.latencyMs || 0}ms`
 : `✗ 失败: ${lastTest.error || '未知'}`}
 </span>
 )}
 </div>
 </section>

 {/* ── 状态消息 ── */}
 {statusMeta && (
 <div class={`ai-settings-save-status ${statusMeta.tone}`}>
 {statusMeta.icon === 'check' && <IconCheck size={12} />}
 {statusMeta.icon === 'x' && <IconX size={12} />}
 <span>{statusMeta.text}</span>
 </div>
 )}

 {/* ── 底部按钮区 ── */}
 <div class="ai-config-form-actions">
 <button
 type="button"
 class="settings-btn settings-btn--ghost"
 onClick={() => {
 if (typeof onCancel === 'function') onCancel();
 }}
 >
 {compact ? '返回' : '关闭'}
 </button>
 {!compact && (
 <button
 type="button"
 class="settings-btn settings-btn--primary"
 onClick={handleSaveConfig}
 disabled={busy}
 >
 保存配置
 </button>
 )}
 </div>
 </div>
 );
}

/**
 * P15: AISettingsModal 已废弃 — AI 配置现在统一在 SettingsPage 'ai' tab.
 *       本文件保留 AIConfigForm / PROVIDERS / DEFAULT_BASE_URL 给 AISettingsScene 复用,
 *       AISettingsModal 函数已删除.
 */
