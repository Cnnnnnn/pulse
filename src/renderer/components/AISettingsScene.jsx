/**
 * src/renderer/components/AISettingsScene.jsx
 *
 * 共享 AI 设置区: 连接设置 + Prompt 模板 (AITasksDrawer / AISettingsModal 共用).
 */
import { useState } from 'preact/hooks';
import { AIConfigForm } from './AISettingsModal.jsx';
import { PromptSettings } from './PromptSettings.jsx';
import { TabList, Tab } from './TabList.jsx';

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
      <TabList variant="config" ariaLabel="AI 设置分类">
        <Tab variant="config" active={tab === 'connection'} onClick={() => setTab('connection')}>
          连接设置
        </Tab>
        <Tab variant="config" active={tab === 'prompts'} onClick={() => setTab('prompts')}>
          Prompt 模板
        </Tab>
      </TabList>
      {tab === 'connection' ? (
        <AIConfigForm compact={compact} onSaved={onSaved} onCancel={onCancel} />
      ) : (
        <PromptSettings />
      )}
    </div>
  );
}
