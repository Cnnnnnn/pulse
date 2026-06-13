/**
 * src/renderer/components/AITasksDrawer.jsx
 *
 * 重做版 AI 任务抽屉 (取代 AIDigestBanner.jsx).
 *
 * 设计 (任务为中心、按需生成):
 *   - Header 旁入口按钮: badge = 今日任务数 (扫盘得到, 不调 LLM)
 *   - 抽屉顶部: 日期切换 (今天 / 昨天 / 前 7 天快捷 chips)
 *   - 主体: 按应用分组 (Cursor / Codex / MiniMax Code), 节头带任务数
 *   - 任务卡: 标题 / 项目 / 时间段 / 消息数 / 状态徽标 (已总结 / 未总结 / 内容已更新)
 *             + "查看原始" 跳转; 已总结的卡直接显示 用户诉求 / 处理结果
 *   - 勾选任意任务 → 底部 "生成总结 (N)"; 生成中逐卡更新 (ai-task-summary-updated 事件)
 *
 * 没有 topic 聚类、没有 preview/catalog/digest 四层 fallback、没有 LegacySummary.
 */

import { useEffect, useState } from 'preact/hooks';
import {
  digestDrawerOpen,
  openDigestDrawer,
  toggleDigestDrawer,
  digestConfigMode,
  aiSessionsEnabled,
  aiTasks,
  aiTasksDateKey,
  aiTasksLoading,
  aiTasksError,
  summarizingTaskKeys,
  aiSummarizeBusy,
  localDateKey,
  loadAiTasks,
  summarizeAiTasks,
  needsConfig,
  showToast,
} from '../store.js';
import { api } from '../api.js';
import { AIConfigForm } from './AISettingsModal.jsx';
import { taggedLog } from '../log.js';

const log = taggedLog("[tasks]");

const APP_ORDER = ['cursor', 'codex', 'minimax-code'];
const APP_LABEL = {
  'cursor':       'Cursor',
  'codex':        'Codex',
  'minimax-code': 'MiniMax Code',
};
const APP_COLOR = {
  'cursor':       '#7C3AED',
  'codex':        '#10A981',
  'minimax-code': '#F59E0B',
};

function pad(n) { return String(n).padStart(2, '0'); }

function formatHm(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '--:--';
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatHmRange(start, end) {
  if (typeof start !== 'number' || start <= 0) return '--:--';
  const s = formatHm(start);
  if (typeof end !== 'number' || end <= 0 || end < start) return s;
  const e = formatHm(end);
  return e === s ? s : `${s} – ${e}`;
}

function formatDateLabel(dateKey) {
  if (typeof dateKey !== 'string') return '';
  if (dateKey === localDateKey(0)) return '今天';
  if (dateKey === localDateKey(1)) return '昨天';
  if (dateKey === localDateKey(2)) return '前天';
  const d = new Date(dateKey + 'T00:00:00');
  if (isNaN(d.getTime())) return dateKey;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 任务按 appName 分组, 固定顺序 Cursor / Codex / MiniMax Code, 其余 app 排后.
 * @returns {Array<{appName, label, color, tasks}>}
 */
function groupTasksByApp(tasks) {
  const byApp = new Map();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t) continue;
    const app = t.appName || 'unknown';
    if (!byApp.has(app)) byApp.set(app, []);
    byApp.get(app).push(t);
  }
  const order = [...APP_ORDER, ...[...byApp.keys()].filter((a) => !APP_ORDER.includes(a))];
  const groups = [];
  for (const app of order) {
    const list = byApp.get(app);
    if (!list || list.length === 0) continue;
    groups.push({
      appName: app,
      label: APP_LABEL[app] || app,
      color: APP_COLOR[app] || '#6b7280',
      tasks: list,
    });
  }
  return groups;
}

function taskStatus(task, generating) {
  if (generating) return { id: 'generating', label: '生成中' };
  if (!task.summary) return { id: 'draft', label: '未总结' };
  if (task.summary.stale) return { id: 'stale', label: '内容已更新' };
  return { id: 'generated', label: '已总结' };
}

// ── AITasksButton (Header 旁的入口) ────────────────────────────────────
// badge = 今日任务数 (bootstrap 时 loadAiTasks() 扫一次, 不调 LLM).
export function AITasksButton() {
  const open = digestDrawerOpen.value;
  const isToday = aiTasksDateKey.value === localDateKey(0);
  const count = isToday ? aiTasks.value.length : 0;
  const enabled = aiSessionsEnabled.value;

  return (
    <button
      id="btn-ai-digest"
      class={`btn btn-ghost btn-icon ${open ? 'is-active' : ''} ${count > 0 ? 'has-content' : ''} ${!enabled ? 'needs-setup' : ''}`}
      onClick={() => toggleDigestDrawer()}
      title={count > 0 ? `今日 ${count} 个 AI 任务` : 'AI 任务总结'}
      aria-label="AI 任务总结"
      aria-expanded={open}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      {count > 0 && <span class="digest-badge">{count}</span>}
      {!enabled && count === 0 && <span class="digest-badge setup-badge" aria-hidden="true">·</span>}
    </button>
  );
}

// ── AITasksDrawer (右侧 drawer, App.jsx 顶部挂载) ─────────────────────
export function AITasksDrawer() {
  const open = digestDrawerOpen.value;
  const configMode = digestConfigMode.value;
  const dateKey = aiTasksDateKey.value;
  const tasks = aiTasks.value;
  const loading = aiTasksLoading.value;
  const error = aiTasksError.value;
  const generatingSet = summarizingTaskKeys.value;
  const busy = aiSummarizeBusy.value;

  const [selectedKeys, setSelectedKeys] = useState([]);

  // 打开抽屉 / 切日期 → 刷新当前日期的任务列表
  useEffect(() => {
    if (open && !configMode) {
      loadAiTasks(dateKey);
    }
  }, [open, dateKey, configMode]);

  // 切日期 / 数据刷新 → 清掉已不存在的勾选
  useEffect(() => {
    setSelectedKeys((prev) => {
      const available = new Set(tasks.map((t) => t.taskKey));
      return prev.filter((k) => available.has(k));
    });
  }, [dateKey, tasks]);

  const groups = groupTasksByApp(tasks);
  const selectedSet = new Set(selectedKeys);
  const summarizedCount = tasks.filter((t) => t.summary && !t.summary.stale).length;

  // 日期快捷 chips: 今天 / 昨天 / 前天 + 再往前 4 天
  const dateChips = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const key = localDateKey(offset);
    return { key, label: formatDateLabel(key) };
  });

  function switchDate(key) {
    if (loading) return; // 已在加载中, 忽略重复点击 (避免重复扫描)
    setSelectedKeys([]);
    loadAiTasks(key);
  }

  function toggleTask(taskKey) {
    setSelectedKeys((prev) => (
      prev.includes(taskKey) ? prev.filter((k) => k !== taskKey) : [...prev, taskKey]
    ));
  }

  function toggleGroup(group) {
    const keys = group.tasks.map((t) => t.taskKey);
    const allSelected = keys.every((k) => selectedSet.has(k));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return Array.from(next);
    });
  }

  async function handleGenerate(keys) {
    const target = (Array.isArray(keys) && keys.length > 0 ? keys : selectedKeys).filter(Boolean);
    if (target.length === 0 || busy) return;
    if (needsConfig()) {
      digestConfigMode.value = true;
      showToast('请先配置 AI Provider 和 API Key', 'info', 3000);
      return;
    }
    const r = await summarizeAiTasks(target);
    if (r && r.ok) {
      showToast(`已生成 ${r.results.length} 个任务总结`, 'success', 2500);
      setSelectedKeys((prev) => prev.filter((k) => !target.includes(k)));
    } else if (r && Array.isArray(r.failures) && r.failures.length > 0) {
      const okCount = Array.isArray(r.results) ? r.results.length : 0;
      showToast(`完成 ${okCount} 个, 失败 ${r.failures.length} 个: ${r.failures[0].message || ''}`, 'warn', 5000);
    } else {
      showToast('生成失败, 请检查 AI 配置后重试', 'error', 5000);
    }
  }

  return (
    <>
      {/* 遮罩 (点击关闭) */}
      <div
        class={`ai-digest-overlay ${open ? 'visible' : ''}`}
        onClick={() => openDigestDrawer(false)}
        aria-hidden="true"
      />
      {/* drawer 容器 */}
      <aside
        class={`ai-digest-drawer ${open ? 'open' : ''} ${configMode ? 'config-mode' : ''}`}
        role="dialog"
        aria-label="AI 任务总结"
        aria-hidden={!open}
      >
        <header class="drawer-header">
          <div class="drawer-title-row">
            <span class="drawer-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 5.5h8a2.5 2.5 0 0 1 2.5 2.5v11" />
                <path d="M8 9h7" />
                <path d="M8 12.5h5" />
                <path d="M15.5 15.5l2 2 3.5-4" />
              </svg>
            </span>
            <div class="drawer-title-block">
              <h2 class="drawer-title">
                {configMode ? 'AI 总结设置' : `${formatDateLabel(dateKey)}的 AI 任务`}
              </h2>
              {!configMode && tasks.length > 0 && (
                <p class="drawer-subtitle">
                  {tasks.length} 个任务 · {summarizedCount} 个已总结
                </p>
              )}
            </div>
          </div>
          <div class="drawer-actions">
            <button
              type="button"
              class="drawer-icon-btn drawer-icon-btn-rerun"
              onClick={() => loadAiTasks(dateKey)}
              disabled={loading}
              title="重新扫描任务列表"
              aria-label="重新扫描任务列表"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={loading ? 'is-spin' : ''}>
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 4v5h-5" />
              </svg>
            </button>
            <button
              type="button"
              class="drawer-icon-btn"
              onClick={() => openDigestDrawer(false)}
              title="关闭"
              aria-label="关闭"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* 生成中顶部 banner */}
        {busy && (
          <div class="ai-digest-drawer-banner" role="status" aria-live="polite">
            <span class="digest-spinner small"></span>
            <span class="banner-text">生成总结中 ({generatingSet.size} 个任务)...</span>
          </div>
        )}

        <div class="drawer-body">
          {configMode ? (
            <div class="digest-setup-scene">
              <AIConfigForm
                compact
                onSaved={() => { digestConfigMode.value = false; }}
                onCancel={() => { digestConfigMode.value = false; }}
              />
            </div>
          ) : (
            <>
              {/* 日期切换 */}
              <div class="ai-tasks-date-row" role="tablist" aria-label="日期切换">
                {dateChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    role="tab"
                    aria-selected={chip.key === dateKey}
                    class={`ai-tasks-date-chip ${chip.key === dateKey ? 'active' : ''}`}
                    onClick={() => switchDate(chip.key)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {loading && tasks.length === 0 && (
                <div class="drawer-loading">
                  <span class="digest-spinner large"></span>
                  <p>扫描 AI 任务中…</p>
                  <p class="hint">首次或跨日切换可能需要 10–30 秒</p>
                </div>
              )}

              {error && !loading && (
                <div class="drawer-empty">
                  <p>任务列表加载失败</p>
                  <p class="hint">{error}</p>
                </div>
              )}

              {!loading && !error && tasks.length === 0 && (
                <div class="drawer-empty">
                  <p>{formatDateLabel(dateKey)}没有 AI 编程任务。</p>
                  <p class="hint">用了 Cursor / Codex / MiniMax Code 之后再来看。</p>
                </div>
              )}

              {/* 按应用分组的任务列表 */}
              {groups.map((group) => {
                const groupKeys = group.tasks.map((t) => t.taskKey);
                const allSelected = groupKeys.every((k) => selectedSet.has(k));
                return (
                  <section class="ai-tasks-group" key={group.appName}>
                    <div class="ai-tasks-group-head">
                      <span class="session-app-group-pill" style={{ backgroundColor: group.color }}>
                        {group.label}
                      </span>
                      <span class="ai-tasks-group-count">{group.tasks.length} 个任务</span>
                      <button
                        type="button"
                        class="ai-tasks-group-select"
                        onClick={() => toggleGroup(group)}
                      >
                        {allSelected ? '取消全选' : '全选'}
                      </button>
                    </div>
                    <div class="ai-tasks-group-list">
                      {group.tasks.map((task) => (
                        <TaskCard
                          key={task.taskKey}
                          task={task}
                          selected={selectedSet.has(task.taskKey)}
                          generating={generatingSet.has(task.taskKey)}
                          onToggle={() => toggleTask(task.taskKey)}
                          onGenerateSingle={() => handleGenerate([task.taskKey])}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>

        {!configMode && (
          <footer class="drawer-footer">
            <span class="drawer-footer-time">
              {selectedKeys.length > 0 ? `已选 ${selectedKeys.length} 个任务` : '勾选任务后生成总结'}
            </span>
            <div class="drawer-footer-actions">
              <button
                type="button"
                class="drawer-footer-btn-primary"
                onClick={() => handleGenerate()}
                disabled={busy || selectedKeys.length === 0}
                title={selectedKeys.length > 0 ? `为 ${selectedKeys.length} 个任务生成总结` : '先勾选任务'}
              >
                {busy ? '生成中…' : `生成总结 (${selectedKeys.length})`}
              </button>
              <button
                type="button"
                class="drawer-footer-text-link"
                onClick={() => { digestConfigMode.value = true; }}
                title="修改 Provider / Model / API Key"
              >
                修改 AI 设置
              </button>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}

// ── TaskCard (单任务卡) ────────────────────────────────────────────────
function TaskCard({ task, selected, generating, onToggle, onGenerateSingle }) {
  const status = taskStatus(task, generating);
  const summary = task.summary;
  const title = (summary && summary.title) || task.title || `${formatHm(task.startedAt)} 开始的任务`;
  const hasJump = typeof task.jumpTarget === 'string' && task.jumpTarget.length > 0;

  async function handleJump(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!hasJump) return;
    const r = await api.openSession(task.jumpTarget);
    if (!r || !r.ok) {
      log.warn('openSession failed:', task.jumpTarget, r);
    }
  }

  return (
    <article
      class={`ai-task-card ${selected ? 'selected' : ''} status-${status.id}`}
      onClick={onToggle}
    >
      <label class="session-select" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
        />
        <span class="session-select-indicator" aria-hidden="true"></span>
      </label>
      <div class="ai-task-card-content">
        <div class="ai-task-card-topline">
          <span class={`ai-task-status-badge ${status.id}`}>
            {generating && <span class="digest-spinner small"></span>}
            {status.label}
          </span>
          <span class="session-selection-meta">
            <span class="session-time">{formatHmRange(task.startedAt, task.endedAt)}</span>
            <span class="session-sep">·</span>
            <span class="session-msgs">{task.msgCount || 0} msgs</span>
          </span>
        </div>
        <h3 class="ai-task-card-title">{title}</h3>
        {task.project && <p class="ai-task-card-project">项目：{task.project}</p>}
        {summary && (
          <div class="summary-result-grid">
            <div class="summary-result-block">
              <div class="summary-result-label">用户诉求</div>
              <p class="summary-result-text">{summary.userGoal || '未提取到明确诉求。'}</p>
            </div>
            <div class="summary-result-block">
              <div class="summary-result-label">处理结果</div>
              <p class="summary-result-text">{summary.outcome || '未提取到明确结果。'}</p>
            </div>
          </div>
        )}
        <div class="ai-task-card-actions">
          {hasJump && (
            <a href={task.jumpTarget} class="session-selection-jump" onClick={handleJump} title="在源 app 打开">
              查看原始 →
            </a>
          )}
          <button
            type="button"
            class="work-item-action-btn primary"
            disabled={generating}
            onClick={(e) => {
              e.stopPropagation();
              onGenerateSingle();
            }}
          >
            {summary ? (summary.stale ? '内容已更新, 重新生成' : '重新生成') : '生成总结'}
          </button>
        </div>
      </div>
    </article>
  );
}
