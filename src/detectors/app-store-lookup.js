/**
 * src/detectors/app-store-lookup.js
 *
 * Apple iTunes Lookup API — 返回 results[0].version
 * 例: https://itunes.apple.com/lookup?id=6737188438&country=cn
 *
 * 配置: { type: 'app_store_lookup', url: 'https://itunes.apple.com/lookup?id=...' }
 *
 * Phase 6 修复 (ima.copilot):
 *   - 默认 timeout 8000 → 15000 (iTunes lookup API 经常慢, 8s 容易 timeout)
 *   - URL 模板展开 ({arch})
 *   - results[0] 可能 version 为空 — 找第一个有 version 的
 *   - trim 引号 (iTunes 偶尔返回 "2.1.0" 带引号)
 */

const { Detector, DetectorResult } = require('./base');
const { DetectorError, REASONS } = require('./errors');
const { expandUrl } = require('./url-template');

class AppStoreLookupDetector extends Detector {
  static name = 'app_store_lookup';

  constructor(opts = {}) {
    // iTunes API 经常慢, 提到 15s; 仍允许 per-detector 配置覆盖
    super({ timeout: opts.timeout ?? 15000 });
    this.url = opts.url || '';
  }

  async detect(ctx) {
    const rawUrl = this.url || ctx.url;
    if (!rawUrl) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: 'no url configured',
      });
    }
    const url = expandUrl(rawUrl, ctx.arch);

    const r = await ctx.http.get(url, { timeout: ctx.timeout || this.timeout });
    if (r.error === 'timeout') {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.TIMEOUT, note: url });
    }
    if (r.error === 'network') {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.NETWORK, note: url });
    }
    if (r.status >= 400 && r.status < 500) {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.HTTP_4XX, httpStatus: r.status, raw: truncate(r.body), note: url });
    }
    if (r.status >= 500) {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.HTTP_5XX, httpStatus: r.status, raw: truncate(r.body), note: url });
    }

    let data;
    try { data = JSON.parse(r.body); }
    catch (e) {
      throw new DetectorError({ detector: this.constructor.name, reason: REASONS.PARSE, raw: truncate(r.body), note: e.message });
    }

    const results = data && data.results;
    if (!Array.isArray(results) || results.length === 0) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: data,
        note: 'empty results',
      });
    }
    // Phase 6: results[0].version 可能为空 — 找第一个有 version 的
    let ver = null;
    let pickedIdx = -1;
    for (let i = 0; i < results.length; i++) {
      const v = cleanVersion(results[i].version);
      if (v) { ver = v; pickedIdx = i; break; }
    }
    if (!ver) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: results[0],
        note: 'version field empty in all results',
      });
    }

    return new DetectorResult({
      version: ver,
      raw: data,
      source: this.constructor.name,
      confidence: 'high',
      note: `app store lookup (results[${pickedIdx}].version)`,
      // Phase 21: iTunes lookup 响应里 results[i].releaseNotes 字段 (HTML 格式).
      // 不是所有 app 都有 (Apple 端维护的少数), 但腾讯/微信/抖音系 通常有.
      changelog: pickReleaseNotes(results[pickedIdx]),
      changelog_format: 'html',
      // Phase 22: trackId 给 Bulk Upgrade 用 (macappstore:// 深链)
      track_id: pickTrackId(results[pickedIdx]),
    });
  }
}

function pickReleaseNotes(item) {
  if (!item || typeof item !== 'object') return '';
  const notes = item.releaseNotes;
  return typeof notes === 'string' ? notes.trim() : '';
}

/**
 * Phase 22: 从 results[pickedIdx] 拿 trackId (number), 给 Bulk Upgrade 拼
 *   macappstore://apps.apple.com/app/id<trackId> 用.
 * 没有 / 不是 number → 0 (bulk-upgrade-actions 会当 missing 处理).
 */
function pickTrackId(item) {
  if (!item || typeof item !== 'object') return 0;
  const t = item.trackId;
  if (typeof t === 'number' && Number.isFinite(t) && t > 0) return t;
  if (typeof t === 'string' && /^\d+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

function cleanVersion(ver) {
  if (!ver || typeof ver !== 'string') return null;
  let v = ver.trim();
  // 去前后引号 (iTunes 偶尔带)
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (v.startsWith('v') || v.startsWith('V')) v = v.slice(1);
  return v || null;
}

function truncate(s, n = 4096) {
  if (!s) return null;
  return s.length > n ? s.slice(0, n) + '…' : s;
}

module.exports = { AppStoreLookupDetector };
