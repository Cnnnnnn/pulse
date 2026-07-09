/**
 * src/renderer/components/AISettingsScene.jsx
 *
 * P16: AI 设置分类切换 — 改用 SubtabList (与 settings-subtab 同形态),
 *      弃用 TabList variant="config" (依赖的 ai-config-tabs CSS 已删除).
 */
import { useState } from 'preact/hooks';
import { AIConfigForm } from './AISettingsModal.jsx';
import { PromptSettings } from './PromptSettings.jsx';
import { SubtabList } from './SubtabList.jsx';

const AI_TABS = [
  { key: 'connection', label: '连接设置' },
  { key: 'prompts', label: 'Prompt 模板' },
];

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
      <SubtabList
        prefix="settings"
        tabs={AI_TABS}
        activeKey={tab}
        onChange={setTab}
        ariaLabel="AI 设置分类"
      />
      {tab === 'connection' ? (
        <AIConfigForm compact={compact} onSaved={onSaved} onCancel={onCancel} />
      ) : (
        <PromptSettings />
      )}
    </div>
  );
}
