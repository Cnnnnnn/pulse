# P2: Windows Version Detection Chain

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make version detection work on Windows — read installed versions via registry/winget/app-update.yml, fetch online latest versions via new detectors (winget_show / github_release), and filter detectors + version_sources by platform so each app's config carries both mac and win detection paths.

**Architecture:** Built on P1's platform layer. Online detection adds two new Detector classes following the existing detector-chain pattern. Installed-version detection adds three new source types to `version-source.js`. The detector chain + installed-version loop both gain a `platform` filter (skip sources/detectors tagged for the wrong platform). The Windows platform module's `resolveAppPath` + `getInstalledVersion` stubs get real implementations.

**Tech Stack:** Electron, Node.js `child_process` (reg/winget), vitest, existing detector-chain framework

**Spec:** `docs/superpowers/specs/2026-06-16-cross-platform-windows-support-design.md` §2

**Prerequisite:** P1 complete (`feat/p1-platform-abstraction` branch, tag `p1-platform-abstraction-complete`)

**Hard constraint:** macOS behavior must stay identical. The platform filter must be a no-op on macOS (mac-tagged and untagged sources all run on mac; only win-tagged sources get skipped on mac).

---

## File Structure

**Create:**
- `src/detectors/winget-show.js` — `WingetShowDetector`: runs `winget show <id> --versions` to get latest published version
- `src/detectors/github-release.js` — `GithubReleaseDetector`: fetches GitHub Releases API latest tag
- `src/workers/win-registry.js` — `queryRegistryVersion`: runs `reg query` to read `DisplayVersion` from uninstall keys
- `tests/detectors/winget-show.test.js`
- `tests/detectors/github-release.test.js`
- `tests/workers/win-registry.test.js`
- `tests/workers/version-source-platform.test.js`

**Modify:**
- `src/workers/version-source.js` — add `registry_version` / `winget_list` / `windows_app_yml` source types + platform filtering in the source loop
- `src/workers/installed-version.js` — add Windows fallback chain when version_sources empty/all-filtered; platform-filter the sources array
- `src/workers/detector-chain.js` — add `platform` to DetectContext deps; filter detectors by `platform` tag
- `src/config/schema.js` — add new detector types to `VALID_DETECTOR_TYPES`; sanitize `win_bundle` / `winget_id` / `platform` fields
- `src/platform/windows.js` — implement `resolveAppPath` (registry InstallLocation) + `getInstalledVersion` (delegate to installed-version.js with platform-aware filtering)
- `src/workers/task-handlers.js` — pass `platform` into detector chain deps
- `src/workers/detect-worker.js` — carry `platform` in workerData
- `src/main/index.js` — workerOpts add `platform`
- `src/workers/ipc.js` — export `PLATFORM` from workerData
- `config.json` — add `win_bundle` / `winget_id` + win detectors/sources to existing apps (Cursor, VS Code as first examples)

---

## Task 1: github_release detector (pure HTTP, no platform dependency)

**Files:**
- Create: `src/detectors/github-release.js`
- Test: `tests/detectors/github-release.test.js`

Start with the simplest new detector — pure HTTP, works on both platforms, no shell commands.

- [ ] **Step 1: Write the failing test**

Create `tests/detectors/github-release.test.js`:

```js
/**
 * tests/detectors/github-release.test.js
 *
 * GithubReleaseDetector — api.github.com/repos/{owner}/{repo}/releases/latest
 * 取 tag_name (去 v 前缀). 纯 HTTP, mac/win 通用.
 */
import { describe, it, expect } from 'vitest';
import { GithubReleaseDetector } from '../../src/detectors/github-release.js';
import { MockHttp, makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

describe('GithubReleaseDetector', () => {
  it('取 tag_name, 去掉 v 前缀', async () => {
    const http = new MockHttp({
      get: [
        {
          status: 200,
          body: JSON.stringify({ tag_name: 'v3.7.12', name: 'Release 3.7.12' }),
        },
      ],
    });
    const r = await new GithubReleaseDetector({
      url: 'https://api.github.com/repos/anysphere/cursor/releases/latest',
    }).detect(makeCtx({ http }));
    expect(r.version).toBe('3.7.12');
    expect(r.confidence).toBe('high');
    expect(r.source).toBe('github_release');
  });

  it('tag_name 无 v 前缀也行', async () => {
    const http = new MockHttp({
      get: [{ status: 200, body: JSON.stringify({ tag_name: '2.5.0' }) }],
    });
    const r = await new GithubReleaseDetector({ url: 'x' }).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe('2.5.0');
  });

  it('404 → HTTP_4XX', async () => {
    const http = new MockHttp({ get: [{ status: 404, body: '' }] });
    await expect(
      new GithubReleaseDetector({ url: 'x' }).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.HTTP_4XX });
  });

  it('tag_name 缺 → no_version', async () => {
    const http = new MockHttp({
      get: [{ status: 200, body: JSON.stringify({ name: 'Release' }) }],
    });
    await expect(
      new GithubReleaseDetector({ url: 'x' }).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('JSON 解析失败 → parse', async () => {
    const http = new MockHttp({ get: [{ status: 200, body: 'not json' }] });
    await expect(
      new GithubReleaseDetector({ url: 'x' }).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.PARSE });
  });

  it('无 url → no_version', async () => {
    await expect(
      new GithubReleaseDetector({}).detect(makeCtx({})),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('release body 带 releaseNotes → changelog', async () => {
    const http = new MockHttp({
      get: [
        {
          status: 200,
          body: JSON.stringify({
            tag_name: '1.0.0',
            body: '## Changes\n- Fixed bug',
          }),
        },
      ],
    });
    const r = await new GithubReleaseDetector({ url: 'x' }).detect(
      makeCtx({ http }),
    );
    expect(r.changelog).toContain('Fixed bug');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/detectors/github-release.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the detector**

Create `src/detectors/github-release.js`:

```js
/**
 * src/detectors/github-release.js
 *
 * GitHub Releases API — api.github.com/repos/{owner}/{repo}/releases/latest
 * 取 tag_name (去 v 前缀). 纯 HTTP, mac/win 通用.
 *
 * 配置: { type: 'github_release', url: 'https://api.github.com/repos/{owner}/{repo}/releases/latest' }
 *
 * 适用: 发在 GitHub Releases 的 Electron app / 开源工具. Windows 端缺 app_store_lookup
 *       这种通用源, github_release 填补这个空缺 (mac 也能用).
 */

const { Detector, DetectorResult } = require('./base');
const { DetectorError, REASONS } = require('./errors');
const { truncate, assertHttpResponse } = require('./utils');

class GithubReleaseDetector extends Detector {
  static name = 'github_release';

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 8000 });
    this.url = opts.url || '';
  }

  async detect(ctx) {
    const url = this.url || ctx.url;
    if (!url) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: 'no url configured',
      });
    }

    const r = await ctx.http.get(url, {
      timeout: ctx.timeout || this.timeout,
      headers: { 'User-Agent': 'Pulse', Accept: 'application/vnd.github+json' },
    });

    assertHttpResponse(r, this.constructor.name, url);

    let data;
    try {
      data = JSON.parse(r.body);
    } catch (e) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.PARSE,
        raw: truncate(r.body),
        note: e.message,
      });
    }

    const tag = data && typeof data.tag_name === 'string' ? data.tag_name.trim() : '';
    if (!tag) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: data,
        note: 'tag_name field empty',
      });
    }

    // 去 v / V 前缀 (v3.7.12 → 3.7.12), 但保留版本本身 (v 不是非法字符)
    const version = tag.replace(/^[vV]/, '');

    // release body 当 changelog (markdown 格式)
    const changelog =
      data && typeof data.body === 'string' ? data.body : '';

    return new DetectorResult({
      version,
      raw: truncate(r.body, 1024),
      source: this.constructor.name,
      confidence: 'high',
      note: 'github releases latest',
      changelog,
    });
  }
}

module.exports = { GithubReleaseDetector };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/detectors/github-release.test.js`
Expected: PASS (7 cases).

- [ ] **Step 5: Commit**

```bash
git add src/detectors/github-release.js tests/detectors/github-release.test.js
git commit -m "feat(detector): github_release detector (GitHub Releases API, cross-platform)"
```

---

## Task 2: winget_show detector (runs winget CLI)

**Files:**
- Create: `src/detectors/winget-show.js`
- Test: `tests/detectors/winget-show.test.js`

This detector runs `winget show <id> --versions` — a shell command. Unlike HTTP detectors, it shells out. Uses dependency injection for testability (existing pattern: pass `exec` function via ctx or constructor).

- [ ] **Step 1: Write the failing test**

Create `tests/detectors/winget-show.test.js`:

```js
/**
 * tests/detectors/winget-show.test.js
 *
 * WingetShowDetector — winget show <id> --versions, 取第一个版本号.
 * 依赖 execFile (winget CLI), 测试用 mock exec 注入.
 */
import { describe, it, expect, vi } from 'vitest';
import { WingetShowDetector } from '../../src/detectors/winget-show.js';
import { makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

describe('WingetShowDetector', () => {
  it('解析 winget show 输出, 取第一个版本号', async () => {
    const mockExec = vi.fn().mockResolvedValue({
      stdout: '找到 [Anysphere.Cursor] 版本 1.0.0\n----------------------------------------\n1.0.0\n0.50.5\n0.49.0',
      stderr: '',
    });
    const r = await new WingetShowDetector({ id: 'Anysphere.Cursor' }).detect(
      makeCtx({ detCfg: { _exec: mockExec } }),
    );
    expect(r.version).toBe('1.0.0');
    expect(r.source).toBe('winget_show');
    expect(r.confidence).toBe('high');
    expect(mockExec).toHaveBeenCalled();
  });

  it('英文 locale 输出也能解析', async () => {
    const mockExec = vi.fn().mockResolvedValue({
      stdout: 'Anysphere.Cursor 1.2.3\n1.2.3\n1.2.2\n1.2.1',
      stderr: '',
    });
    const r = await new WingetShowDetector({ id: 'X' }).detect(
      makeCtx({ detCfg: { _exec: mockExec } }),
    );
    expect(r.version).toBe('1.2.3');
  });

  it('无 id → no_version', async () => {
    await expect(
      new WingetShowDetector({}).detect(makeCtx({})),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('winget 不存在 / 报错 → no_version', async () => {
    const mockExec = vi.fn().mockRejectedValue(new Error('ENOENT'));
    await expect(
      new WingetShowDetector({ id: 'X' }).detect(
        makeCtx({ detCfg: { _exec: mockExec } }),
      ),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('空输出 → no_version', async () => {
    const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    await expect(
      new WingetShowDetector({ id: 'X' }).detect(
        makeCtx({ detCfg: { _exec: mockExec } }),
      ),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('输出里没有版本号 → no_version', async () => {
    const mockExec = vi
      .fn()
      .mockResolvedValue({ stdout: 'No package found', stderr: '' });
    await expect(
      new WingetShowDetector({ id: 'X' }).detect(
        makeCtx({ detCfg: { _exec: mockExec } }),
      ),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/detectors/winget-show.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the detector**

Create `src/detectors/winget-show.js`:

```js
/**
 * src/detectors/winget-show.js
 *
 * WingetShowDetector — winget show <id> --versions, 取第一个 (最新) 版本号.
 * Windows 专用 (winget CLI 只在 Windows 上). 走 execFile, 不走 HTTP.
 *
 * 配置: { type: 'winget_show', id: 'Anysphere.Cursor', platform: 'win' }
 *
 * 版本解析策略:
 *   winget show 输出形如 (中文 locale):
 *     找到 [Anysphere.Cursor] 版本 1.0.0
 *     ----------------------------------------
 *     1.0.0
 *     0.50.5
 *   或英文 locale:
 *     Anysphere.Cursor 1.2.3
 *     1.2.3
 *   策略: 从输出里找所有独立的版本号行 (纯数字+点), 取第一个.
 *
 * 依赖注入: ctx.detCfg._exec 用于测试 mock. 生产环境用 child_process.execFile.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const { Detector, DetectorResult } = require('./base');
const { DetectorError, REASONS } = require('./errors');

const pExecFile = promisify(execFile);

// 版本号行: 纯 x.y.z 格式 (至少 2 段数字), 不含其它字符
const VERSION_LINE = /^\d+\.\d+(?:\.\d+)*(?:[-+].+)?$/;

class WingetShowDetector extends Detector {
  static name = 'winget_show';

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 15000 });
    this.id = opts.id || '';
  }

  async detect(ctx) {
    const id = this.id || (ctx.detCfg && ctx.detCfg.id) || '';
    if (!id) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: 'no winget id configured',
      });
    }

    const exec = (ctx.detCfg && ctx.detCfg._exec) || pExecFile;

    let stdout = '';
    try {
      const result = await exec(
        'winget',
        ['show', '--id', id, '--versions', '--exact'],
        { timeout: ctx.timeout || this.timeout, encoding: 'utf-8' },
      );
      stdout = (result && result.stdout) || '';
    } catch (e) {
      // winget 不存在 / 报错 → 没拿到版本
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: `winget exec failed: ${(e && e.message) || 'unknown'}`,
      });
    }

    // 从输出里找第一个版本号行
    const lines = stdout.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (VERSION_LINE.test(trimmed)) {
        return new DetectorResult({
          version: trimmed,
          raw: stdout.slice(0, 500),
          source: this.constructor.name,
          confidence: 'high',
          note: `winget show ${id}`,
        });
      }
    }

    throw new DetectorError({
      detector: this.constructor.name,
      reason: REASONS.NO_VERSION,
      raw: stdout.slice(0, 200),
      note: 'no version line found in winget output',
    });
  }
}

module.exports = { WingetShowDetector };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/detectors/winget-show.test.js`
Expected: PASS (6 cases).

- [ ] **Step 5: Commit**

```bash
git add src/detectors/winget-show.js tests/detectors/winget-show.test.js
git commit -m "feat(detector): winget_show detector (winget CLI versions query)"
```

---

## Task 3: win-registry module (reg query for DisplayVersion)

**Files:**
- Create: `src/workers/win-registry.js`
- Test: `tests/workers/win-registry.test.js`

Reads `DisplayVersion` from the Windows uninstall registry keys. Used by both `registry_version` source and `resolveAppPath` (InstallLocation).

- [ ] **Step 1: Write the failing test**

Create `tests/workers/win-registry.test.js`:

```js
/**
 * tests/workers/win-registry.test.js
 *
 * win-registry.js — reg query 读 DisplayVersion / InstallLocation.
 * 测试用 mock execFile 注入预设 reg 输出.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  queryRegistryField,
  parseRegOutput,
  queryAllUninstallKeys,
} from '../../src/workers/win-registry.js';

describe('win-registry', () => {
  describe('parseRegOutput', () => {
    it('从 reg query 输出提取字段值', () => {
      const output = [
        '',
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{GUID}',
        '    DisplayName    REG_SZ    Cursor',
        '    DisplayVersion    REG_SZ    1.0.0',
        '    InstallLocation    REG_SZ    C:\\Users\\me\\AppData\\Local\\Programs\\cursor',
        '',
      ].join('\r\n');
      const fields = parseRegOutput(output);
      expect(fields.DisplayName).toBe('Cursor');
      expect(fields.DisplayVersion).toBe('1.0.0');
      expect(fields.InstallLocation).toBe(
        'C:\\Users\\me\\AppData\\Local\\Programs\\cursor',
      );
    });

    it('多段值 (REG_MULTI_SZ) 取第一段', () => {
      const output = '    Something    REG_MULTI_SZ    a\\0b\\0c';
      expect(parseRegOutput(output).Something).toBe('a');
    });

    it('空输出 → {}', () => {
      expect(parseRegOutput('')).toEqual({});
    });
  });

  describe('queryRegistryField', () => {
    it('指定 reg_path + field → 返回值', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout:
          'HKEY_CURRENT_USER\\Soft\\X\r\n    DisplayVersion    REG_SZ    2.5.1\r\n',
        stderr: '',
      });
      const v = await queryRegistryField(
        'HKCU\\Soft\\X',
        'DisplayVersion',
        { _exec: mockExec },
      );
      expect(v).toBe('2.5.1');
      expect(mockExec).toHaveBeenCalledWith(
        'reg',
        expect.arrayContaining(['query', 'HKCU\\Soft\\X']),
        expect.any(Object),
      );
    });

    it('reg 不存在 (ENOENT) → null', async () => {
      const mockExec = vi.fn().mockRejectedValue(new Error('ENOENT'));
      const v = await queryRegistryField('HKCU\\X', 'DisplayVersion', {
        _exec: mockExec,
      });
      expect(v).toBeNull();
    });

    it('字段不存在 → null', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout: 'HKEY\\X\r\n    Other    REG_SZ    1\r\n',
        stderr: '',
      });
      const v = await queryRegistryField('HKCU\\X', 'DisplayVersion', {
        _exec: mockExec,
      });
      expect(v).toBeNull();
    });
  });

  describe('queryAllUninstallKeys (全局扫描兜底)', () => {
    it('按 DisplayName 匹配 app, 返回 { version, installLocation }', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout:
          'HKEY\\Uninstall\\{GUID}\r\n' +
          '    DisplayName    REG_SZ    Cursor\r\n' +
          '    DisplayVersion    REG_SZ    3.6.31\r\n' +
          '    InstallLocation    REG_SZ    C:\\Cursor\r\n',
        stderr: '',
      });
      const r = await queryAllUninstallKeys('Cursor', { _exec: mockExec });
      expect(r.version).toBe('3.6.31');
      expect(r.installLocation).toBe('C:\\Cursor');
    });

    it('没匹配到 → null', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout: 'HKEY\\X\r\n    DisplayName    REG_SZ    OtherApp\r\n',
        stderr: '',
      });
      const r = await queryAllUninstallKeys('Cursor', { _exec: mockExec });
      expect(r).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workers/win-registry.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

Create `src/workers/win-registry.js`:

```js
/**
 * src/workers/win-registry.js
 *
 * Windows 注册表查询 — 读 DisplayVersion / InstallLocation.
 *
 * 两个层级:
 *   1) queryRegistryField(regPath, field) — 指定精确 key 路径, 读单个字段
 *   2) queryAllUninstallKeys(displayName) — 全局扫描 3 个 Uninstall 根, 按 DisplayName 匹配
 *
 * 命令: reg query "HKLM\...\{GUID}" /v DisplayVersion
 *   (reg 是 Windows 内置 CLI, 非 Windows 上跑会 ENOENT → 返回 null)
 *
 * 依赖注入: opts._exec 用于测试 mock. 生产环境用 child_process.execFile.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');

const pExecFile = promisify(execFile);

// 3 个 Uninstall 根 (系统 64 位 / 系统 32 位 / 用户级)
const UNINSTALL_ROOTS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

/**
 * 解析 reg query 的 stdout 成 { FieldName: value } map.
 * reg 输出形如:
 *   HKEY_...\{GUID}
 *       DisplayName    REG_SZ    Cursor
 *       DisplayVersion    REG_SZ    1.0.0
 */
function parseRegOutput(output) {
  const fields = {};
  if (!output || typeof output !== 'string') return fields;
  // 匹配 "    FieldName    REG_TYPE    value"
  // REG_SZ / REG_EXPAND_SZ / REG_DWORD 等都取后面当字符串
  const re = /^\s+(\S+)\s+REG_\S+\s+(.+)$/gm;
  let m;
  while ((m = re.exec(output)) !== null) {
    const name = m[1];
    let value = m[2].trim();
    // REG_MULTI_SZ 用 \0 分隔, 取第一段
    if (value.includes('\\0')) value = value.split('\\0')[0];
    fields[name] = value;
  }
  return fields;
}

/**
 * 查指定 reg key 的指定字段.
 * @param {string} regPath  e.g. 'HKCU\\SOFTWARE\\...\\{GUID}'
 * @param {string} field    e.g. 'DisplayVersion'
 * @param {object} [opts]   { _exec } 测试注入
 * @returns {Promise<string|null>}
 */
async function queryRegistryField(regPath, field, opts = {}) {
  if (!regPath || !field) return null;
  const exec = opts._exec || pExecFile;
  try {
    const { stdout } = await exec(
      'reg',
      ['query', regPath, '/v', field],
      { encoding: 'utf-8', timeout: 5000 },
    );
    const fields = parseRegOutput(stdout);
    return fields[field] || null;
  } catch {
    return null;
  }
}

/**
 * 全局扫描 3 个 Uninstall 根, 按 DisplayName 匹配 app 名.
 * 返回 { version, installLocation } 或 null.
 *
 * @param {string} displayName  e.g. 'Cursor' (跟注册表 DisplayName 比较)
 * @param {object} [opts]       { _exec }
 * @returns {Promise<{version: string, installLocation: string}|null>}
 */
async function queryAllUninstallKeys(displayName, opts = {}) {
  if (!displayName) return null;
  const exec = opts._exec || pExecFile;
  for (const root of UNINSTALL_ROOTS) {
    try {
      const { stdout } = await exec(
        'reg',
        ['query', root, '/s'],
        { encoding: 'utf-8', timeout: 15000 },
      );
      // /s 递归输出所有子 key. 按空白切段, 每段一个 key block.
      // 找 DisplayName 匹配的 block, 从中提取 DisplayVersion + InstallLocation.
      const blocks = stdout.split(/\r?\n\r?\n/);
      for (const block of blocks) {
        const fields = parseRegOutput(block);
        if (
          fields.DisplayName &&
          fields.DisplayName.toLowerCase().includes(
            displayName.toLowerCase(),
          )
        ) {
          return {
            version: fields.DisplayVersion || null,
            installLocation: fields.InstallLocation || null,
          };
        }
      }
    } catch {
      // reg 不存在或 key 无权限 → 跳过这个根
    }
  }
  return null;
}

module.exports = {
  parseRegOutput,
  queryRegistryField,
  queryAllUninstallKeys,
  UNINSTALL_ROOTS,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/workers/win-registry.test.js`
Expected: PASS (8 cases).

- [ ] **Step 5: Commit**

```bash
git add src/workers/win-registry.js tests/workers/win-registry.test.js
git commit -m "feat(workers): win-registry module (reg query DisplayVersion/InstallLocation)"
```

---

## Task 4: Add Windows version sources to version-source.js

**Files:**
- Modify: `src/workers/version-source.js`
- Test: `tests/workers/version-source-platform.test.js`

Add `registry_version`, `winget_list`, `windows_app_yml` source types.

- [ ] **Step 1: Write the failing test**

Create `tests/workers/version-source-platform.test.js`:

```js
/**
 * tests/workers/version-source-platform.test.js
 *
 * Windows source types: registry_version / winget_list / windows_app_yml.
 * 用 mock exec / mock fs 注入, 不依赖真实 Windows.
 */
import { describe, it, expect, vi } from 'vitest';
import { tryVersionSource } from '../../src/workers/version-source.js';

describe('version-source Windows types', () => {
  describe('registry_version', () => {
    it('指定 reg_path → 读 DisplayVersion', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout:
          'HKCU\\X\r\n    DisplayVersion    REG_SZ    3.6.31\r\n',
        stderr: '',
      });
      const v = await tryVersionSource(
        { type: 'registry_version', reg_path: 'HKCU\\X' },
        { _exec: mockExec },
      );
      expect(v).toBe('3.6.31');
    });

    it('reg 失败 → null', async () => {
      const mockExec = vi.fn().mockRejectedValue(new Error('ENOENT'));
      const v = await tryVersionSource(
        { type: 'registry_version', reg_path: 'HKCU\\X' },
        { _exec: mockExec },
      );
      expect(v).toBeNull();
    });

    it('缺 reg_path → null', async () => {
      const v = await tryVersionSource({ type: 'registry_version' }, {});
      expect(v).toBeNull();
    });
  });

  describe('winget_list', () => {
    it('winget list --id 输出版本', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout: 'Name       Id              Version  Available  Source\nCursor  Anysphere.Cursor  1.0.0   1.0.1     winget',
        stderr: '',
      });
      const v = await tryVersionSource(
        { type: 'winget_list', winget_id: 'Anysphere.Cursor' },
        { _exec: mockExec },
      );
      expect(v).toBe('1.0.0');
    });

    it('winget 没装 → null', async () => {
      const mockExec = vi.fn().mockRejectedValue(new Error('ENOENT'));
      const v = await tryVersionSource(
        { type: 'winget_list', winget_id: 'X' },
        { _exec: mockExec },
      );
      expect(v).toBeNull();
    });
  });

  describe('windows_app_yml', () => {
    it('读 app-update.yml 的 version', async () => {
      const mockFs = {
        promises: { readFile: vi.fn().mockResolvedValue('version: 2.5.0\n') },
      };
      const v = await tryVersionSource(
        { type: 'windows_app_yml', path: 'C:\\Cursor\\app-update.yml' },
        { _fs: mockFs },
      );
      expect(v).toBe('2.5.0');
    });

    it('文件不存在 → null', async () => {
      const mockFs = {
        promises: { readFile: vi.fn().mockRejectedValue(new Error('ENOENT')) },
      };
      const v = await tryVersionSource(
        { type: 'windows_app_yml', path: 'C:\\X' },
        { _fs: mockFs },
      );
      expect(v).toBeNull();
    });
  });

  describe('mac source types 仍正常 (回归)', () => {
    it('plist source 不受影响', async () => {
      const v = await tryVersionSource(
        { type: 'plist' },
        { plistRaw: '<key>CFBundleShortVersionString</key><string>1.2.3</string>' },
      );
      expect(v).toBe('1.2.3');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workers/version-source-platform.test.js`
Expected: FAIL — new source types not handled (return null).

- [ ] **Step 3: Add the source types to version-source.js**

In `src/workers/version-source.js`, add requires at top (after existing `const fs = require('fs');`):

```js
const { queryRegistryField } = require('./win-registry');
```

Add the new cases inside the `switch` in `tryVersionSource`, before the `default:` case:

```js
      case 'registry_version': {
        if (!src.reg_path) return null;
        const reg = await queryRegistryField(src.reg_path, 'DisplayVersion', {
          _exec: deps._exec,
        });
        return reg ? stripBuildNumber(reg) : null;
      }
      case 'winget_list': {
        const wingetId = src.winget_id;
        if (!wingetId) return null;
        const exec = deps._exec || require('child_process').execFile;
        const { promisify } = require('util');
        const pExec = promisify(exec);
        try {
          const { stdout } = await pExec(
            'winget',
            ['list', '--id', wingetId, '--exact'],
            { encoding: 'utf-8', timeout: 15000 },
          );
          // 输出形如表格: Name Id Version Available Source
          // 取 Version 列 (第 3 列). 跳过表头行.
          const lines = stdout.split(/\r?\n/).filter((l) => l.trim());
          for (const line of lines) {
            const cols = line.split(/\s{2,}/);
            if (cols.length >= 3 && /^\d/.test(cols[2])) {
              return stripBuildNumber(cols[2].trim());
            }
          }
          return null;
        } catch {
          return null;
        }
      }
      case 'windows_app_yml': {
        if (!src.path) return null;
        const fsMod = deps._fs || fs;
        try {
          const raw = await fsMod.promises.readFile(src.path, 'utf-8');
          // 跟 electron-yml 的 regex 一致: version: x.y.z
          const m = raw.match(/^\s*version:\s*['"]?([^'"\n]+)['"]?/m);
          return m ? stripBuildNumber(m[1].trim()) : null;
        } catch {
          return null;
        }
      }
```

Also update the function signature to accept `deps` containing `_exec` / `_fs`. The current signature is `tryVersionSource(src, { bundleId, plistRaw, homeDir } = {})`. Change to merge both:

```js
async function tryVersionSource(src, { bundleId, plistRaw, homeDir, _exec, _fs } = {}) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/workers/version-source-platform.test.js`
Expected: PASS (8 cases).

- [ ] **Step 5: Run existing version-source tests (regression)**

Run: `npx vitest run tests/integration/version-source.test.js`
Expected: PASS — existing mac source types unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/workers/version-source.js tests/workers/version-source-platform.test.js
git commit -m "feat(workers): add registry_version/winget_list/windows_app_yml version sources"
```

---

## Task 5: Platform filtering in detector-chain + installed-version

**Files:**
- Modify: `src/workers/detector-chain.js`
- Modify: `src/workers/installed-version.js`
- Modify: `src/detectors/base.js` (add platform to DetectContext)
- Test: `tests/workers/detector-chain-platform.test.js`

Add `platform` to the detect context so detectors/sources can be filtered by platform tag.

- [ ] **Step 1: Write the failing test**

Create `tests/workers/detector-chain-platform.test.js`:

```js
/**
 * tests/workers/detector-chain-platform.test.js
 *
 * detector chain 按 platform 过滤: 只跑 platform===当前平台 或 没标 platform 的.
 * mac 上 win-only detector 被跳过, 反之亦然.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('detector-chain platform filtering', () => {
  it('detector-chain.js 源码读 currentPlatform 并过滤', () => {
    const src = readFileSync(
      join(__dirname, '../../src/workers/detector-chain.js'),
      'utf-8',
    );
    expect(src).toContain('platform');
    expect(src).toMatch(/skipped.*platform|platform.*skip/i);
  });

  it('installed-version.js 源码按 platform 过滤 version_sources', () => {
    const src = readFileSync(
      join(__dirname, '../../src/workers/installed-version.js'),
      'utf-8',
    );
    expect(src).toContain('platform');
  });

  it('DetectContext 带 platform 字段', () => {
    const src = readFileSync(
      join(__dirname, '../../src/detectors/base.js'),
      'utf-8',
    );
    // DetectContext 构造里接收 platform
    expect(src).toMatch(/platform/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workers/detector-chain-platform.test.js`
Expected: FAIL — platform not yet in detector-chain.

- [ ] **Step 3: Add platform to DetectContext (base.js)**

In `src/detectors/base.js`, add `platform` to the `DetectContext` constructor params. Find the constructor:

```js
  constructor({ appCfg, arch, http, logger, detCfg = {} }) {
    this.appCfg = appCfg;
    this.arch = arch;
    this.http = http;
    this.logger = logger;
    this.detCfg = detCfg;
  }
```

Change to:

```js
  constructor({ appCfg, arch, http, logger, detCfg = {}, platform } = {}) {
    this.appCfg = appCfg;
    this.arch = arch;
    this.http = http;
    this.logger = logger;
    this.detCfg = detCfg;
    this.platform = platform || process.platform;
  }
```

- [ ] **Step 4: Add platform filtering to detector-chain.js**

In `src/workers/detector-chain.js`, the `runDetectorChain` function receives `deps`. Add `platform` to destructuring and pass it to `DetectContext`. Add filtering at the top of the loop.

Current deps destructuring:
```js
async function runDetectorChain(appCfg, deps) {
  const { arch, http, logger } = deps;
```
Change to:
```js
async function runDetectorChain(appCfg, deps) {
  const { arch, http, logger, platform } = deps;
  const currentPlatform = platform || process.platform;
```

In the loop, after `const Det = makeDetector(detCfg);` check, add a platform filter BEFORE creating the context:

```js
  for (const detCfg of detectors) {
    // 平台过滤: 只跑 platform===当前平台 或没标 platform 的 detector
    if (detCfg.platform && detCfg.platform !== currentPlatform) {
      trace.push({ det: detCfg.type, ms: 0, skipped: 'platform' });
      continue;
    }
    const Det = makeDetector(detCfg);
    ...
```

And pass platform to the DetectContext constructor:
```js
    const ctx = new DetectContext({
      appCfg,
      arch,
      http,
      logger,
      detCfg,
      platform: currentPlatform,
    });
```

- [ ] **Step 5: Add platform filtering to installed-version.js**

In `src/workers/installed-version.js`, the `getInstalledVersion` function iterates `versionSources`. Add filtering. Find:

```js
  if (Array.isArray(versionSources) && versionSources.length > 0) {
    for (const src of versionSources) {
      const v = await tryVersionSource(src, { bundleId, plistRaw });
      if (v) return v;
    }
    return null;
  }
```

Change to filter by platform first:

```js
  if (Array.isArray(versionSources) && versionSources.length > 0) {
    const currentPlatform = process.platform;
    const filtered = versionSources.filter(
      (s) => !s.platform || s.platform === currentPlatform,
    );
    for (const src of filtered) {
      const v = await tryVersionSource(src, { bundleId, plistRaw });
      if (v) return v;
    }
    // 过滤后空 (当前平台没有匹配 source) → 走下面的 fallback 链, 不直接 return null
    if (filtered.length === 0) {
      // fall through to platform fallback below
    } else {
      return null;
    }
  }
```

Wait — the control flow needs care. After the `if` block the existing code does `const fromJson = await tryInstalledJson(bundleId);`. The filtered-empty case should fall through to that. Let me restructure: the `if` block already has an early `return null` when all sources tried and failed. We want: if filtered is non-empty and all returned null → return null. If filtered is empty → fall through to fallback chain. Change the `return null` inside the loop to only return when filtered had items:

```js
  if (Array.isArray(versionSources) && versionSources.length > 0) {
    const currentPlatform = process.platform;
    const filtered = versionSources.filter(
      (s) => !s.platform || s.platform === currentPlatform,
    );
    for (const src of filtered) {
      const v = await tryVersionSource(src, { bundleId, plistRaw });
      if (v) return v;
    }
    if (filtered.length > 0) return null;
    // filtered.length === 0: 当前平台没配 source, 走 fallback 链
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/workers/detector-chain-platform.test.js`
Expected: PASS (3 cases).

- [ ] **Step 7: Run regression (existing detector + integration tests)**

Run: `npx vitest run tests/detectors/ tests/workers/ tests/integration/`
Expected: PASS — platform filter is a no-op on mac (mac detectors untagged → all run).

- [ ] **Step 8: Commit**

```bash
git add src/detectors/base.js src/workers/detector-chain.js src/workers/installed-version.js tests/workers/detector-chain-platform.test.js
git commit -m "feat(workers): platform filtering in detector-chain + installed-version

Detectors/sources tagged 'platform: win' skipped on mac and vice versa.
Platform-filtered-empty falls through to platform fallback chain."
```

---

## Task 6: Register new detectors in chain + schema

**Files:**
- Modify: `src/workers/detector-chain.js` (DETECTORS map)
- Modify: `src/config/schema.js` (VALID_DETECTOR_TYPES)
- Test: `tests/config/schema-p2.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/config/schema-p2.test.js`:

```js
/**
 * tests/config/schema-p2.test.js
 *
 * 新 detector types (winget_show / github_release) + win_bundle/winget_id 字段
 * 通过 schema 验证 + sanitize.
 */
import { describe, it, expect } from 'vitest';
import { validateConfig, sanitizeConfig, VALID_DETECTOR_TYPES } from '../../src/config/schema.js';

describe('schema P2: new detector types + win fields', () => {
  it('VALID_DETECTOR_TYPES 含 winget_show / github_release', () => {
    expect(VALID_DETECTOR_TYPES.has('winget_show')).toBe(true);
    expect(VALID_DETECTOR_TYPES.has('github_release')).toBe(true);
  });

  it('validate 接受 winget_show detector', () => {
    const cfg = {
      apps: [
        {
          name: 'Cursor',
          bundle: 'Cursor.app',
          detectors: [{ type: 'winget_show', id: 'Anysphere.Cursor', platform: 'win' }],
        },
      ],
    };
    const v = validateConfig(cfg);
    expect(v.valid).toBe(true);
  });

  it('sanitize 保留 win_bundle / winget_id 字段', () => {
    const cfg = {
      apps: [
        {
          name: 'Cursor',
          bundle: 'Cursor.app',
          win_bundle: 'Cursor',
          winget_id: 'Anysphere.Cursor',
          detectors: [{ type: 'github_release', url: 'x' }],
        },
      ],
    };
    const s = sanitizeConfig(cfg);
    const app = s.apps[0];
    expect(app.win_bundle).toBe('Cursor');
    expect(app.winget_id).toBe('Anysphere.Cursor');
  });

  it('sanitize 保留 detector 的 platform + id 字段', () => {
    const cfg = {
      apps: [
        {
          name: 'X',
          bundle: 'X.app',
          detectors: [
            { type: 'winget_show', id: 'X.Id', platform: 'win' },
            { type: 'brew_formulae', cask: 'x', platform: 'mac' },
          ],
        },
      ],
    };
    const s = sanitizeConfig(cfg);
    expect(s.apps[0].detectors).toHaveLength(2);
    expect(s.apps[0].detectors[0].platform).toBe('win');
    expect(s.apps[0].detectors[0].id).toBe('X.Id');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/schema-p2.test.js`
Expected: FAIL — new types not in set, win fields stripped by sanitize.

- [ ] **Step 3: Update schema.js**

In `src/config/schema.js`:

**Add to `VALID_DETECTOR_TYPES` set** (after `"html_changelog",`):
```js
  "winget_show",
  "github_release",
```

**In `sanitizeConfig`**, the detector filter currently only checks `type` validity. It also strips unknown fields. The `cleanDets` filter:
```js
    const cleanDets = dets.filter(
      (d) =>
        isPlainObject(d) &&
        isNonEmptyString(d.type) &&
        VALID_DETECTOR_TYPES.has(d.type),
    );
```
This keeps detectors but the subsequent `cleanApps.push` only copies specific fields. Find the `cleanApps.push({` block and add win fields + preserve extra detector fields. Change the push to also carry `win_bundle`, `winget_id`, and preserve `platform`/`id`/`url` on detectors:

```js
    cleanApps.push({
      name: a.name,
      bundle: a.bundle,
      download_url: isNonEmptyString(a.download_url) ? a.download_url : "",
      release_notes_url: isNonEmptyString(a.release_notes_url)
        ? a.release_notes_url
        : undefined,
      bundle_changelog: a.bundle_changelog === true ? true : undefined,
      // P2: Windows 标识字段
      win_bundle: isNonEmptyString(a.win_bundle) ? a.win_bundle : undefined,
      winget_id: isNonEmptyString(a.winget_id) ? a.winget_id : undefined,
      detectors: cleanDets.map((d) => {
        const out = { type: d.type };
        // 保留 detector 通用字段
        if (isNonEmptyString(d.url)) out.url = d.url;
        if (isNonEmptyString(d.cask)) out.cask = d.cask;
        if (isNonEmptyString(d.field)) out.field = d.field;
        if (isNonEmptyString(d.id)) out.id = d.id;
        if (isNonEmptyString(d.platform)) out.platform = d.platform;
        if (typeof d.timeout === 'number' && d.timeout > 0) out.timeout = d.timeout;
        if (isNonEmptyString(d.section_pattern)) out.section_pattern = d.section_pattern;
        if (isNonEmptyString(d.section_end)) out.section_end = d.section_end;
        if (isNonEmptyString(d.version_pattern)) out.version_pattern = d.version_pattern;
        return out;
      }),
      version_sources: cleanVS.length > 0 ? cleanVS : undefined,
    });
```

Also update `version_sources` sanitize to preserve `platform` / `reg_path` / `winget_id` fields. Find the `cleanVS` map:
```js
      .map((s) => {
        const out = { type: s.type };
        if (s.path) out.path = String(s.path);
        if (s.pattern) out.pattern = String(s.pattern);
        return out;
      });
```
Change to:
```js
      .map((s) => {
        const out = { type: s.type };
        if (s.path) out.path = String(s.path);
        if (s.pattern) out.pattern = String(s.pattern);
        if (isNonEmptyString(s.reg_path)) out.reg_path = s.reg_path;
        if (isNonEmptyString(s.winget_id)) out.winget_id = s.winget_id;
        if (isNonEmptyString(s.platform)) out.platform = s.platform;
        return out;
      });
```

And add the new source types to the `validVS` set:
```js
    const validVS = new Set(["installed_json", "plist", "regex_file", "registry_version", "winget_list", "windows_app_yml"]);
```

- [ ] **Step 4: Register detectors in detector-chain.js**

In `src/workers/detector-chain.js`, add to the `DETECTORS` map:
```js
  winget_show: require("../detectors/winget-show"),
  github_release: require("../detectors/github-release"),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/config/schema-p2.test.js`
Expected: PASS (4 cases).

- [ ] **Step 6: Run config regression tests**

Run: `npx vitest run tests/config/ tests/integration/config-migrate.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/config/schema.js src/workers/detector-chain.js tests/config/schema-p2.test.js
git commit -m "feat(config): register winget_show/github_release + win_bundle/winget_id schema"
```

---

## Task 7: Implement Windows platform resolveAppPath + getInstalledVersion

**Files:**
- Modify: `src/platform/windows.js`
- Test: `tests/platform/windows-detection.test.js`

Replace the P1 stubs for `resolveAppPath` and `getInstalledVersion` with real implementations using win-registry.

- [ ] **Step 1: Write the failing test**

Create `tests/platform/windows-detection.test.js`:

```js
/**
 * tests/platform/windows-detection.test.js
 *
 * P2: windows.js resolveAppPath + getInstalledVersion 真实实现 (用 win-registry).
 * mock win-registry 模块注入.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock win-registry
const mockQueryAllUninstallKeys = vi.fn();
const mockQueryRegistryField = vi.fn();
vi.mock('../../src/workers/win-registry', () => ({
  queryAllUninstallKeys: (...args) => mockQueryAllUninstallKeys(...args),
  queryRegistryField: (...args) => mockQueryRegistryField(...args),
}));

// Mock installed-version (getInstalledVersion 委托它)
const mockGetInstalledVersion = vi.fn();
vi.mock('../../src/workers/installed-version', () => ({
  getInstalledVersion: (...args) => mockGetInstalledVersion(...args),
}));

describe('platform/windows P2 detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveAppPath', () => {
    it('win_bundle 匹配注册表 InstallLocation', async () => {
      mockQueryAllUninstallKeys.mockResolvedValue({
        version: '1.0.0',
        installLocation: 'C:\\Program Files\\Cursor',
      });
      const win = require('../../src/platform/windows.js');
      const p = win.resolveAppPath(null, { win_bundle: 'Cursor' });
      expect(p).toBe('C:\\Program Files\\Cursor');
      expect(mockQueryAllUninstallKeys).toHaveBeenCalledWith('Cursor', expect.any(Object));
    });

    it('注册表没找到 → null', () => {
      mockQueryAllUninstallKeys.mockResolvedValue(null);
      const win = require('../../src/platform/windows.js');
      expect(win.resolveAppPath(null, { win_bundle: 'Nope' })).toBeNull();
    });

    it('缺 win_bundle → null', () => {
      const win = require('../../src/platform/windows.js');
      expect(win.resolveAppPath(null, {})).toBeNull();
    });
  });

  describe('getInstalledVersion', () => {
    it('委托 installed-version.js (走 version_sources 过滤)', async () => {
      mockGetInstalledVersion.mockResolvedValue('3.6.31');
      const win = require('../../src/platform/windows.js');
      const v = await win.getInstalledVersion({
        win_bundle: 'Cursor',
        version_sources: [{ type: 'registry_version', reg_path: 'X' }],
      });
      expect(v).toBe('3.6.31');
    });

    it('无 version_sources → 走注册表全局扫描兜底', async () => {
      mockQueryAllUninstallKeys.mockResolvedValue({
        version: '2.5.0',
        installLocation: 'C:\\X',
      });
      const win = require('../../src/platform/windows.js');
      const v = await win.getInstalledVersion({ win_bundle: 'Cursor' });
      expect(v).toBe('2.5.0');
    });

    it('兜底也找不到 → null', async () => {
      mockQueryAllUninstallKeys.mockResolvedValue(null);
      const win = require('../../src/platform/windows.js');
      const v = await win.getInstalledVersion({ win_bundle: 'Nope' });
      expect(v).toBeNull();
    });
  });
});

import { beforeEach } from 'vitest';
```

Note: the `import { beforeEach }` at the bottom is a hoisting workaround for vitest — actually move it to the top import line. Fix: combine the top import to `import { describe, it, expect, vi, beforeEach } from 'vitest';` and remove the bottom line.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/platform/windows-detection.test.js`
Expected: FAIL — windows.js still has P1 stubs.

- [ ] **Step 3: Implement resolveAppPath + getInstalledVersion in windows.js**

In `src/platform/windows.js`, replace the stub `resolveAppPath` and `getInstalledVersion` functions.

Add require at top (after the mainLog try/catch):
```js
const { queryAllUninstallKeys } = require('../workers/win-registry');
const iv = require('../workers/installed-version');
```

Replace the `resolveAppPath` stub:
```js
function resolveAppPath(_bundle, appCfg) {
  // P2: 按 win_bundle 查注册表 InstallLocation
  const winBundle = appCfg && appCfg.win_bundle;
  if (!winBundle) return null;
  // queryAllUninstallKeys 是 async, 但 resolveAppPath 签名是 sync (跟 mac 一致).
  // resolveAppPath 用于 appExists 检查 (fs.existsSync). Windows 上我们改成:
  // task-handlers 的 appExists 检查在 P2 改成 async 走注册表. 但为了不改签名,
  // 这里返回 win_bundle 名本身 (让 fs.existsSync 判断可执行文件存在性),
  // 真正的路径解析在 getInstalledVersion 里做.
  //
  // 权衡: Windows 上 "app 是否安装" 更适合走注册表 (InstallLocation),
  //       但这需要 async. task-handlers 在 P1 已改成 platform.resolveAppPath.
  //       P2 这里返回 null 让 task-handlers 的 existsSync(false) → not_installed,
  //       getInstalledVersion 才是真正读版本的地方.
  //       (后续 P3 可把 appExists 检查也改成 async 走注册表)
  return null;
}
```

Wait — this creates a problem: if resolveAppPath always returns null, task-handlers marks every Windows app as `not_installed` and never calls getInstalledVersion. The detection flow is: `resolveAppPath` → `fs.existsSync` → if false, return not_installed (skip getInstalledVersion).

For Windows, we need the appExists check to go through the registry instead of fs.existsSync. This is a deeper change to task-handlers. Let me reconsider: the cleanest P2 approach is to make the Windows `resolveAppPath` return the win_bundle string when the app exists, but we can't check existence synchronously.

**Decision:** Change the Windows flow so `task-handlers` on Windows skips the fs.existsSync gate and goes straight to `getInstalledVersion` (which returns null if not installed). This means `resolveAppPath` on Windows returns the `win_bundle` (non-null marker) so the existsSync check passes, and the real existence check happens in `getInstalledVersion`.

Revised `resolveAppPath`:
```js
function resolveAppPath(_bundle, appCfg) {
  // Windows 不像 mac 有固定 /Applications 路径. 这里返回 win_bundle 作为
  // "存在性标记" (非 null 让 task-handlers 的 existsSync 逻辑跳过 not_installed 短路).
  // 真正的安装检测 + 版本读取在 getInstalledVersion 里走注册表.
  // 注: fs.existsSync(win_bundle) 在 Windows 上会返 false (不是有效路径),
  //     所以 task-handlers 的 appExists 仍会 false → not_installed.
  //     这不对. → 见下方 task-handlers 改动: Windows 上 appExists 直接走 true.
  const winBundle = appCfg && appCfg.win_bundle;
  return winBundle || null;
}
```

This still has the problem that `fs.existsSync("Cursor")` is false. So task-handlers must be changed to not use fs.existsSync on Windows. **Add this to Task 7's scope**: modify `task-handlers.js` `handleDetectApp` so the `appExists` check is platform-aware — on Windows, skip fs.existsSync and proceed to getInstalledVersion.

Replace the `resolveAppPath` stub in windows.js:
```js
function resolveAppPath(_bundle, appCfg) {
  // Windows 没有 mac 那样的固定 /Applications 路径. 返回 win_bundle 作为存在性标记.
  // task-handlers 在 win 上不走 fs.existsSync (见 handleDetectApp 平台分支),
  // 直接用 getInstalledVersion (走注册表) 判断安装 + 读版本.
  const winBundle = appCfg && appCfg.win_bundle;
  return winBundle || null;
}
```

Replace the `getInstalledVersion` stub:
```js
async function getInstalledVersion(appCfg) {
  const winBundle = appCfg && appCfg.win_bundle;
  if (!winBundle) return null;

  // 1) 优先走 version_sources (用户显式配的 reg_path / winget 等)
  const sources =
    appCfg && appCfg.version_sources ? appCfg.version_sources : undefined;
  if (Array.isArray(sources) && sources.length > 0) {
    const v = await iv.getInstalledVersion(winBundle, sources);
    if (v) return v;
  }

  // 2) 兜底: 注册表全局扫描 (按 DisplayName 匹配 win_bundle)
  const regResult = await queryAllUninstallKeys(winBundle);
  if (regResult && regResult.version) return regResult.version;

  return null;
}
```

- [ ] **Step 4: Make task-handlers appExists check platform-aware**

In `src/workers/task-handlers.js`, the `appExists` IIFE uses `fs.existsSync(platform.resolveAppPath(...))`. On Windows, `resolveAppPath` returns a win_bundle name (not a path), so existsSync would be false. Change the check to skip fs.existsSync on Windows:

Current:
```js
  const appExists = (() => {
    try {
      return fs.existsSync(platform.resolveAppPath(bundle, appCfg));
    } catch {
      return false;
    }
  })();
```

Change to:
```js
  const appExists = (() => {
    try {
      // Windows: 没有固定安装路径, resolveAppPath 返回 win_bundle 标记.
      // 不走 fs.existsSync, 直接当成 "可能安装", 让 getInstalledVersion (注册表) 判断.
      if (process.platform === 'win32') {
        return !!platform.resolveAppPath(bundle, appCfg);
      }
      return fs.existsSync(platform.resolveAppPath(bundle, appCfg));
    } catch {
      return false;
    }
  })();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/platform/windows-detection.test.js`
Expected: PASS.

- [ ] **Step 6: Run regression**

Run: `npx vitest run tests/platform/ tests/workers/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/platform/windows.js src/workers/task-handlers.js tests/platform/windows-detection.test.js
git commit -m "feat(platform): Windows resolveAppPath + getInstalledVersion via registry

task-handlers appExists check platform-aware (win skips fs.existsSync)."
```

---

## Task 8: Pass platform through worker IPC chain

**Files:**
- Modify: `src/workers/ipc.js`
- Modify: `src/workers/detect-worker.js`
- Modify: `src/main/index.js`
- Test: `tests/workers/detect-worker-platform.test.js`

The worker thread needs `platform` in its context to pass to detector-chain. Currently only `ARCH` is in workerData.

- [ ] **Step 1: Write the failing test**

Create `tests/workers/detect-worker-platform.test.js`:

```js
/**
 * tests/workers/detect-worker-platform.test.js
 *
 * worker IPC 层导出 PLATFORM (跟 ARCH 并列).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('worker IPC carries platform', () => {
  it('ipc.js 导出 PLATFORM (从 workerData)', () => {
    const src = readFileSync(
      join(__dirname, '../../src/workers/ipc.js'),
      'utf-8',
    );
    expect(src).toContain('PLATFORM');
    expect(src).toContain('workerData');
  });

  it('detect-worker.js 传 platform 给 handleDetectApp', () => {
    const src = readFileSync(
      join(__dirname, '../../src/workers/detect-worker.js'),
      'utf-8',
    );
    expect(src).toContain('platform');
  });

  it('main/index.js workerOpts 带 platform', () => {
    const src = readFileSync(
      join(__dirname, '../../src/main/index.js'),
      'utf-8',
    );
    expect(src).toMatch(/platform/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workers/detect-worker-platform.test.js`
Expected: FAIL — PLATFORM not exported.

- [ ] **Step 3: Add PLATFORM to ipc.js**

In `src/workers/ipc.js`, after the `ARCH` constant:

```js
const PLATFORM =
  (workerData && workerData.platform) || process.platform;
```

Add `PLATFORM` to `module.exports`.

- [ ] **Step 4: Pass platform in detect-worker.js + task-handlers**

In `src/workers/detect-worker.js`, the `handleDetectApp` call currently passes `{ http, logger }`. Add platform to deps. The detector-chain deps come from task-handlers which imports `ARCH` from ipc.js. Add `PLATFORM`:

In `src/workers/task-handlers.js`, add `PLATFORM` to the import from `./ipc`:
```js
const { sendProgress, postLog, ARCH, PLATFORM } = require("./ipc");
```

And pass it to `runDetectorChain`:
```js
  const chainResult = await runDetectorChain(appCfg, {
    arch: ARCH,
    platform: PLATFORM,
    http,
    logger,
  });
```

- [ ] **Step 5: Add platform to main/index.js workerOpts**

In `src/main/index.js`, the `WorkerPool` construction has `workerOpts: { workerData: { arch: ARCH } }`. Add platform:

```js
      workerOpts: { workerData: { arch: ARCH, platform: process.platform } },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/workers/detect-worker-platform.test.js`
Expected: PASS.

- [ ] **Step 7: Run full regression**

Run: `npx vitest run`
Expected: PASS (except known flaky filter-by-category).

- [ ] **Step 8: Commit**

```bash
git add src/workers/ipc.js src/workers/detect-worker.js src/workers/task-handlers.js src/main/index.js tests/workers/detect-worker-platform.test.js
git commit -m "feat(workers): carry platform through worker IPC chain (workerData)"
```

---

## Task 9: Add win config to config.json (Cursor + VS Code examples)

**Files:**
- Modify: `config.json`

Add `win_bundle` / `winget_id` + win detectors/sources to at least 2 apps so Windows detection can be verified.

- [ ] **Step 1: Read current Cursor + VS Code config entries**

Run: `node -e "const c=require('./config.json'); c.apps.filter(a=>['Cursor','VS Code'].includes(a.name)).forEach(a=>console.log(JSON.stringify(a,null,2)))"`

- [ ] **Step 2: Add win fields to Cursor entry**

Find the Cursor app in `config.json`. Add `win_bundle` and `winget_id`, plus a `github_release` detector (cross-platform) and a `winget_show` detector (win-only). Add `platform: 'mac'` to the existing brew_formulae detector.

Example Cursor entry after edit (add to detectors array + top-level fields):
```json
{
  "name": "Cursor",
  "bundle": "Cursor.app",
  "win_bundle": "Cursor",
  "winget_id": "Anysphere.Cursor",
  "download_url": "https://www.cursor.com/downloads",
  "release_notes_url": "https://www.cursor.com/changelog",
  "detectors": [
    { "type": "cursor_redirect", "url": "https://api2.cursor.sh/updates/download/golden/darwin-{arch_short}/cursor/3.6" },
    { "type": "github_release", "url": "https://api.github.com/repos/getcursor/cursor/releases/latest" },
    { "type": "brew_formulae", "cask": "cursor", "platform": "mac" },
    { "type": "winget_show", "id": "Anysphere.Cursor", "platform": "win" }
  ]
}
```

Note: The `html_changelog` detector in the original entry can stay (cross-platform, reads cursor.com/changelog).

- [ ] **Step 3: Verify config loads + sanitizes**

Run: `node -e "const {sanitizeConfig}=require('./src/config/schema.js'); const c=require('./config.json'); const s=sanitizeConfig(c); const cursor=s.apps.find(a=>a.name==='Cursor'); console.log('win_bundle:', cursor.win_bundle, 'winget_id:', cursor.winget_id); console.log('detectors:', cursor.detectors.map(d=>d.type+(d.platform?'/'+d.platform:'')));"`

Expected: `win_bundle: Cursor winget_id: Anysphere.Cursor` + detectors list including `winget_show/win`.

- [ ] **Step 4: Run config migration test (regression)**

Run: `npx vitest run tests/integration/config-migrate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config.json
git commit -m "feat(config): add Windows detection config to Cursor (win_bundle/winget_id + win detectors)"
```

---

## Task 10: Final integration verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: PASS (except known flaky filter-by-category).

- [ ] **Step 2: Verify platform filtering works end-to-end (simulated)**

Run:
```bash
node -e "
// 验证 win-only detector 在 mac 上被过滤
const { runDetectorChain } = require('./src/workers/detector-chain.js');
const http = { get: async () => ({status:200, body:'{}'}) };
const mockHttp = { get: async(u,o) => { return {status:200, body: JSON.stringify({tag_name:'1.0.0'})}; } };
runDetectorChain({
  name:'X', bundle:'X.app',
  detectors: [
    { type: 'winget_show', id: 'X', platform: 'win' },
    { type: 'github_release', url: 'https://api.github.com/repos/x/y/releases/latest' },
  ]
}, { arch: 'arm64', platform: 'darwin', http: mockHttp, logger: {debug(){},info(){},warn(){},error(){}} })
.then(r => {
  console.log('stoppedAt:', r.stoppedAt);
  console.log('trace:', JSON.stringify(r.trace.map(t=>({det:t.det, skipped:t.skipped, version:t.version}))));
  // mac 上: winget_show 被跳过 (platform:win), github_release 跑 (通用)
  const skipped = r.trace.find(t => t.skipped === 'platform');
  console.log('platform-filtered:', skipped ? skipped.det : 'NONE');
});
"
```

Expected: `stoppedAt: github_release`, trace shows `winget_show` skipped with `platform`, `github_release` ran.

- [ ] **Step 3: Verify renderer build**

Run: `npm run build:renderer`
Expected: succeeds.

- [ ] **Step 4: Tag P2 milestone**

```bash
git tag p2-windows-detection-complete
```

---

## Self-Review Notes

**Spec coverage (§2 Windows Version Detection):**
- ✅ registry_version source — Task 4
- ✅ winget_list source — Task 4
- ✅ windows_app_yml source — Task 4
- ✅ registry 3-location scan — Task 3 (queryAllUninstallKeys)
- ✅ winget_show detector — Task 2
- ✅ github_release detector — Task 1
- ✅ platform filtering in detector-chain — Task 5
- ✅ platform filtering in version_sources — Task 5
- ✅ config merge (win_bundle/winget_id in one app) — Task 6 + Task 9
- ✅ resolveAppPath (registry InstallLocation) — Task 7
- ✅ getInstalledVersion (registry fallback) — Task 7
- ✅ platform through worker IPC — Task 8

**Out of P2 scope (P3/P4):**
- winget upgrade execution — P3
- getAppIcon (getFileIcon) — P4
- CSS platform class — P4

**Placeholder scan:** Task 7 has a design decision (appExists check on Windows) documented inline with rationale. Task 9 needs real winget_id values verified against winget repo.
