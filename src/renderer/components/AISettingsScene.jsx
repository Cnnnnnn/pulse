/**
 * src/renderer/components/AISettingsScene.jsx
 *
 * 共享 AI 设置区: 连接设置 + Prompt 模板 (AITasksDrawer / AISettingsModal 共用).
 */
import { useState } from 'preact/hooks';
import { AIConfigForm } from './AISettingsModal.jsx';
import { PromptSettings } from './PromptSettings.jsx';

/**
 * @param {object} props
 * @param {boolean} [props.compact]
 * @param {'connection'|'prompts'} [props.initialTab]
 * @param {() => void} [props.onSaved]
 * @param {() => void} [props.onCancel]
 */
export function AISettingsScene({
  compact = false,
  initialTab = 'connection',
  onSaved,
  onCancel,
}) {
  const [tab, setTab] = useState(initialTab);

  return (
    <div class="digest-setup-scene">
      <div class="ai-config-tabs" role="tablist" aria-label="AI 设置分类">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'connection'}
          class={`ai-config-tab ${tab === 'connection' ? 'active' : ''}`}
          onClick={() => setTab('connection')}
        >
          连接设置
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'prompts'}
          class={`ai-config-tab ${tab === 'prompts' ? 'active' : ''}`}
          onClick={() => setTab('prompts')}
        >
          Prompt 模板
        </button>
      </div>
      {tab === 'connection' ? (
        <AIConfigForm compact={compact} onSaved={onSaved} onCancel={onCancel} />
      ) : (
        <PromptSettings />
      )}
    </div>
  );
}
