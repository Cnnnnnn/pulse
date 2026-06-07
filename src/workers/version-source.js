/**
 * src/workers/version-source.js
 *
 * Phase 9: per-app "version_sources" 配置的 source dispatcher.
 * 给 detect-worker.js 用, 也单独 vitest 测.
 *
 * Source types:
 *   - "installed_json"  : { type, path? } 读 JSON 的 appVersion
 *   - "plist"           : {}              读 CFBundleShortVersionString
 *   - "regex_file"      : { type, path, pattern } 读文件用 regex 提取
 *
 * 全部结果再过 stripBuildNumber 兜底 (如 "2.5.3.4392" → "2.5.3").
 */

const fs = require('fs');
const { stripBuildNumber } = require('../utils/version-utils');

async function tryVersionSource(src, { bundleId, plistRaw, homeDir } = {}) {
  if (!src || typeof src !== 'object') return null;
  const HOME = homeDir || process.env.HOME || '/Users/Shared';
  try {
    switch (src.type) {
      case 'installed_json': {
        const p = expandHome(
          src.path || (bundleId ? `${HOME}/Library/Application Support/${bundleId}/installed.json` : null),
          HOME
        );
        if (!p) return null;
        const raw = await fs.promises.readFile(p, 'utf-8');
        const j = JSON.parse(raw);
        if (j && typeof j.appVersion === 'string' && j.appVersion.trim()) {
          return stripBuildNumber(j.appVersion.trim());
        }
        return null;
      }
      case 'plist': {
        if (!plistRaw) return null;
        const m = plistRaw.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
        return m ? stripBuildNumber(m[1]) : null;
      }
      case 'regex_file': {
        if (!src.path || !src.pattern) return null;
        const p = expandHome(src.path, HOME);
        const raw = await fs.promises.readFile(p, 'utf-8');
        const re = new RegExp(src.pattern);
        const m = raw.match(re);
        if (!m) return null;
        // 优先第一个 capture group, 没有 capture group 就用整段 match
        const captured = (m.length > 1 && m[1] != null) ? m[1] : m[0];
        return stripBuildNumber(captured.trim());
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function expandHome(p, HOME = process.env.HOME || '/Users/Shared') {
  if (typeof p !== 'string') return p;
  if (p.startsWith('~/')) return HOME + p.slice(1);
  return p;
}

module.exports = { tryVersionSource, expandHome };
