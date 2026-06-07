#!/usr/bin/env node
/**
 * scripts/record-fixtures.js
 *
 * 一次性脚本：跑 11 个 app 的真实 API 调用，把原始响应 dump 到
 * tests/fixtures/<app-slug>/<detector-type>.json。
 *
 * 跑法: `node scripts/record-fixtures.js` （项目根目录）
 * 跑一次，**不重跑**——失败也 dump（记录现状）。
 *
 * 设计原则：
 *   - 复用 src/main/http-client.js 的 HttpClient（与 detector 同款 fetch 行为）
 *   - 每个 app 触发 6+ 种检测策略（按 spec §5 配置迁移表）
 *     redirect / cursor_redirect / app_store / electron_yml / api_json / qclaw_api
 *     + sparkle_url 单独触发 sparkle_appcast
 *     + brew_cask 单独触发 brew_formulae
 *   - 单文件 > 1MB → warn 并截断 body 到 1MB（标 …truncated…）
 *   - timeout / network / 4xx / 5xx / 解析失败 → 真实 dump，error 段标 ok: false
 *   - 串行跑（避免触发风控/被 API rate limit）
 *
 * 输出 fixture 结构：
 *   {
 *     "app": "Cursor",
 *     "detector": "cursor_redirect",
 *     "url": "https://...",
 *     "request":  { "method": "HEAD", "headers": {...}, "body": null },
 *     "response": { "status": 302, "headers": {...}, "body": "..." , "finalUrl": "..." },
 *     "ok": true,
 *     "recordedAt": "2026-06-05T...",
 *     "bytes": 1234,
 *     "note": "first hop of redirect chain; cursor_redirect detector loops 5x"
 *   }
 *
 * 失败时 (timeout/network/4xx/5xx)：
 *   {
 *     ...
 *     "response": null,
 *     "error": { "type": "timeout" | "network" | "http_4xx" | "http_5xx", "message": "...", "status": 503 },
 *     "ok": false
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { HttpClient } = require('../src/main/http-client.js');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures');
const MAX_BODY_BYTES = 1024 * 1024; // 1MB
const REQUEST_TIMEOUT_MS = 10000;   // per-detector 兜底
const FOLLOW_REDIRECT = true;        // 默认跟重定向；手动 follow 的 detector 走 follow=false 自己处理

// ── 旧 web_type → 新 detector.type 映射 (spec §5) ────────────────────────
const WEB_TYPE_TO_DETECTOR = {
  redirect:        'redirect_filename',
  cursor_redirect: 'cursor_redirect',
  app_store:       'app_store_lookup',
  electron_yml:    'electron_yml',
  api_json:        'api_json',
  qclaw_api:       'qclaw_api',
  github_release:  'api_json',   // 合并到 api_json
  brew_api_json:   'brew_formulae',
};

// ── 辅助 ────────────────────────────────────────────────────────────────
function slug(name) {
  return String(name)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'app';
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function truncateBody(body) {
  if (body == null) return null;
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf-8');
  if (buf.length <= MAX_BODY_BYTES) {
    return { text: buf.toString('utf-8'), truncated: false, bytes: buf.length };
  }
  const cut = buf.slice(0, MAX_BODY_BYTES);
  return {
    text: cut.toString('utf-8') + '\n…[truncated at 1MB]…',
    truncated: true,
    bytes: buf.length,
  };
}

function writeFixture(appSlug, detectorType, payload) {
  const dir = path.join(FIXTURE_DIR, appSlug);
  ensureDir(dir);
  const file = path.join(dir, `${detectorType}.json`);
  const text = JSON.stringify(payload, null, 2);
  fs.writeFileSync(file, text, 'utf-8');
  return file;
}

function nowIso() {
  return new Date().toISOString();
}

// ── 模板 URL 替换 (与旧 checker.js 一致) ──────────────────────────────
function expandTemplateUrl(rawUrl, arch) {
  if (!rawUrl) return '';
  return rawUrl
    .replace(/\{arch\}/g, arch)
    .replace(/\{arch_short\}/g, arch === 'arm64' ? 'arm64' : 'x64');
}

function archOf() {
  // 与 detector 一致；Node 没 navigator.hardwareConcurrency 的 webequiv，process.arch 即可
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

// ── 6 种 web_type 检测策略：每个 buildDetectorRequest 给出
//    { detector, method, url, headers, body, follow }
// detector 真实使用的 HTTP 调用 ──────────────────────────────────────────────
function buildDetectorRequests(app, arch) {
  const out = [];
  const cfg = app;
  const webUrl = expandTemplateUrl(cfg.web_url, arch);
  const webType = (cfg.web_type || '').trim();

  // 1) sparkle_url 永远单独跑一次
  if (cfg.sparkle_url) {
    out.push({
      detector: 'sparkle_appcast',
      method: 'GET',
      url: cfg.sparkle_url,
      headers: { Accept: 'application/xml, text/xml, */*' },
      body: null,
      follow: true,
      note: 'sparkle appcast XML; detector parses sparkle:shortVersionString',
    });
  }

  // 2) web_type 迁移 → 触发相应 detector
  if (webType && webUrl) {
    const det = WEB_TYPE_TO_DETECTOR[webType];
    if (!det) {
      // 未知 web_type → 留个 fixture 占位
      out.push({
        detector: 'unknown',
        method: 'GET',
        url: webUrl,
        headers: {},
        body: null,
        follow: FOLLOW_REDIRECT,
        note: `unknown web_type='${webType}' — no detector mapping`,
      });
    } else if (det === 'qclaw_api') {
      // POST + body
      const systemType = arch === 'arm64' ? 'macarm' : 'mac';
      out.push({
        detector: 'qclaw_api',
        method: 'POST',
        url: webUrl,
        headers: {
          Origin: 'https://qclaw.qq.com',
          Referer: 'https://qclaw.qq.com/',
        },
        body: { from: 'web', system_type: systemType },
        follow: true,
        note: `qclaw POST body { from: 'web', system_type: '${systemType}' }`,
      });
    } else if (det === 'redirect_filename') {
      // 与 detector 实现一致：HEAD follow=false (1 跳)，再决定下一步
      // 这里只 dump 第一次 HEAD；detector 内部会自己再 HEAD
      out.push({
        detector: 'redirect_filename',
        method: 'HEAD',
        url: webUrl,
        headers: {},
        body: null,
        follow: false,
        note: 'first HEAD with follow=false; redirect_filename detector loops up to 5x',
      });
    } else if (det === 'cursor_redirect') {
      out.push({
        detector: 'cursor_redirect',
        method: 'HEAD',
        url: webUrl,
        headers: {},
        body: null,
        follow: false,
        note: 'first HEAD with follow=false; cursor_redirect detector loops up to 5x and reads /cursor/{major} from URL',
      });
    } else if (det === 'app_store_lookup') {
      out.push({
        detector: 'app_store_lookup',
        method: 'GET',
        url: webUrl,
        headers: { Accept: 'application/json' },
        body: null,
        follow: true,
        note: 'iTunes lookup API; detector reads results[0].version',
      });
    } else if (det === 'electron_yml') {
      out.push({
        detector: 'electron_yml',
        method: 'GET',
        url: webUrl,
        headers: { Accept: 'application/x-yaml, text/yaml, text/plain' },
        body: null,
        follow: true,
        note: 'electron-builder latest-mac.yml; detector parses version field',
      });
    } else if (det === 'api_json') {
      out.push({
        detector: 'api_json',
        method: 'GET',
        url: webUrl,
        headers: { Accept: 'application/json' },
        body: null,
        follow: true,
        note: 'api_json (covers web_type=api_json and github_release)',
      });
    } else {
      // 兜底
      out.push({
        detector: det,
        method: 'GET',
        url: webUrl,
        headers: {},
        body: null,
        follow: FOLLOW_REDIRECT,
        note: `detector='${det}' via default GET`,
      });
    }
  }

  // 3) brew_cask 单独跑一次
  if (cfg.brew_cask) {
    out.push({
      detector: 'brew_formulae',
      method: 'GET',
      url: `https://formulae.brew.sh/api/cask/${encodeURIComponent(cfg.brew_cask)}.json`,
      headers: { Accept: 'application/json' },
      body: null,
      follow: true,
      note: `brew formulae API for cask='${cfg.brew_cask}'`,
    });
  }

  return out;
}

// ── 跑一次单次 HTTP 调用，dump 原始响应 ───────────────────────────────────
async function recordOne(http, app, req) {
  const t0 = Date.now();
  const fixture = {
    app: app.name,
    appBundle: app.bundle || '',
    detector: req.detector,
    url: req.url,
    request: {
      method: req.method,
      headers: req.headers || {},
      body: req.body || null,
    },
    follow: req.follow,
    recordedAt: nowIso(),
    elapsedMs: null,
    ok: false,
    note: req.note || '',
  };

  let r;
  try {
    if (req.method === 'HEAD') {
      r = await http.head(req.url, { headers: req.headers, timeout: REQUEST_TIMEOUT_MS, follow: !!req.follow });
      // HEAD 通常 body 为空，只 dump status/headers/finalUrl
      fixture.response = {
        status: r.status,
        headers: r.headers || {},
        finalUrl: r.finalUrl || null,
        body: r.body || '',
      };
    } else if (req.method === 'POST') {
      r = await http.post(req.url, req.body, req.headers, { timeout: REQUEST_TIMEOUT_MS, follow: !!req.follow });
      const t = truncateBody(r.body);
      fixture.response = {
        status: r.status,
        headers: r.headers || {},
        finalUrl: r.finalUrl || req.url,
        body: t ? t.text : '',
        bodyTruncated: t ? t.truncated : false,
        bodyBytes: t ? t.bytes : 0,
      };
    } else {
      // GET
      r = await http.get(req.url, { headers: req.headers, timeout: REQUEST_TIMEOUT_MS, follow: !!req.follow });
      const t = truncateBody(r.body);
      fixture.response = {
        status: r.status,
        headers: r.headers || {},
        finalUrl: r.finalUrl || req.url,
        body: t ? t.text : '',
        bodyTruncated: t ? t.truncated : false,
        bodyBytes: t ? t.bytes : 0,
      };
    }
  } catch (err) {
    // HttpClient 一般不抛，但兜底
    fixture.response = null;
    fixture.error = { type: 'exception', message: String(err && err.message || err) };
    fixture.elapsedMs = Date.now() - t0;
    return fixture;
  }

  fixture.elapsedMs = Date.now() - t0;

  // 错误分类
  if (r.error === 'timeout') {
    fixture.error = { type: 'timeout', message: 'request timed out' };
    fixture.ok = false;
  } else if (r.error === 'network') {
    fixture.error = { type: 'network', message: 'network/DNS/TLS error' };
    fixture.ok = false;
  } else if (r.status >= 400 && r.status < 500) {
    fixture.error = { type: 'http_4xx', message: `HTTP ${r.status}`, status: r.status };
    fixture.ok = false;
  } else if (r.status >= 500) {
    fixture.error = { type: 'http_5xx', message: `HTTP ${r.status}`, status: r.status };
    fixture.ok = false;
  } else {
    fixture.ok = true;
  }
  return fixture;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌ config.json not found at ${CONFIG_PATH}`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const apps = cfg.apps || [];
  const arch = archOf();
  const http = new HttpClient({ timeout: REQUEST_TIMEOUT_MS });

  console.log(`▶ record-fixtures: ${apps.length} apps, arch=${arch}`);
  console.log(`  output: ${path.relative(ROOT, FIXTURE_DIR)}/<app>/<detector>.json`);
  console.log('');

  const summary = [];
  let totalFixtures = 0;
  let totalOk = 0;
  let totalErr = 0;

  for (const app of apps) {
    const slug = slugify(app.name);
    const requests = buildDetectorRequests(app, arch);
    const appStatus = { name: app.name, slug, fixtures: [], ok: 0, error: 0 };

    console.log(`▷ ${app.name} (${slug}) — ${requests.length} detector(s)`);

    if (requests.length === 0) {
      console.log(`  ⊘ skipped: no web_url / sparkle_url / brew_cask`);
      summary.push({ ...appStatus, skipped: true, reason: 'no detector sources configured' });
      continue;
    }

    for (const req of requests) {
      const fixture = await recordOne(http, app, req);
      const file = writeFixture(slug, req.detector, fixture);
      const sizeKb = (fs.statSync(file).size / 1024).toFixed(1);
      const status = fixture.ok ? '✓' : (fixture.error?.type === 'timeout' ? '⏱' : (fixture.error?.type === 'network' ? '⚠' : (fixture.error?.type?.startsWith('http') ? '✗' : '?')));
      const httpCode = fixture.response?.status ?? fixture.error?.status ?? '-';
      console.log(`  ${status} ${req.detector.padEnd(20)}  HTTP ${String(httpCode).padEnd(4)}  ${sizeKb}KB  ${req.url.slice(0, 70)}`);
      if (fixture.response?.bodyTruncated) {
        console.log(`    ⚠ body truncated at 1MB (raw ${fixture.response.bodyBytes} bytes)`);
      }
      appStatus.fixtures.push({ detector: req.detector, file, ok: fixture.ok });
      totalFixtures += 1;
      if (fixture.ok) totalOk += 1; else totalErr += 1;
      appStatus.ok += fixture.ok ? 1 : 0;
      appStatus.error += fixture.ok ? 0 : 1;
    }
    summary.push(appStatus);
  }

  console.log('');
  console.log('━'.repeat(60));
  console.log(`总计: ${totalFixtures} fixture 文件, ok=${totalOk}, error=${totalErr}`);
  console.log('━'.repeat(60));
  for (const s of summary) {
    if (s.skipped) {
      console.log(`  ${s.name.padEnd(14)}  skipped (no sources)`);
      continue;
    }
    const detList = s.fixtures.map(f => `${f.detector}=${f.ok ? 'ok' : 'err'}`).join(', ');
    console.log(`  ${s.name.padEnd(14)}  ${detList}`);
  }

  // 写一份机器可读的 summary，供 deliverable.md 引用
  const summaryPath = path.join(FIXTURE_DIR, '_summary.json');
  ensureDir(FIXTURE_DIR);
  fs.writeFileSync(summaryPath, JSON.stringify({
    recordedAt: nowIso(),
    arch,
    totalFixtures,
    totalOk,
    totalErr,
    apps: summary.map(s => ({
      name: s.name,
      slug: s.slug,
      ok: s.ok || 0,
      error: s.error || 0,
      skipped: !!s.skipped,
      fixtures: s.fixtures?.map(f => ({ detector: f.detector, ok: f.ok, file: path.relative(ROOT, f.file) })) || [],
    })),
  }, null, 2), 'utf-8');
  console.log(`\n✓ summary: ${path.relative(ROOT, summaryPath)}`);

  // 不强 fail 退出 (失败也 dump 了) — 让 deliverable.md 看到完整现状
}

function slugify(name) {
  return slug(name);
}

main().catch((err) => {
  console.error('❌ record-fixtures crashed:', err);
  process.exit(1);
});
