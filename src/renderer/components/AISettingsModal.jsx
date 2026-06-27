/**
 * src/renderer/components/AISettingsModal.jsx
 *
 * Phase B7g (Drawer-Integrated Config): 配置表单不再单独 modal.
 *
 *拆出 <AIConfigForm /> —共享组件, AISettingsModal (legacy) + AIDigestDrawer 都用.
 *
 * 设计:
 * - AIConfigForm:纯表单 (provider/model/baseUrl/api-key/test/backfill/save).
 * 不管外面的容器, 受控 open=false → 自动切回 drawer列表 view.
 * - AISettingsModal: SideNav「AI 配置」入口 + 兼容 openAISettings() 调用.
 *
 * Phase B7e简化:
 * - 只支持 cloud provider (deepseek / minimax).
 * - 没有 "enabled" toggle (B7f 起 enabled 从 cfg 自动派生: 有 provider 即 enabled).
 * - 没有 ollama / openai / anthropic 分支.
 */

import { useState, useEffect } from 'preact/hooks';
import {
  aiSessionsConfig,
  aiKeyStatus,
  aiHealthcheckBusy,
  aiHealthcheckResult,
  aiSettingsOpen,
  probeAIKeyStatuses,
  setAIKey,
  clearAIKey,
  runAIHealthcheck,
  saveAISessionsConfig,
  openAISettings,
} from '../store.js';
import { DailyDigestSettings } from './DailyDigestSettings.jsx';
import { AISettingsScene } from './AISettingsScene.jsx';
import { ModalShell } from './ModalShell.jsx';
import { IconCheck, IconX } from './icons.jsx';

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
 const [keyInput, setKeyInput] = useState('');
 const [saveStatus, setSaveStatus] = useState(null);

 // mount 时拉一次 keyStatus (modal复用也会调; drawer 用也安全 — 已 cached)
 useEffect(() => {
 probeAIKeyStatuses();
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
 }
 }
 }, [cfg]);

 async function persistCloudConfig() {
 const next = buildConfigPayload(cloudProviderId, cloudModel, cloudBaseUrl);
 return saveAISessionsConfig(next);
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

 return (
 <div class="ai-config-form">
 <section class="ai-config-hero">
 <div class="ai-config-hero-icon" aria-hidden="true">
 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <path d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4z" />
 <path d="M9.5 12.5l1.8 1.8 3.2-4.3" />
 </svg>
 </div>
 <div class="ai-config-hero-copy">
 <div class="ai-config-hero-head">
 <h3 class="ai-config-hero-title">配置 AI 总结引擎</h3>
 <span class={`ai-config-provider-pill provider-${cloudProviderId}`}>{prov.label}</span>
 </div>
 <p class="ai-config-hero-desc">
 选择提供方、模型和密钥后，Pulse 会为你勾选的 AI 任务生成总结。当前方案偏向 {providerDescriptor}。
 </p>
 </div>
 </section>

 <section class="ai-config-section ai-config-section-provider">
 <div class="ai-config-section-head">
 <div>
 <h4 class="ai-config-section-title">Provider</h4>
 <p class="ai-config-section-desc">先确定模型提供方，下面的默认参数会自动同步。</p>
 </div>
 </div>
 <div class="ai-settings-provider-grid">
 {PROVIDERS.map((p) => (
 <button
 key={p.id}
 type="button"
 class={`provider-card ${cloudProviderId === p.id ? 'selected' : ''}`}
 onClick={() => {
 setCloudProviderId(p.id);
 setCloudModel(p.defaultModel);
 setCloudBaseUrl(DEFAULT_BASE_URL[p.id] || '');
 }}
 >
 <span class="provider-card-topline">
 <span class="provider-card-name">{p.label}</span>
 <span class="provider-card-tag">{p.id === 'deepseek' ? 'Balanced' : 'CN-first'}</span>
 </span>
 <span class="provider-card-hint">{p.hint}</span>
 </button>
 ))}
 </div>
 </section>

 <section class="ai-config-section ai-config-section-compact">
 <div class="ai-config-section-head">
 <div>
 <h4 class="ai-config-section-title">连接参数</h4>
 <p class="ai-config-section-desc">保留自动填好的默认值即可，只有自建代理时才需要改 Base URL。</p>
 </div>
 </div>
 <div class="ai-settings-field-grid">
 <div class="ai-settings-row">
 <label class="ai-settings-label">Model</label>
 <input
 type="text"
 value={cloudModel}
 onInput={(e) => setCloudModel(e.currentTarget.value)}
 placeholder={prov.defaultModel}
 />
 <small class="ai-settings-hint">建议先用默认模型，确认可用后再细调。</small>
 </div>
 <div class="ai-settings-row">
 <label class="ai-settings-label">Base URL (可选)</label>
 <input
 type="text"
 value={cloudBaseUrl}
 onInput={(e) => setCloudBaseUrl(e.currentTarget.value)}
 placeholder={DEFAULT_BASE_URL[cloudProviderId] || 'https://...'}
 />
 <small class="ai-settings-hint">留空使用官方地址，末尾的 /v1 会自动兼容。</small>
 </div>
 </div>
 </section>

 <section class="ai-config-section ai-config-section-compact ai-config-key-section">
 <div class="ai-config-section-head">
 <div>
 <h4 class="ai-config-section-title">API Key</h4>
 <p class="ai-config-section-desc">密钥只写入系统 Keychain，不会明文保存在配置文件里。</p>
 </div>
 <span class={`ai-config-inline-status ${keyStatus.hasKey ? 'ok' : 'idle'}`}>
 {typeof keyStatusText === 'string'
 ? keyStatusText
 : (<>{keyStatusText.icon === 'check' && <IconCheck size={12} />} {keyStatusText.text}</>)}
 </span>
 </div>
 <div class="ai-settings-row ai-settings-key-row">
 <div class="ai-settings-key-controls">
 <input
 type="password"
 value={keyInput}
 onInput={(e) => setKeyInput(e.currentTarget.value)}
 placeholder={keyStatus.hasKey ? '(已存储，输入新值替换)' : 'sk-...'}
 autocomplete="off"
 spellcheck={false}
 />
 <button
 type="button"
 class="btn btn-primary btn-sm"
 onClick={handleSaveKey}
 disabled={!keyInput || busy}
 title="把当前输入的 key存到 OS keychain"
 >
 保存 key
 </button>
 <button
 type="button"
 class="btn btn-ghost btn-sm"
 onClick={handleClearKey}
 disabled={!keyStatus.hasKey || busy}
 title="从 OS keychain 删除已存的 key"
 >
 清空
 </button>
 </div>
 <small class="ai-settings-hint">
 {keyStatus.available
 ? '修改 key 后可以直接点“测试连接”验证，再保存最终配置。'
 : '当前系统不支持 safeStorage，可改用环境变量提供 key。'}
 </small>
 </div>
 </section>

 <section class="ai-config-section ai-config-tools">
 <div class="ai-config-section-head">
 <div>
 <h4 class="ai-config-section-title">验证连接</h4>
 <p class="ai-config-section-desc">保存前先测试连接，确认 key 和模型可用。</p>
 </div>
 </div>
 <div class="ai-settings-row ai-settings-test-row">
 <button
 type="button"
 class="btn btn-secondary"
 onClick={handleTestConnection}
 disabled={busy}
 >
 {busy ? '测试中…' : '测试连接'}
 </button>
 {lastTest && (
 <span class={`ai-settings-test-result ${lastTest.ok ? 'ok' : 'fail'}`}>
 {lastTest.ok
 ? (<><IconCheck size={12} /> 连接正常 ({lastTest.latencyMs ||0}ms)</>)
 : (<><IconX size={12} /> {lastTest.error || '失败'}</>)}
 </span>
 )}
 </div>
 </section>

{statusMeta && (
 <div class="ai-settings-row ai-settings-status-row">
 <span class={`ai-settings-save-status ${statusMeta.tone}`}>
 {statusMeta.icon === 'check' && <IconCheck size={12} />}
 {statusMeta.icon === 'x' && <IconX size={12} />}
 {' '}
 {statusMeta.text}
 </span>
 </div>
)}

 {/*底部按钮区 */}
 <div class="ai-config-form-actions">
 <button
 type="button"
 class="btn btn-ghost"
 onClick={() => {
 if (typeof onCancel === 'function') onCancel();
 }}
 >
 {compact ? '返回' : '关闭'}
 </button>
 <button
 type="button"
 class="btn btn-primary"
 onClick={handleSaveConfig}
 disabled={busy}
 >
 保存配置
 </button>
 </div>
 </div>
 );
}

/**
 * SideNav「AI 配置」弹窗 — 连接设置 + Prompt 模板 + 早报设置.
 */
export function AISettingsModal() {
 const open = aiSettingsOpen.value;

 return (
 <ModalShell
   open={open}
   onClose={() => openAISettings(false)}
   title="AI 设置"
   cardClass="ai-settings-modal"
 >
      <AISettingsScene
        onSaved={() => openAISettings(false)}
        onCancel={() => openAISettings(false)}
      />
      <DailyDigestSettings />
 </ModalShell>
  );
}
