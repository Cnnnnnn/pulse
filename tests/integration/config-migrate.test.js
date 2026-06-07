/**
 * tests/integration/config-migrate.test.js
 *
 * 老 config.json → 新 config.json 迁移（spec §5）。
 *
 * 覆盖：
 *   - 11 个真实老 config（基于 config.json 11 个 app，每个 app 一种 web_type）
 *   - 各 web_type 映射正确
 *   - sparkle_url / brew_cask 顺序正确
 *   - .bak 备份行为
 *   - 已是新 schema / 文件不存在 / 解析错 等边界
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  migrateConfig,
  migrateConfigFile,
  isOldSchemaApp,
  MigrationError,
} from '../../src/config/migrate.js';
import { validateConfig, sanitizeConfig, VALID_DETECTOR_TYPES } from '../../src/config/schema.js';

// ─── 11 个真实老 config fixtures（基于项目 config.json） ───────

const OLD_CONFIGS = {
  cursor: {
    name: 'Cursor', bundle: 'Cursor.app', brew_cask: 'cursor',
    sparkle_url: '', web_url: 'https://api2.cursor.sh/updates/download/golden/darwin-{arch_short}/cursor/3.6',
    web_type: 'cursor_redirect', download_url: 'https://www.cursor.com/downloads',
  },
  kimi: {
    name: 'Kimi', bundle: 'Kimi.app', brew_cask: 'kimi',
    sparkle_url: '', web_url: 'https://appsupport.moonshot.cn/api/app/pkg/latest/macos/download',
    web_type: 'redirect', download_url: 'https://kimi.moonshot.cn',
  },
  ima: {
    name: 'ima.copilot', bundle: 'ima.copilot.app', brew_cask: '',
    sparkle_url: '', web_url: 'https://itunes.apple.com/lookup?id=6737188438&country=cn',
    web_type: 'app_store', download_url: 'https://ima.qq.com/download/',
  },
  minimax_code: {
    name: 'MiniMax Code', bundle: 'MiniMax Code.app', brew_cask: '',
    sparkle_url: '', web_url: 'https://filecdn.minimax.chat/public/minimax-agent-prod/release/latest-mac.yml',
    web_type: 'electron_yml', download_url: 'https://www.minimaxi.com',
  },
  workbuddy: {
    name: 'WorkBuddy', bundle: 'WorkBuddy.app', brew_cask: '',
    sparkle_url: '', web_url: 'https://www.codebuddy.cn/v2/update?platform=workbuddy-darwin-{arch}',
    web_type: 'api_json', download_url: 'https://www.codebuddy.cn/workbuddy',
  },
  qclaw: {
    name: 'QClaw', bundle: 'QClaw.app', brew_cask: '',
    sparkle_url: '', web_url: 'https://jprx.m.qq.com/data/4066/forward',
    web_type: 'qclaw_api', download_url: 'https://qclaw.qq.com',
  },
  marvis: {
    name: 'Marvis', bundle: 'Marvis.app', brew_cask: '',
    sparkle_url: '', web_url: 'https://marvis.qq.com/download/dmg',
    web_type: 'redirect', download_url: 'https://marvis.qq.com',
  },
  qoderwork: {
    name: 'QoderWork', bundle: 'QoderWork CN.app', brew_cask: '',
    sparkle_url: '', web_url: 'https://static.qoder.com.cn/qoder-work-cn/releases/latest-mac.yml',
    web_type: 'electron_yml', download_url: 'https://qoder.com',
  },
  codex: {
    name: 'Codex', bundle: 'Codex.app', brew_cask: '',
    sparkle_url: 'https://persistent.oaistatic.com/codex-app-prod/appcast.xml',
    web_url: '', web_type: '', download_url: 'https://openai.com/codex/download',
  },
  codexbar: {
    name: 'CodexBar', bundle: 'CodexBar.app', brew_cask: 'codexbar',
    sparkle_url: 'https://raw.githubusercontent.com/steipete/CodexBar/main/appcast.xml',
    web_url: '', web_type: '', download_url: 'https://github.com/steipete/CodexBar/releases',
  },
  cc_switch: {
    name: 'CC Switch', bundle: 'CC Switch.app', brew_cask: 'cc-switch',
    sparkle_url: '', web_url: '', web_type: '', download_url: '',
  },
};

const FULL_OLD_CONFIG = {
  check_on_launch: true,
  apps: Object.values(OLD_CONFIGS),
};

// ─── helper ────────────────────────────────────────────

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'auc-migrate-'));
}

function makeFsMock(initial = {}) {
  const files = { ...initial };
  return {
    files,
    readFileSync(p) {
      if (!(p in files)) {
        const e = new Error(`ENOENT: ${p}`);
        e.code = 'ENOENT';
        throw e;
      }
      return files[p];
    },
    writeFileSync(p, content) { files[p] = content; },
    copyFileSync(src, dst) { files[dst] = files[src]; },
  };
}

// ─── 1. 纯函数 migrateConfig：11 个老 app 逐个验证 ────────

describe('migrateConfig — 11 个真实老 app 全部通过', () => {
  for (const [key, oldApp] of Object.entries(OLD_CONFIGS)) {
    it(`${key} (${oldApp.web_type || 'no web_type, ' + (oldApp.sparkle_url ? 'sparkle' : 'none') + ', brew=' + (oldApp.brew_cask || 'no')})`, () => {
      const newConfig = migrateConfig({ check_on_launch: true, apps: [oldApp] });
      expect(newConfig.check_on_launch).toBe(true);
      expect(newConfig.apps).toHaveLength(1);
      const app = newConfig.apps[0];
      expect(app.name).toBe(oldApp.name);
      expect(app.bundle).toBe(oldApp.bundle);
      expect(app.download_url).toBe(oldApp.download_url);
      expect(Array.isArray(app.detectors)).toBe(true);
      expect(app.detectors.length).toBeGreaterThan(0);
      // 每个 detector.type 必须在合法集合里
      for (const d of app.detectors) {
        expect(VALID_DETECTOR_TYPES.has(d.type)).toBe(true);
      }
    });
  }
});

// ─── 2. 字段映射 ────────────────────────────────────────

describe('migrateConfig — 字段映射', () => {
  it('cursor_redirect → cursor_redirect', () => {
    const out = migrateConfig({ apps: [OLD_CONFIGS.cursor] });
    expect(out.apps[0].detectors[0]).toEqual({
      type: 'cursor_redirect', url: OLD_CONFIGS.cursor.web_url,
    });
  });

  it('redirect → redirect_filename', () => {
    const out = migrateConfig({ apps: [OLD_CONFIGS.kimi] });
    expect(out.apps[0].detectors[0]).toEqual({
      type: 'redirect_filename', url: OLD_CONFIGS.kimi.web_url,
    });
  });

  it('app_store → app_store_lookup', () => {
    const out = migrateConfig({ apps: [OLD_CONFIGS.ima] });
    expect(out.apps[0].detectors[0].type).toBe('app_store_lookup');
    expect(out.apps[0].detectors[0].url).toBe(OLD_CONFIGS.ima.web_url);
  });

  it('electron_yml → electron_yml', () => {
    const out = migrateConfig({ apps: [OLD_CONFIGS.minimax_code] });
    expect(out.apps[0].detectors[0].type).toBe('electron_yml');
    expect(out.apps[0].detectors[0].url).toBe(OLD_CONFIGS.minimax_code.web_url);
  });

  it('api_json → api_json', () => {
    const out = migrateConfig({ apps: [OLD_CONFIGS.workbuddy] });
    expect(out.apps[0].detectors[0].type).toBe('api_json');
    expect(out.apps[0].detectors[0].url).toBe(OLD_CONFIGS.workbuddy.web_url);
  });

  it('qclaw_api → qclaw_api', () => {
    const out = migrateConfig({ apps: [OLD_CONFIGS.qclaw] });
    expect(out.apps[0].detectors[0].type).toBe('qclaw_api');
    expect(out.apps[0].detectors[0].url).toBe(OLD_CONFIGS.qclaw.web_url);
  });
});

// ─── 3. 顺序规则 ────────────────────────────────────────

describe('migrateConfig — 顺序规则', () => {
  it('sparkle_url 在最前', () => {
    const out = migrateConfig({ apps: [OLD_CONFIGS.codex] });
    expect(out.apps[0].detectors[0]).toEqual({
      type: 'sparkle_appcast', url: OLD_CONFIGS.codex.sparkle_url,
    });
    expect(out.apps[0].detectors).toHaveLength(1);  // brew_cask 空 → 不加 brew_formulae
  });

  it('sparkle + brew 同时存在 → sparkle 在前，brew 在最后', () => {
    const out = migrateConfig({ apps: [OLD_CONFIGS.codexbar] });
    const types = out.apps[0].detectors.map((d) => d.type);
    expect(types).toEqual(['sparkle_appcast', 'brew_formulae']);
    expect(out.apps[0].detectors[1].cask).toBe('codexbar');
  });

  it('web_type + brew_cask → web 在中，brew 在最后（fallback）', () => {
    const out = migrateConfig({ apps: [OLD_CONFIGS.kimi] });
    const types = out.apps[0].detectors.map((d) => d.type);
    expect(types).toEqual(['redirect_filename', 'brew_formulae']);
  });

  it('CC Switch 只有 brew_cask → 单个 brew_formulae', () => {
    const out = migrateConfig({ apps: [OLD_CONFIGS.cc_switch] });
    const types = out.apps[0].detectors.map((d) => d.type);
    expect(types).toEqual(['brew_formulae']);
    expect(out.apps[0].detectors[0].cask).toBe('cc-switch');
  });
});

// ─── 4. 整文件迁移（含 11 个 app 一起跑） ────────────────

describe('migrateConfigFile — 11 个 app 整文件迁移', () => {
  it('整 config.json 迁移后 .bak 存在 + 新文件每个 app 都有 detector', () => {
    const tmp = makeTempDir();
    const configPath = path.join(tmp, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(FULL_OLD_CONFIG, null, 2));

    const r = migrateConfigFile({ configPath });
    expect(r.migrated).toBe(true);
    expect(r.backupPath).toBe(configPath + '.bak');
    expect(r.config.apps).toHaveLength(11);

    // .bak 内容是原文件
    const backup = JSON.parse(fs.readFileSync(r.backupPath, 'utf-8'));
    expect(backup.apps).toHaveLength(11);
    expect(backup.apps[0].web_type).toBe('cursor_redirect');  // 确认是原内容

    // 新 config 每个 app 都有 detectors[]
    for (const a of r.config.apps) {
      expect(Array.isArray(a.detectors)).toBe(true);
      expect(a.detectors.length).toBeGreaterThan(0);
      // 不应有老字段
      expect(a).not.toHaveProperty('web_type');
      expect(a).not.toHaveProperty('web_url');
    }

    // 新 config 写回 config.json
    const rewritten = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(rewritten.apps).toHaveLength(11);
    expect(rewritten.apps[0].detectors[0].type).toBe('cursor_redirect');
  });

  it('迁移后 validateConfig valid=true', () => {
    const tmp = makeTempDir();
    const configPath = path.join(tmp, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(FULL_OLD_CONFIG, null, 2));
    const r = migrateConfigFile({ configPath });
    const v = validateConfig(r.config);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});

// ─── 5. 边界 ────────────────────────────────────────────

describe('migrateConfigFile — 边界', () => {
  it('文件不存在 → 不迁移，不报错', () => {
    const tmp = makeTempDir();
    const r = migrateConfigFile({ configPath: path.join(tmp, 'missing.json') });
    expect(r.migrated).toBe(false);
    expect(r.reason).toBe('file-not-found');
  });

  it('JSON 解析失败 → 抛 MigrationError', () => {
    const tmp = makeTempDir();
    const configPath = path.join(tmp, 'config.json');
    fs.writeFileSync(configPath, '{ bad json');
    expect(() => migrateConfigFile({ configPath })).toThrow(MigrationError);
  });

  it('已是新 schema → 不迁移', () => {
    const tmp = makeTempDir();
    const configPath = path.join(tmp, 'config.json');
    const newCfg = {
      check_on_launch: true,
      apps: [
        { name: 'A', bundle: 'A.app', download_url: '', detectors: [{ type: 'api_json', url: 'https://x' }] },
      ],
    };
    fs.writeFileSync(configPath, JSON.stringify(newCfg, null, 2));
    const r = migrateConfigFile({ configPath });
    expect(r.migrated).toBe(false);
    expect(r.reason).toBe('already-new');
  });

  it('空 apps → 不迁移', () => {
    const tmp = makeTempDir();
    const configPath = path.join(tmp, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ check_on_launch: true, apps: [] }));
    const r = migrateConfigFile({ configPath });
    expect(r.migrated).toBe(false);
    expect(r.reason).toBe('no-apps');
  });

  it('idempotent — 第二次跑不再迁移', () => {
    const tmp = makeTempDir();
    const configPath = path.join(tmp, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(FULL_OLD_CONFIG, null, 2));
    const r1 = migrateConfigFile({ configPath });
    expect(r1.migrated).toBe(true);
    const r2 = migrateConfigFile({ configPath });
    expect(r2.migrated).toBe(false);
    expect(r2.reason).toBe('already-new');
  });
});

// ─── 6. isOldSchemaApp helper ────────────────────────────

describe('isOldSchemaApp', () => {
  it('web_type 存在 → true', () => {
    expect(isOldSchemaApp({ name: 'X', web_type: 'api_json' })).toBe(true);
  });
  it('web_url 存在 → true', () => {
    expect(isOldSchemaApp({ name: 'X', web_url: 'https://x' })).toBe(true);
  });
  it('sparkle_url 存在 → true', () => {
    expect(isOldSchemaApp({ name: 'X', sparkle_url: 'https://x' })).toBe(true);
  });
  it('brew_cask 存在 → true', () => {
    expect(isOldSchemaApp({ name: 'X', brew_cask: 'x' })).toBe(true);
  });
  it('只有 detectors[] → false', () => {
    expect(isOldSchemaApp({ name: 'X', detectors: [{ type: 'api_json' }] })).toBe(false);
  });
  it('空 → false', () => {
    expect(isOldSchemaApp({})).toBe(false);
    expect(isOldSchemaApp(null)).toBe(false);
  });
});

// ─── 7. validateConfig / sanitizeConfig ─────────────────

describe('validateConfig', () => {
  it('空 input → 返 valid=false', () => {
    const v = validateConfig(null);
    expect(v.valid).toBe(false);
  });

  it('valid 11-老-migrate-后-config', () => {
    const cfg = migrateConfig(FULL_OLD_CONFIG);
    const v = validateConfig(cfg);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it('detectors type 不在白名单 → 报错但不抛', () => {
    const v = validateConfig({
      apps: [{ name: 'A', bundle: 'A.app', detectors: [{ type: 'nope' }] }],
    });
    expect(v.valid).toBe(false);
    expect(v.errors.join(' ')).toContain('unknown');
  });
});

describe('sanitizeConfig', () => {
  it('丢无效 app，保留有效 app', () => {
    const out = sanitizeConfig({
      check_on_launch: 'truthy',   // 不是 boolean → 默认 true
      apps: [
        { name: 'A', bundle: 'A.app', detectors: [{ type: 'api_json' }] },
        { name: '', bundle: '', detectors: [{ type: 'api_json' }] },  // 无效
        { name: 'B', bundle: 'B.app', detectors: [{ type: 'nope' }] },  // detector 无效
      ],
    });
    expect(out.check_on_launch).toBe(true);
    expect(out.apps).toHaveLength(1);
    expect(out.apps[0].name).toBe('A');
  });

  it('null input → 返默认值', () => {
    expect(sanitizeConfig(null)).toEqual({ check_on_launch: true, apps: [] });
  });

  // Phase 20: release_notes_url 字段 sanitize. 合法 URL 保留, 非法/缺失 → undefined.
  describe('Phase 20: release_notes_url', () => {
    it('合法 https URL → 保留', () => {
      const out = sanitizeConfig({
        apps: [{
          name: 'A', bundle: 'A.app',
          release_notes_url: 'https://example.com/changelog',
          detectors: [{ type: 'api_json' }],
        }],
      });
      expect(out.apps[0].release_notes_url).toBe('https://example.com/changelog');
    });

    it('空字符串 → undefined (不污染 output)', () => {
      const out = sanitizeConfig({
        apps: [{
          name: 'A', bundle: 'A.app',
          release_notes_url: '',
          detectors: [{ type: 'api_json' }],
        }],
      });
      expect(out.apps[0].release_notes_url).toBeUndefined();
    });

    it('缺失 → undefined', () => {
      const out = sanitizeConfig({
        apps: [{
          name: 'A', bundle: 'A.app',
          detectors: [{ type: 'api_json' }],
        }],
      });
      expect(out.apps[0].release_notes_url).toBeUndefined();
    });

    it('非 string (number / object) → undefined (不抛)', () => {
      const out = sanitizeConfig({
        apps: [{
          name: 'A', bundle: 'A.app',
          release_notes_url: 123,
          detectors: [{ type: 'api_json' }],
        }],
      });
      expect(out.apps[0].release_notes_url).toBeUndefined();
    });

    it('跟 download_url 独立 (允许只配 release_notes_url 不配 download_url)', () => {
      const out = sanitizeConfig({
        apps: [{
          name: 'A', bundle: 'A.app',
          release_notes_url: 'https://example.com/changelog',
          detectors: [{ type: 'api_json' }],
        }],
      });
      expect(out.apps[0].download_url).toBe('');
      expect(out.apps[0].release_notes_url).toBe('https://example.com/changelog');
    });
  });

  // Phase 21: bundle_changelog (boolean) sanitize
  describe('Phase 21: bundle_changelog', () => {
    it('true → 保留', () => {
      const out = sanitizeConfig({
        apps: [{ name: 'A', bundle: 'A.app', bundle_changelog: true, detectors: [{ type: 'api_json' }] }],
      });
      expect(out.apps[0].bundle_changelog).toBe(true);
    });

    it('false → undefined (不污染 output)', () => {
      const out = sanitizeConfig({
        apps: [{ name: 'A', bundle: 'A.app', bundle_changelog: false, detectors: [{ type: 'api_json' }] }],
      });
      expect(out.apps[0].bundle_changelog).toBeUndefined();
    });

    it('缺失 → undefined', () => {
      const out = sanitizeConfig({
        apps: [{ name: 'A', bundle: 'A.app', detectors: [{ type: 'api_json' }] }],
      });
      expect(out.apps[0].bundle_changelog).toBeUndefined();
    });

    it('非 boolean (string / number) → undefined (不抛)', () => {
      const out1 = sanitizeConfig({
        apps: [{ name: 'A', bundle: 'A.app', bundle_changelog: 'yes', detectors: [{ type: 'api_json' }] }],
      });
      expect(out1.apps[0].bundle_changelog).toBeUndefined();
      const out2 = sanitizeConfig({
        apps: [{ name: 'A', bundle: 'A.app', bundle_changelog: 1, detectors: [{ type: 'api_json' }] }],
      });
      expect(out2.apps[0].bundle_changelog).toBeUndefined();
    });
  });

  // Phase 24: check_interval_hours
  describe('Phase 24: check_interval_hours', () => {
    it('缺省 → 默认 6', () => {
      const out = sanitizeConfig({ apps: [] });
      expect(out.notifications.check_interval_hours).toBe(6);
    });

    it('显式 0 → 0 (合法, 关闭 auto-check)', () => {
      const out = sanitizeConfig({
        apps: [],
        notifications: { check_interval_hours: 0 },
      });
      expect(out.notifications.check_interval_hours).toBe(0);
    });

    it('100 → clamp 到 24', () => {
      const out = sanitizeConfig({
        apps: [],
        notifications: { check_interval_hours: 100 },
      });
      expect(out.notifications.check_interval_hours).toBe(24);
    });

    it('负数 → clamp 到 0', () => {
      const out = sanitizeConfig({
        apps: [],
        notifications: { check_interval_hours: -5 },
      });
      expect(out.notifications.check_interval_hours).toBe(0);
    });

    it('小数 → floor (6.7 → 6)', () => {
      const out = sanitizeConfig({
        apps: [],
        notifications: { check_interval_hours: 6.7 },
      });
      expect(out.notifications.check_interval_hours).toBe(6);
    });

    it('非法类型 (string "abc") → fallback 6', () => {
      const out = sanitizeConfig({
        apps: [],
        notifications: { check_interval_hours: 'abc' },
      });
      expect(out.notifications.check_interval_hours).toBe(6);
    });

    it('null / undefined → fallback 6', () => {
      const out1 = sanitizeConfig({
        apps: [],
        notifications: { check_interval_hours: null },
      });
      expect(out1.notifications.check_interval_hours).toBe(6);
      const out2 = sanitizeConfig({
        apps: [],
        notifications: { check_interval_hours: undefined },
      });
      expect(out2.notifications.check_interval_hours).toBe(6);
    });

    it('NaN / Infinity → fallback 6', () => {
      const out1 = sanitizeConfig({
        apps: [],
        notifications: { check_interval_hours: NaN },
      });
      expect(out1.notifications.check_interval_hours).toBe(6);
      const out2 = sanitizeConfig({
        apps: [],
        notifications: { check_interval_hours: Infinity },
      });
      expect(out2.notifications.check_interval_hours).toBe(6);
    });
  });
});
