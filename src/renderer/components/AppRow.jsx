/**
 * src/renderer/components/AppRow.jsx
 *
 * 单个 app 行 —— 局部更新的关键单元。
 *
 * 局部更新机制：
 *   1. 父组件 (Section) 在 resultsBySection.value 变化时重新执行，
 *      但因为 section.items 是 name[] 而 AppRow 用了稳定的 key={name}，
 *      Preact 不会卸载已有 AppRow 实例。
 *   2. AppRow 内部 useState 的 [upgrading] 本地状态保留。
 *   3. AppRow 调用 getResultSignal(name) 拿到自己专属的 result signal，
 *      读 .value —— 这是订阅点。其它 row 的 result signal 变化不会触发
 *      本组件重渲染；本 signal .value 变化只触发本 row 重渲染。
 *   4. AppAvatar 内部的 useIcon 是 hook 级别的状态，缓存命中后只读不更新。
 *
 * 点击整行 → 打开 download_url (有的话)；点击升级按钮 → 走升级流。
 */

import { useState, useCallback } from 'preact/hooks';
import { getResultSignal } from '../store.js';
import { api } from '../api.js';
import { AppAvatar } from './AppAvatar.jsx';
import { AppInfo } from './AppInfo.jsx';
import { AppVersions } from './AppVersions.jsx';
import { AppAction } from './AppAction.jsx';
import { ChangelogPanel } from './ChangelogPanel.jsx';

export function AppRow({ name }) {
  const sig = getResultSignal(name);
  // 订阅: sig.value 变化时本组件重渲染
  const result = sig.value;
  const [upgrading, setUpgrading] = useState(false);
  // Phase 14: changelog inline panel 展开状态. 默认关.
  const [changelogOpen, setChangelogOpen] = useState(false);

  const handleUpgrade = useCallback(async (cask, appName) => {
    if (!cask) return;
    setUpgrading(true);
    try {
      const r = await api.brewUpgrade(cask);
      if (!r || !r.success) {
        // brew 失败 → 兜底打开 download_url
        const cfg = lookupConfig(appName);
        if (cfg && cfg.download_url) {
          api.openUrl(cfg.download_url);
        }
      }
      // 成功后 2s 内重新触发 check 让 UI 反映新版本
      // (父组件持有 triggerCheck, 这里只能 setTimeout 调一次; 实测 OK)
      setTimeout(() => window.dispatchEvent(new CustomEvent('app-row:upgraded', { detail: { appName } })), 2000);
    } catch {
      // ignore — row 仍显示原状态
    } finally {
      setUpgrading(false);
    }
  }, []);

  if (!result) {
    // 还没收到 result (理论上 Section 不会传未到的 name，但保险)
    return (
      <div class="app-row" data-name={name}>
        <div class="app-avatar" style={{ background: '#eee' }}>?</div>
        <div class="app-info"><div class="app-name">{name}</div></div>
      </div>
    );
  }

  const onRowClick = (cfg) => {
    if (cfg && cfg.download_url) api.openUrl(cfg.download_url);
  };

  // result.bundle 可能在旧 schema 不存在，缺省用空串
  const bundle = result.bundle || '';

  return (
    <div
      class={`app-row${changelogOpen ? ' changelog-open' : ''}`}
      data-name={result.name}
      style={hasDownloadUrl(result.name) ? 'cursor: pointer' : ''}
      onClick={(e) => {
        // 不拦截按钮 / badge / changelog panel 内点击
        if (e.target.closest('.btn-upgrade-row')
            || e.target.closest('.status-badge')
            || e.target.closest('.btn-info-row')
            || e.target.closest('.changelog-panel')) return;
        onRowClick(lookupConfig(result.name));
      }}
    >
      <AppAvatar bundle={bundle} name={result.name} />
      <AppInfo result={result} />
      <AppVersions result={result} />
      <AppAction
        result={result}
        onUpgrade={handleUpgrade}
        isUpgrading={upgrading}
        onShowChangelog={() => setChangelogOpen((v) => !v)}
        isChangelogOpen={changelogOpen}
      />
      {changelogOpen && <ChangelogPanel result={result} />}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────
let _configCache = null;
function getConfig() {
  if (_configCache) return _configCache;
  // 同步取 (不阻塞渲染)：bootstrap 已经 await getConfig() 完才 render
  // 这里只在用户点击时兜底读
  return _configCache || { apps: [] };
}

// 同步读取 config (供 row 点击用)。
// 真实路径下 _configCache 已经在 bootstrap 里塞好。
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
