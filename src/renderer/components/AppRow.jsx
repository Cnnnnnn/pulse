/**
 * src/renderer/components/AppRow.jsx
 *
 * 单个 app 行 —— 局部更新的关键单元。
 *
 * v2 改进 — Per-app Phase 渲染:
 *   - 新增 getAppPhaseSignal(name) 订阅: pending / detecting / done / error
 *   - 'pending'   → 行显示灰色占位 (app 名 + "等待检测...")
 *   - 'detecting' → 行显示 spinner 动画 (app 名 + 旋转图标)
 *   - 'done'      → 正常显示检测结果
 *   - 'error'     → 显示错误态 (红点 + 错误信息)
 *   - 检查 running 时 pending/detecting 优先于旧 result (避免误导)
 *
 * 局部更新机制 (不变):
 *   1. Section 传 name[], AppRow 用 key={name} 稳定复用
 *   2. result signal + phase signal 都是 per-row, 只触发本组件重渲染
 *   3. useState (upgrading, changelogOpen, muteMenuAt) 跨渲染保留
 */

import { useState, useCallback } from 'preact/hooks';
import {
  getResultSignal,
  getAppPhaseSignal,
  isMuted,
  isCheckRunning,
  mutedApps,
  lastOpenedApps,
} from '../store.js';
import { api } from '../api.js';
import { AppAvatar } from './AppAvatar.jsx';
import { AppInfo } from './AppInfo.jsx';
import { AppVersions } from './AppVersions.jsx';
import { AppAction } from './AppAction.jsx';
import { ChangelogPanel } from './ChangelogPanel.jsx';
import { MuteMenu } from './MuteMenu.jsx';
import { SnoozeMenu } from './SnoozeMenu.jsx';
import { openVersionHistory } from '../store-version-history.js';

export function AppRow({ name }) {
  // 订阅 per-row signals (本组件的订阅点)
  const resultSig = getResultSignal(name);
  const result = resultSig.value;
  const phase = getAppPhaseSignal(name).value;

  const [upgrading, setUpgrading] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [muteMenuAt, setMuteMenuAt] = useState(null);
  const [snoozeMenuAt, setSnoozeMenuAt] = useState(null);

  const handleUpgrade = useCallback(async (cask, appName) => {
    if (!cask) return;
    setUpgrading(true);
    try {
      const r = await api.brewUpgrade(cask);
      if (r && r.success) {
        const { trackAppUpgrade } = await import('../recent/track.js');
        trackAppUpgrade(appName);
      }
      if (!r || !r.success) {
        const cfg = lookupConfig(appName);
        if (cfg && cfg.download_url) {
          api.openUrl(cfg.download_url);
        }
      }
      setTimeout(() => window.dispatchEvent(
        new CustomEvent('app-row:upgraded', { detail: { appName } })
      ), 2000);
    } catch {
      // row 仍显示原状态
    } finally {
      setUpgrading(false);
    }
  }, []);

  // ─── Phase-based 渲染 ──────────────────────────────────

  // 本轮检查 running 时优先显示 pending/detecting, 避免旧 result 误导
  const rechecking =
    isCheckRunning() && (phase === 'pending' || phase === 'detecting');

  if (!result || rechecking) {
    if (phase === 'detecting') {
      return (
        <div class="app-row app-row--detecting" data-name={name}>
          <AppAvatar bundle="" name={name} />
          <div class="app-info">
            <div class="app-name">{name}</div>
            <div class="app-status-hint">
              <span class="spinner spinner--sm"></span>
              检测中...
            </div>
          </div>
          <div class="app-versions"></div>
          <div class="app-action"></div>
        </div>
      );
    }

    if (phase === 'error') {
      return (
        <div class="app-row app-row--error" data-name={name}>
          <AppAvatar bundle="" name={name} />
          <div class="app-info">
            <div class="app-name">{name}</div>
            <div class="app-status-hint app-status-hint--error">检测失败</div>
          </div>
          <div class="app-versions"></div>
          <div class="app-action"></div>
        </div>
      );
    }

    // pending 或 idle (缓存态无结果)
    return (
      <div class="app-row app-row--pending" data-name={name}>
        <AppAvatar bundle="" name={name} />
        <div class="app-info">
          <div class="app-name">{name}</div>
          <div class="app-status-hint app-status-hint--muted">等待检测</div>
        </div>
        <div class="app-versions"></div>
        <div class="app-action"></div>
      </div>
    );
  }

  // ─── 有 result → 正常渲染检测结果 ──────────────────────

  const bundle = result.bundle || '';
  const muteEntry = mutedApps.value.get(name);
  const muted = isMuted(name);
  const lastOpenedEntry = lastOpenedApps.value.get(name);

  function onContextMenu(e) {
    if (e.target.closest('.btn-upgrade-row')
        || e.target.closest('.status-badge')
        || e.target.closest('.app-info-btn')
        || e.target.closest('.changelog-panel')
        || e.target.closest('.mute-menu')) return;
    e.preventDefault();
    setMuteMenuAt({ x: e.clientX, y: e.clientY });
  }

  // phase class 用于 CSS 区分 (error 行可加红色左边框等)
  const phaseClass = phase === 'error' ? ' app-row--error' : '';

  return (
    <div
      class={`app-row${changelogOpen ? ' changelog-open' : ''}${muted ? ' muted' : ''}${phaseClass}`}
      data-name={result.name}
      style={hasDownloadUrl(result.name) ? 'cursor: pointer' : ''}
      onClick={(e) => {
        if (e.target.closest('.btn-upgrade-row')
            || e.target.closest('.status-badge')
            || e.target.closest('.app-info-btn')
            || e.target.closest('.changelog-panel')) return;
        const cfg = lookupConfig(result.name);
        if (cfg && cfg.download_url) api.openUrl(cfg.download_url);
      }}
      onContextMenu={onContextMenu}
    >
      <AppAvatar bundle={bundle} name={result.name} />
      <AppInfo
        result={result}
        muted={muted}
        muteUntil={muteEntry ? muteEntry.until : 0}
        lastOpened={lastOpenedEntry || null}
        onShowChangelog={() => setChangelogOpen((v) => !v)}
        isChangelogOpen={changelogOpen}
      />
      <AppVersions result={result} />
      <AppAction
        result={result}
        onUpgrade={handleUpgrade}
        isUpgrading={upgrading}
      />
      {result.has_update && (
        <button
          class="row-action-snooze"
          onClick={(e) => { e.stopPropagation(); setSnoozeMenuAt({ x: e.clientX, y: e.clientY }); }}
          title="等下次再升"
        >
          ⏰
        </button>
      )}
      <button
        class="row-action-rollback"
        onClick={(e) => { e.stopPropagation(); openVersionHistory(result.name); }}
        title="查看回滚历史"
        aria-label="查看回滚历史"
      >
        ⏪
      </button>
      {changelogOpen && <ChangelogPanel result={result} />}
      {muteMenuAt && (
        <MuteMenu
          x={muteMenuAt.x}
          y={muteMenuAt.y}
          appName={name}
          isMuted={muted}
          muteUntil={muteEntry ? muteEntry.until : 0}
          lastOpened={lastOpenedEntry}
          onClose={() => setMuteMenuAt(null)}
        />
      )}
      {snoozeMenuAt && (
        <SnoozeMenu
          x={snoozeMenuAt.x}
          y={snoozeMenuAt.y}
          name={result.name}
          latestVersion={result.latest_version}
          snoozeUntil={result.snoozeUntil}
          skippedVersion={result.skippedVersion}
          onClose={() => setSnoozeMenuAt(null)}
        />
      )}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────
let _configCache = null;
function getConfig() {
  if (_configCache) return _configCache;
  return _configCache || { apps: [] };
}

export function primeConfigCache(cfg) {
  _configCache = cfg || { apps: [] };
}

function lookupConfig(appName) {
  const cfg = getConfig();
  return (cfg.apps || []).find(a => a.name === appName) || null;
}

function hasDownloadUrl(appName) {
  const cfg = lookupConfig(appName);
  return !!(cfg && cfg.download_url);
}
