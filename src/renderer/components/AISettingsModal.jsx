/**
 * src/renderer/components/AISettingsModal.jsx
 *
 * Phase B6c.3 (AI Sessions Daily Digest): AI Sessions Settings弹窗.
 *
 *功能:
 * -启用 toggle (Settings 总开关)
 * - Provider select (ollama / openai / anthropic / deepseek / minimax)
 * - Provider-specific config:
 * - ollama: host + model
 * - cloud: providerId + model + baseUrl(可选)
 * - API key 输入框 (仅 cloud)—只写不显示, key从safeStorage
 * - '测试连接'按钮 →跑 healthcheck, 显示 ok/error/latency
 * - '保存'按钮 →写state.json ai_sessions_config
 *
 *受控:props接收 open + onClose,内部用 useState 管表单字段 (避免改 signal 的雪崩重渲染)
 *外部 store signal (aiSessionsConfig) 是 source of truth, mount 时拉一次.
 */

import { useState, useEffect } from 'preact/hooks';
import {
 aiSessionsConfig,
 aiKeyStatus,
 aiHealthcheckBusy,
 aiHealthcheckResult,
 aiSettingsOpen,
 backfillProgress,
 probeAIKeyStatuses,
 setAIKey,
 clearAIKey,
 runAIHealthcheck,
 saveAISessionsConfig,
 openAISettings,
 loadAISessionsConfig,
 triggerBackfill,
} from '../store.js';

const PROVIDERS = [
 { id: 'ollama', label: 'Ollama (本地)', needsKey: false, defaultModel: 'qwen3.5:9b' },
 { id: 'openai', label: 'OpenAI', needsKey: true, defaultModel: 'gpt-4o-mini' },
 { id: 'anthropic', label: 'Anthropic', needsKey: true, defaultModel: 'claude-sonnet-4-5' },
 { id: 'deepseek', label: 'DeepSeek', needsKey: true, defaultModel: 'deepseek-chat' },
 { id: 'minimax', label: 'MiniMax', needsKey: true, defaultModel: 'MiniMax-ABAB6.5s' },
];

const DEFAULT_BASE_URL = {
 openai: 'https://api.openai.com',
 anthropic: 'https://api.anthropic.com',
 deepseek: 'https://api.deepseek.com',
 minimax: 'https://api.minimax.chat',
};

function findProvider(id) {
 return PROVIDERS.find((p) => p.id === id) || null;
}

export function AISettingsModal() {
 if (!aiSettingsOpen.value) return null;
 const cfg = aiSessionsConfig.value;

 // 表单局部 state (避免 store频繁重渲染). mount 时从 cfg seed.
 const [enabled, setEnabled] = useState(Boolean(cfg && cfg.enabled));
 const [provider, setProvider] = useState((cfg && cfg.provider) || 'ollama');
 const [ollamaHost, setOllamaHost] = useState((cfg && cfg.ollama && cfg.ollama.host) || 'http://localhost:11434');
 const [ollamaModel, setOllamaModel] = useState((cfg && cfg.ollama && cfg.ollama.model) || 'qwen3.5:9b');
 const [cloudProviderId, setCloudProviderId] = useState(
 (cfg && cfg.cloud && cfg.cloud.providerId)
 || (provider !== 'ollama' ? provider : 'openai')
 );
 const [cloudModel, setCloudModel] = useState(
 (cfg && cfg.cloud && cfg.cloud.model) || ''
 );
 const [cloudBaseUrl, setCloudBaseUrl] = useState(
 (cfg && cfg.cloud && cfg.cloud.baseUrl) || ''
 );
 // API key 输入 (本地 state, 不入 store; 保存时调 setAIKey)
 const [keyInput, setKeyInput] = useState('');
 const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | {error}

 // modal open 时拉一次 keyStatus (避免每次输入都重拉)
 useEffect(() => {
 probeAIKeyStatuses();
 }, []);

 // 当 store里的 cfg变化 (外部 save推过来),重置本地表单
 useEffect(() => {
 if (cfg) {
 setEnabled(Boolean(cfg.enabled));
 setProvider(cfg.provider || 'ollama');
 if (cfg.ollama) {
 setOllamaHost(cfg.ollama.host || 'http://localhost:11434');
 setOllamaModel(cfg.ollama.model || 'qwen3.5:9b');
 }
 if (cfg.cloud) {
 setCloudProviderId(cfg.cloud.providerId || 'openai');
 setCloudModel(cfg.cloud.model || '');
 setCloudBaseUrl(cfg.cloud.baseUrl || '');
 }
 }
 }, [cfg]);

 function handleClose() {
 openAISettings(false);
 setKeyInput('');
 setSaveStatus(null);
 }

 async function handleSaveKey() {
 if (!keyInput || !cloudProviderId) return;
 setSaveStatus('saving-key');
 const r = await setAIKey(cloudProviderId, keyInput);
 setSaveStatus(r.ok ? 'key-saved' : { error: r.reason || 'threw' });
 if (r.ok) setKeyInput(''); //清输入框 (key已存, 不留plaintext)
 }

 async function handleClearKey() {
 if (!cloudProviderId) return;
 setSaveStatus('clearing-key');
 const r = await clearAIKey(cloudProviderId);
 setSaveStatus(r.ok ? 'key-cleared' : { error: 'threw' });
 }

 async function handleTestConnection() {
 const isCloud = provider !== 'ollama';
 setSaveStatus('testing');
 const opts = isCloud
 ? {
 providerId: cloudProviderId,
 model: cloudModel || findProvider(cloudProviderId).defaultModel,
 apiKey: keyInput || undefined, //优先用未保存的输入
 baseUrl: cloudBaseUrl || DEFAULT_BASE_URL[cloudProviderId],
 }
      : { providerId: 'ollama', host: ollamaHost, model: ollamaModel };
 const r = await runAIHealthcheck(opts);
 setSaveStatus(r.ok ? 'test-ok' : { error: r.error || 'threw' });
 }

 async function handleSaveConfig() {
 setSaveStatus('saving');
 const next = {
 enabled,
 provider,
 ollama: { host: ollamaHost, model: ollamaModel },
 cloud: provider !== 'ollama'
 ? {
 providerId: cloudProviderId,
 model: cloudModel || findProvider(cloudProviderId).defaultModel,
 baseUrl: cloudBaseUrl || undefined,
 }
 : null,
 };
 const r = await saveAISessionsConfig(next);
 setSaveStatus(r.ok ? 'saved' : { error: r.reason || 'threw' });
 }

 async function handleBackfill() {
 setSaveStatus('backfilling');
 const r = await triggerBackfill(7);
 if (r.ok) setSaveStatus('backfill-ok');
 else setSaveStatus({ error: r.reason || 'threw' });
 }

 const prov = findProvider(provider);
 const isCloud = provider !== 'ollama';
 const keyStatus = aiKeyStatus.value[isCloud ? cloudProviderId : provider] || { hasKey: false, available: false };
 const busy = aiHealthcheckBusy.value;
 const lastTest = aiHealthcheckResult.value;

 return (
 <div class="modal-backdrop" onClick={handleClose}>
 <div class="modal-card ai-settings-modal" onClick={(e) => e.stopPropagation()}>
 <div class="modal-header">
 <h2>AI总结 设置</h2>
 <button class="btn-close" onClick={handleClose} title="关闭" aria-label="关闭">×</button>
 </div>

 <div class="modal-body">
 {/*启用 toggle */}
 <div class="ai-settings-row">
 <label class="ai-settings-toggle">
 <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} />
 <span>启用 AI每日总结</span>
 </label>
 <small class="ai-settings-hint">
启用后,每日生成昨日 AI编程会话总结 (banner 显示).opt-in,不影响其他功能。
 </small>
 </div>

 {/* Provider 选择 */}
 <div class="ai-settings-row">
 <label class="ai-settings-label">Provider</label>
 <select value={provider} onChange={(e) => setProvider(e.currentTarget.value)} disabled={!enabled}>
 {PROVIDERS.map((p) => (
 <option key={p.id} value={p.id}>{p.label}</option>
 ))}
 </select>
 </div>

 {/* Ollama 配置 */}
 {provider === 'ollama' && (
 <>
 <div class="ai-settings-row">
 <label class="ai-settings-label">Ollama host</label>
 <input
 type="text"
 value={ollamaHost}
 onInput={(e) => setOllamaHost(e.currentTarget.value)}
 placeholder="http://localhost:11434"
 disabled={!enabled}
 />
 </div>
 <div class="ai-settings-row">
 <label class="ai-settings-label">Model</label>
 <input
 type="text"
 value={ollamaModel}
 onInput={(e) => setOllamaModel(e.currentTarget.value)}
 placeholder="qwen3.5:9b"
 disabled={!enabled}
 />
 </div>
 </>
 )}

 {/* Cloud 配置 */}
 {isCloud && (
 <>
 <div class="ai-settings-row">
 <label class="ai-settings-label">Cloud provider</label>
 <select
 value={cloudProviderId}
 onChange={(e) => {
 setCloudProviderId(e.currentTarget.value);
 setCloudModel(findProvider(e.currentTarget.value).defaultModel);
 }}
 disabled={!enabled}
 >
 {PROVIDERS.filter((p) => p.id !== 'ollama').map((p) => (
 <option key={p.id} value={p.id}>{p.label}</option>
 ))}
 </select>
 </div>
 <div class="ai-settings-row">
 <label class="ai-settings-label">Model</label>
 <input
 type="text"
 value={cloudModel}
 onInput={(e) => setCloudModel(e.currentTarget.value)}
 placeholder={findProvider(cloudProviderId).defaultModel}
 disabled={!enabled}
 />
 </div>
 <div class="ai-settings-row">
 <label class="ai-settings-label">Base URL (可选)</label>
 <input
 type="text"
 value={cloudBaseUrl}
 onInput={(e) => setCloudBaseUrl(e.currentTarget.value)}
 placeholder={DEFAULT_BASE_URL[cloudProviderId] || 'https://...'}
 disabled={!enabled}
 />
 <small class="ai-settings-hint">
留空用默认。Base URL末尾的 /v1 自动处理。
 </small>
 </div>

 {/* API key */}
 <div class="ai-settings-row ai-settings-key-row">
 <label class="ai-settings-label">API Key</label>
 <div class="ai-settings-key-controls">
 <input
 type="password"
 value={keyInput}
 onInput={(e) => setKeyInput(e.currentTarget.value)}
 placeholder={keyStatus.hasKey ? '(已存储,输入新值替换)' : 'sk-...'}
 disabled={!enabled}
 autocomplete="off"
 />
 <button
 type="button"
 class="btn btn-secondary btn-sm"
 onClick={handleSaveKey}
 disabled={!enabled || !keyInput || busy}
 title="把当前输入的 key存到 OS keychain"
 >
 保存 key
 </button>
 <button
 type="button"
 class="btn btn-ghost btn-sm"
 onClick={handleClearKey}
 disabled={!enabled || !keyStatus.hasKey || busy}
 title="从 OS keychain 删除已存的 key"
 >
 清空
 </button>
 </div>
 <small class="ai-settings-hint">
 {keyStatus.available
 ? (keyStatus.hasKey ? '✓ 已存 key' : '未存 key')
 : '⚠️ safeStorage 在此平台不可用 (Linux 无 keyring)。可临时用环境变量。'}
 </small>
 </div>
 </>
 )}

 {/* 测试连接 + 回填历史 */}
 <div class="ai-settings-row ai-settings-test-row">
 <button
 type="button"
 class="btn btn-secondary"
 onClick={handleTestConnection}
 disabled={!enabled || busy || backfillProgress.value.active}
 >
 {busy ? '测试中…' : '测试连接'}
 </button>
 <button
 type="button"
 class="btn btn-ghost"
 onClick={handleBackfill}
 disabled={!enabled || busy || backfillProgress.value.active}
 title="为最近7天生成 AI总结"
 >
 {backfillProgress.value.active
 ? `回填中 ${backfillProgress.value.done}/${backfillProgress.value.total}`
 : '回填历史7天'}
 </button>
 {lastTest && (
 <span class={`ai-settings-test-result ${lastTest.ok ? 'ok' : 'fail'}`}>
 {lastTest.ok
 ? `✓ ok (${lastTest.latencyMs ||0}ms)`
 : `✗ ${lastTest.error || '失败'}`}
 </span>
 )}
 </div>

 {/* 保存 status */}
 {saveStatus && (
 <div class="ai-settings-row">
 <span class={`ai-settings-save-status ${
 typeof saveStatus === 'string' ? saveStatus : 'error'
 }`}>
 {saveStatus === 'saving' && '保存中…'}
 {saveStatus === 'saved' && '✓ 配置已保存'}
 {saveStatus === 'saving-key' && '保存 key…'}
 {saveStatus === 'key-saved' && '✓ key 已存'}
 {saveStatus === 'clearing-key' && '清 key…'}
 {saveStatus === 'key-cleared' && '✓ key 已清'}
 {saveStatus === 'testing' && '测试连接…'}
 {saveStatus === 'test-ok' && '✓ 测试通过'}
 {saveStatus === 'backfilling' && '回填历史中 (看顶部进度)…'}
 {saveStatus === 'backfill-ok' && '✓ 回填完成'}
 {typeof saveStatus === 'object' && saveStatus.error && `✗ ${saveStatus.error}`}
 </span>
 </div>
 )}
 </div>

 <div class="modal-footer">
 <div class="modal-footer-buttons">
 <button class="btn btn-ghost" onClick={handleClose}>关闭</button>
 <button
 class="btn btn-primary"
 onClick={handleSaveConfig}
 disabled={!enabled || busy}
 >
 保存配置
 </button>
 </div>
 </div>
 </div>
 </div>
 );
}
