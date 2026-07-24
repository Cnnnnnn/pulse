/**
 * src/renderer/components/AISettingsScene.tsx
 *
 * P16: AI 设置分类切换 — 改用 SubtabList (与 settings-subtab 同形态),
 *      弃用 TabList variant="config" (依赖的 ai-config-tabs CSS 已删除).
 */
import { useState } from 'preact/hooks';
import { AIConfigForm } from './AISettingsModal.tsx';
import { PromptSettings } from './PromptSettings.tsx';
import { SubtabList } from './SubtabList.tsx';

const AI_TABS = [
  { key: 'connection', label: '连接设置' },
  { key: 'prompts', label: 'Prompt 模板' },
];

type AITab = 'connection' | 'prompts';

export function AISettingsScene({
  compact = false,
  initialTab = 'connection',
  onSaved,
  onCancel,
}: {
  compact?: boolean;
  initialTab?: AITab;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [tab, setTab] = useState<AITab>(initialTab);

  return (
    <div class="digest-setup-scene">
      <SubtabList
        prefix="settings"
        tabs={AI_TABS}
        activeKey={tab}
        onChange={(k) => setTab(k as AITab)}
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
