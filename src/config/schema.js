/**
 * src/config/schema.js
 *
 * 新 config schema 验证（spec §5）。
 *
 * 形态：
 *   {
 *     "check_on_launch": true,
 *     "apps": [
 *       {
 *         "name": "Cursor",
 *         "bundle": "Cursor.app",
 *         "download_url": "https://...",
 *         "detectors": [
 *           { "type": "cursor_redirect", "url": "...", "timeout": 5000 },
 *           { "type": "app_update_yml" },
 *           { "type": "brew_formulae", "cask": "cursor" }
 *         ]
 *       }
 *     ]
 *   }
 *
 * 验证策略：best-effort。无效条目会被收集到 errors[]，但**不抛**——
 * migrate 流程需要在 fallback 阶段容错；schema 阶段只做记录。
 */

const VALID_DETECTOR_TYPES = new Set([
  "brew_formulae",
  "brew_local_cask",
  "sparkle_appcast",
  "electron_yml",
  "electron_zip_probe",
  "app_store_lookup",
  "api_json",
  "redirect_filename",
  "cursor_redirect",
  "qclaw_api",
  "app_update_yml",
  "html_changelog",
  "winget_show",
  "github_release",
]);

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function validateDetector(det, index, appName) {
  const errs = [];
  if (!isPlainObject(det)) {
    errs.push(`apps[${appName}].detectors[${index}]: not an object`);
    return errs;
  }
  if (!isNonEmptyString(det.type)) {
    errs.push(`apps[${appName}].detectors[${index}].type: missing`);
  } else if (!VALID_DETECTOR_TYPES.has(det.type)) {
    errs.push(
      `apps[${appName}].detectors[${index}].type: unknown '${det.type}'`,
    );
  }
  if (
    det.timeout != null &&
    (typeof det.timeout !== "number" || det.timeout <= 0)
  ) {
    errs.push(
      `apps[${appName}].detectors[${index}].timeout: must be positive number`,
    );
  }
  if (det.url != null && !isNonEmptyString(det.url)) {
    errs.push(
      `apps[${appName}].detectors[${index}].url: must be non-empty string`,
    );
  }
  if (det.cask != null && !isNonEmptyString(det.cask)) {
    errs.push(
      `apps[${appName}].detectors[${index}].cask: must be non-empty string`,
    );
  }
  if (det.field != null && !isNonEmptyString(det.field)) {
    errs.push(
      `apps[${appName}].detectors[${index}].field: must be non-empty string`,
    );
  }
  return errs;
}

function validateApp(app, index) {
  const errs = [];
  const label = `${app && app.name ? app.name : `#${index}`}`;
  if (!isPlainObject(app)) {
    errs.push(`apps[${index}]: not an object`);
    return errs;
  }
  if (!isNonEmptyString(app.name)) {
    errs.push(`apps[${index}].name: missing`);
  }
  if (!isNonEmptyString(app.bundle)) {
    errs.push(`apps[${label}].bundle: missing`);
  }
  if (app.detectors == null) {
    errs.push(`apps[${label}].detectors: missing`);
  } else if (!Array.isArray(app.detectors)) {
    errs.push(`apps[${label}].detectors: must be array`);
  } else if (app.detectors.length === 0) {
    errs.push(
      `apps[${label}].detectors: empty (at least one detector required)`,
    );
  } else {
    app.detectors.forEach((det, i) => {
      errs.push(...validateDetector(det, i, app.name || label));
    });
  }
  return errs;
}

/**
 * 验证 config；返回 { valid: boolean, errors: string[], config }。
 * 总是返回 config 字段（即使是原样），便于 fallback。
 */
function validateConfig(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { valid: false, errors: ["config: not an object"], config: null };
  }
  if (
    input.check_on_launch != null &&
    typeof input.check_on_launch !== "boolean"
  ) {
    errors.push("check_on_launch: must be boolean");
  }
  if (input.apps == null) {
    return { valid: errors.length === 0, errors, config: input };
  }
  if (!Array.isArray(input.apps)) {
    errors.push("apps: must be array");
    return { valid: false, errors, config: input };
  }
  input.apps.forEach((app, i) => {
    errors.push(...validateApp(app, i));
  });
  return { valid: errors.length === 0, errors, config: input };
}

/**
 * 轻量 sanitize：把非法 detector 静默丢弃，保住能用的部分。
 * 如果整个 app 都没法用，就丢掉这个 app。
 */
function sanitizeConfig(input) {
  if (!isPlainObject(input)) {
    return { check_on_launch: true, apps: [] };
  }
  const col =
    typeof input.check_on_launch === "boolean" ? input.check_on_launch : true;
  const apps = Array.isArray(input.apps) ? input.apps : [];
  const cleanApps = [];
  for (const a of apps) {
    if (!isPlainObject(a)) continue;
    if (!isNonEmptyString(a.name) || !isNonEmptyString(a.bundle)) continue;
    const dets = Array.isArray(a.detectors) ? a.detectors : [];
    const cleanDets = dets.filter(
      (d) =>
        isPlainObject(d) &&
        isNonEmptyString(d.type) &&
        VALID_DETECTOR_TYPES.has(d.type),
    );
    if (cleanDets.length === 0) continue;
    // Phase 9: sanitize 也保留 version_sources. 不认识/不合法的 type 静默丢弃.
    const validVS = new Set([
      "installed_json",
      "plist",
      "regex_file",
      "registry_version",
      "winget_list",
      "windows_app_yml",
    ]);
    const vs = Array.isArray(a.version_sources) ? a.version_sources : [];
    const cleanVS = vs
      .filter(
        (s) =>
          isPlainObject(s) && isNonEmptyString(s.type) && validVS.has(s.type),
      )
      .map((s) => {
        const out = { type: s.type };
        if (s.path) out.path = String(s.path);
        if (s.pattern) out.pattern = String(s.pattern);
        if (isNonEmptyString(s.reg_path)) out.reg_path = s.reg_path;
        if (isNonEmptyString(s.winget_id)) out.winget_id = s.winget_id;
        if (isNonEmptyString(s.platform)) out.platform = s.platform;
        return out;
      });
    cleanApps.push({
      name: a.name,
      bundle: a.bundle,
      download_url: isNonEmptyString(a.download_url) ? a.download_url : "",
      // Phase 20: per-app 可选 release notes URL. 多数 app 都不公开机器可读的 release notes,
      // 但人看的 changelog 页/官网 changelog 区通常有. 配这个 URL 后, UI 没拉到 changelog 时
      // 会展示 "查看 release notes ↗" 链接. fallback 到 download_url.
      release_notes_url: isNonEmptyString(a.release_notes_url)
        ? a.release_notes_url
        : undefined,
      // Phase 21: 是否读 app bundle 内的 changelog 文件 (CHANGELOG.md 等).
      bundle_changelog: a.bundle_changelog === true ? true : undefined,
      // P2: Windows 标识字段
      win_bundle: isNonEmptyString(a.win_bundle) ? a.win_bundle : undefined,
      winget_id: isNonEmptyString(a.winget_id) ? a.winget_id : undefined,
      detectors: cleanDets.map((d) => {
        const out = { type: d.type };
        if (isNonEmptyString(d.url)) out.url = d.url;
        if (isNonEmptyString(d.cask)) out.cask = d.cask;
        if (isNonEmptyString(d.field)) out.field = d.field;
        if (isNonEmptyString(d.id)) out.id = d.id;
        if (isNonEmptyString(d.platform)) out.platform = d.platform;
        if (typeof d.timeout === "number" && d.timeout > 0)
          out.timeout = d.timeout;
        if (isNonEmptyString(d.section_pattern))
          out.section_pattern = d.section_pattern;
        if (isNonEmptyString(d.section_end)) out.section_end = d.section_end;
        if (isNonEmptyString(d.version_pattern))
          out.version_pattern = d.version_pattern;
        return out;
      }),
      version_sources: cleanVS.length > 0 ? cleanVS : undefined,
    });
  }

  // Phase 17: 通知策略 (quiet hours + cooldown) sanitize. 不存在/不合法用 null 让 caller fallback.
  const rawNotif = isPlainObject(input.notifications)
    ? input.notifications
    : {};
  // Phase 24: 自动检查间隔 (小时). 默认 6, clamp 0-24, 0 = 关闭.
  //   - 非法类型 (string/NaN/null/undefined) → fallback 6
  //   - 小数 → Math.floor
  //   - 负数 / > 24 → clamp 到 [0, 24]
  let checkIntervalHours = rawNotif.check_interval_hours;
  if (
    typeof checkIntervalHours !== "number" ||
    !Number.isFinite(checkIntervalHours)
  ) {
    checkIntervalHours = 6;
  } else {
    checkIntervalHours = Math.floor(checkIntervalHours);
    if (checkIntervalHours < 0) checkIntervalHours = 0;
    if (checkIntervalHours > 24) checkIntervalHours = 24;
  }
  const notifications = {
    quiet_hours_start: isNonEmptyString(rawNotif.quiet_hours_start)
      ? rawNotif.quiet_hours_start
      : null,
    quiet_hours_end: isNonEmptyString(rawNotif.quiet_hours_end)
      ? rawNotif.quiet_hours_end
      : null,
    cooldown_hours:
      typeof rawNotif.cooldown_hours === "number" &&
      rawNotif.cooldown_hours >= 0
        ? rawNotif.cooldown_hours
        : null,
    check_interval_hours: checkIntervalHours,
  };

  return {
    check_on_launch: col,
    apps: cleanApps,
    notifications,
    aiSessions: _sanitizeAISessions(input.aiSessions),
  };
}

/**
 * Phase B3c: AI sessions 配置 sanitize. 老 config (无 aiSessions 字段) 走默认:
 *   enabled=false, provider='ollama', ollama host='http://localhost:11434',
 *   ollama model='qwen3.5:9b', cloud=null.
 *
 * spec §3.2 / §4.4:
 *   {
 *     enabled: bool,
 *     provider: 'ollama' | 'openai' | 'anthropic' | 'deepseek' | 'minimax',
 *     ollama: { host: string, model: string },
 *     cloud: { providerId, model, apiKeyRef? }  // B6 才用
 *   }
 */
function _sanitizeAISessions(raw) {
  const o = isPlainObject(raw) ? raw : {};
  const enabled = o.enabled === true; // 缺省 false (opt-in, 不影响老用户)
  const provider = isNonEmptyString(o.provider) ? o.provider : "ollama";
  const ollamaRaw = isPlainObject(o.ollama) ? o.ollama : {};
  const ollama = {
    host: isNonEmptyString(ollamaRaw.host)
      ? ollamaRaw.host
      : "http://localhost:11434",
    model: isNonEmptyString(ollamaRaw.model) ? ollamaRaw.model : "qwen3.5:9b",
  };
  const cloudRaw = isPlainObject(o.cloud) ? o.cloud : null;
  const cloud = cloudRaw
    ? {
        providerId: isNonEmptyString(cloudRaw.providerId)
          ? cloudRaw.providerId
          : null,
        model: isNonEmptyString(cloudRaw.model) ? cloudRaw.model : null,
      }
    : null;
  // v2.5.2 (startup-30s fix): 把 phase B 额外字段也 sanitize, 防止 schema drop
  // 导致 wiring 拿不到 backfillDays (fallback 到 DEFAULT=7, 启动 30s 复现).
  // 字段集 (跟 wiring.mergeAISessionsConfig 字段对齐):
  //   backfillDays: number (default 1, 跟 main/index.js 一致)
  //   backfillOnStart: boolean (default true)
  //   locale: string (default 'zh-CN')
  const backfillDays =
    Number.isFinite(o.backfillDays) && o.backfillDays > 0
      ? Math.floor(o.backfillDays)
      : 1;
  const backfillOnStart = o.backfillOnStart !== false; // 缺省 true
  const locale = isNonEmptyString(o.locale) ? o.locale : "zh-CN";
  return {
    enabled,
    provider,
    ollama,
    cloud,
    backfillDays,
    backfillOnStart,
    locale,
  };
}

module.exports = {
  validateConfig,
  sanitizeConfig,
  VALID_DETECTOR_TYPES,
};
