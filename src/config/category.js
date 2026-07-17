/**
 * src/config/category.js
 *
 * Phase A1b (App Categorization, Feature A): 静态 map + 验证 + 纯函数 API.
 * Phase A3 (LLM classify, Step B): heuristic + async LLM fallback 三层查找.
 *
 * 数据源 (2 选 1):
 *   1) 外部注入: setData({ cats, map, source })  ←  推荐路径
 *      - main 进程: 启动时 fs.readFileSync JSON + 调 setData
 *      - renderer:   esbuild 静态 import JSON + 调 setData
 *   2) 硬编码 DEFAULT: 没调 setData 时, getCategory 全部返回 'other',
 *      getAllCategories 返回 DEFAULT_CATEGORIES (永 display, 不崩).
 *
 * 设计原因:
 *   - 不在 module 顶层 require('fs') / require('path'), 因为 renderer
 *     (esbuild bundle, 跑在 chromium) 没有 node built-in (plan A1b 风险).
 *   - main 进程 fs 读 + 注入; renderer esbuild inline JSON + 注入.
 *
 * API (跟 spec §4.1 一致):
 *   - setData({ cats, map, source })              → 外部注入数据
 *   - getCategory(appName)            → categoryId  ('other' 兜底)
 *   - getAllCategories()              → Category[] (按 order asc)
 *   - getCategoryById(id)             → Category | undefined
 *   - getCategoryByName(name)         → Category ('other' 兜底)
 *   - validateCategoryMap()           → { ok, errors[], warnings[] }
 *   - getCategoryTabsWithCount(map)   → Tab[]  (sort + hide-empty)
 *   - classifyByHeuristic(app)        → categoryId | null
 *   - classifyByLLM(apps, opts)       → Promise<{[appName]: categoryId}>
 *   - setLLMCache({ appName: catId }) 外部注入 LLM 分类结果 (从 state.json reload)
 *   - getLLMCache()                   → {[appName]: catId}  (renderer / 测试用)
 *
 * CommonJS 风格, 跟 src/config/{schema,migrate}.js 保持一致.
 */

const DEFAULT_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'ai',      name: 'AI 工具', order: 1 }),
  Object.freeze({ id: 'dev',     name: '开发者',  order: 2 }),
  Object.freeze({ id: 'browser', name: '浏览器',  order: 3 }),
  Object.freeze({ id: 'comms',   name: '沟通',    order: 4 }),
  Object.freeze({ id: 'media',   name: '媒体',    order: 5 }),
  Object.freeze({ id: 'notes',   name: '笔记',    order: 6 }),
  Object.freeze({ id: 'system',  name: '系统',    order: 7 }),
  Object.freeze({ id: 'other',   name: '其他',    order: 99 }),
]);

// ── Step B (LLM classify): heuristic 关键词 → 分类 id ──
// 顺序敏感: 先匹配先赢. 每个 entry: { pattern, cat }
// pattern 走 String.prototype.test (regex) — 简单 + 容易单测.
const HEURISTIC_RULES = Object.freeze([
  // AI 工具 — 已知产品名 + 通用词
  { pattern: /\b(cursor|claude|chatgpt|kimi|qoder|qclaw|qoderwork|codex|minimax|marvis|ima\.?copilot|ima|workbuddy|codebuddy|gpt|gemini|copilot|llm)\b/i, cat: 'ai' },
  // Dev — IDE / 容器 / API / shell
  { pattern: /\b(vs\s*code|vscode|iterm2|iterm|warp|docker|postman|insomnia|tableplus|sequel\s*pro|dbeaver|zed|sublime|webstorm|phpstorm|pycharm|intellij|android\s*studio|github\s*desktop|sourcetree|gitkraken)\b/i, cat: 'dev' },
  { pattern: /dev[-_]?tools?|developer\s*tool|^dev$/i, cat: 'dev' },
  // Browser
  { pattern: /\b(chrome|chromium|firefox|safari|edge|arc|brave|opera|vivaldi|tor\s*browser|orion)\b/i, cat: 'browser' },
  // Comms
  { pattern: /\b(slack|discord|wechat|teams|telegram|line|whatsapp|signal|skype|zoom|meet|lark|feishu|mail|mailmate|spark|thunderbird)\b/i, cat: 'comms' },
  { pattern: /(微信|钉钉|dingtalk)/i, cat: 'comms' },  // 中文 keyword 单独放
  // Media
  { pattern: /\b(figma|sketch|spotify|iina|apple\s*music|music|vlc|mpv|obs|handbrake|gimp|photoshop|illustrator|lightroom|canva|procreate|affinity)\b/i, cat: 'media' },
  // Notes
  { pattern: /\b(obsidian|notion|things|evernote|onenote|bear|typora|roam|logseq|craft|simplenote|standard\s*notes|joplin|apple\s*notes)\b/i, cat: 'notes' },
  // System — 实用 / 工具 / 密码 / 效率
  { pattern: /\b(raycast|alfred|1password|bartender|magnet|mosaic|cleanmymac|appcleaner|the\s*unarchiver|keka|transmit|cryptomator|veracrypt|bitwarden|lastpass|karabiner|keyboard\s*maestro|bettertouchtool|scroll\s*reverser|hidden\s*bar|stats|menubar)\b/i, cat: 'system' },
  // URL host 兜底 — download_url / website 域名
]);

// ── Module-level 缓存 (setData 时构建, 之后只读) ──
let APP_TO_CATEGORY = new Map();
let CATEGORIES_BY_ID = new Map();
let CATEGORIES_SORTED = [...DEFAULT_CATEGORIES];
let _LOAD_STATUS = { ok: true, usedFallback: true, errors: [], warnings: ['module not yet initialized via setData'] };
// Step B: LLM classify 结果缓存 (异步注入, getCategory 走 fallback 时查这里)
let LLM_CLASSIFY_CACHE = new Map();

function _isCategoryShape(c) {
  return (
    c != null
    && typeof c === 'object'
    && typeof c.id === 'string'
    && c.id.length > 0
    && typeof c.name === 'string'
    && c.name.length > 0
    && typeof c.order === 'number'
    && Number.isFinite(c.order)
  );
}

function _build(cats, map, source) {
  const status = { ok: true, usedFallback: false, errors: [], warnings: [] };

  // 1. Filter + sort categories
  const valid = (Array.isArray(cats) ? cats : []).filter(_isCategoryShape);
  if (!valid.find((c) => c.id === 'other')) {
    // 兜底: 任何 'other' 缺失都强行补
    valid.push({ id: 'other', name: '其他', order: 99 });
    status.warnings.push(`[${source}] 'other' category missing, appended fallback`);
  }
  const sorted = valid.slice().sort((a, b) => a.order - b.order);
  const byId = new Map(sorted.map((c) => [c.id, c]));

  // 2. Build app → categoryId
  const appToCat = new Map();
  const entries = (map && typeof map === 'object' && !Array.isArray(map)) ? Object.entries(map) : [];
  for (const [rawName, catId] of entries) {
    if (typeof rawName !== 'string' || rawName.length === 0) {
      status.warnings.push(`[${source}] app-category.json: invalid app name key, skipping`);
      continue;
    }
    if (typeof catId !== 'string' || !byId.has(catId)) {
      status.warnings.push(
        `[${source}] app-category.json: app '${rawName}' → unknown categoryId '${catId}', skipping`
      );
      continue;
    }
    appToCat.set(rawName.toLowerCase(), catId);
  }

  APP_TO_CATEGORY = appToCat;
  CATEGORIES_BY_ID = byId;
  CATEGORIES_SORTED = sorted;
  _LOAD_STATUS = status;
}

/**
 * 公开 API: 外部注入 category data. main 进程和 renderer 各自调一次.
 *
 * @param {object} opts
 * @param {Array}  opts.cats     Category[]  (id, name, icon, order)
 * @param {object} opts.map      { appName: categoryId }
 * @param {string} [opts.source] 'disk' | 'inline' | 'fallback' (仅 log 用)
 */
function setData({ cats, map, source } = {}) {
  _build(cats || DEFAULT_CATEGORIES, map || {}, source || 'inline');
  // 启动期 console 报告 (main + renderer 都会看到)
  const status = _LOAD_STATUS;
  if (status.warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[category] load warnings:', status.warnings);
  }
}

// ── 6 API ──

/**
 * 查 app 的分类. 找不到 → 'other' (兜底, 永不崩).
 * Step B: 三层查找 —
 *   1) setData 注入的静态 map
 *   2) LLM classify cache (setLLMCache 注入, main 进程启动时填)
 *   3) 'other' 兜底
 * 注: heuristic **不**在这里跑 — heuristic 是给 main 进程"启动时给 LLM 提示"用,
 *     不在 hot path 上做 regex 匹配 (perf 考虑 + LLM 才有更好的结果).
 * @param {string} appName
 * @returns {string} categoryId
 */
function getCategory(appName) {
  if (typeof appName !== 'string' || appName.length === 0) return 'other';
  const key = appName.toLowerCase();
  // 1. 静态 map
  const fromStatic = APP_TO_CATEGORY.get(key);
  if (fromStatic) return fromStatic;
  // 2. LLM cache
  const fromLLM = LLM_CLASSIFY_CACHE.get(key);
  if (fromLLM) return fromLLM;
  // 3. 兜底
  return 'other';
}

/**
 * Step B: heuristic 关键词分类. 纯函数 — main 启动时用, 给 LLM 提示
 * "这个 app 我猜是 X, 你确认下".
 * 不在 getCategory 走 — 因为 (1) regex 慢, (2) LLM 准确率高.
 *
 * @param {object} app      app config 块 (config.json 里的 app 元素)
 * @param {string} app.name     必填
 * @param {string} [app.bundle]  e.g. 'Cursor.app'
 * @param {string} [app.download_url]  e.g. 'https://cursor.com/...'
 * @returns {string|null}  categoryId 或 null (没匹配)
 */
function classifyByHeuristic(app) {
  if (!app || typeof app !== 'object') return null;
  const name = typeof app.name === 'string' ? app.name : '';
  const bundle = typeof app.bundle === 'string' ? app.bundle : '';
  const url = typeof app.download_url === 'string' ? app.download_url : '';
  const haystack = [name, bundle, url].filter(Boolean).join(' ');
  if (haystack.length === 0) return null;
  for (const rule of HEURISTIC_RULES) {
    if (rule.pattern.test(haystack)) return rule.cat;
  }
  return null;
}

/**
 * Step B: 把 LLM 分类结果注入 cache. main 启动时同步调一次 (用户在 q3 选的
 * blocking-startup-ok 路径). 单条 / 批量都行.
 *
 * @param {object} map  { [appName: string]: categoryId }
 */
function setLLMCache(map) {
  if (!map || typeof map !== 'object') return;
  for (const [k, v] of Object.entries(map)) {
    if (typeof k !== 'string' || k.length === 0) continue;
    if (typeof v !== 'string' || !CATEGORIES_BY_ID.has(v)) continue;
    LLM_CLASSIFY_CACHE.set(k.toLowerCase(), v);
  }
}

/**
 * Step B: 读 LLM cache. 一次拿全 (renderer / 测试用).
 * @returns {{[appName: string]: string}}
 */
function getLLMCache() {
  const out = {};
  for (const [k, v] of LLM_CLASSIFY_CACHE.entries()) {
    out[k] = v;
  }
  return out;
}

/**
 * Step B: 清空 LLM cache. 测试用, 生产代码不该调 (实际永远累加).
 * @private
 */
function _clearLLMCache() {
  LLM_CLASSIFY_CACHE.clear();
}

/**
 * Step B: 调 LLM 批量分类一组 app. 单次 prompt 出所有 app 的 cat, 比逐个
 * 调省 5-10x 延迟. 失败 (LLM 不可达 / 解析失败) → 返 {} (不 throw, 上层
 * 走 heuristic / other 兜底).
 *
 * 设计选择: 不直接 require ollama provider, 而是接 llmCaller 函数 (DI),
 * 让单测能 mock. main 进程在调用方注入真 OllamaSummarizer.
 *
 * @param {Array<{name: string, bundle?: string, download_url?: string, _heuristic?: string}>} apps
 *        _heuristic 字段: 调用方预跑的 heuristic 提示, 让 LLM 优先参考
 * @param {object} [opts]
 * @param {function} [opts.llmCaller]  async (systemMsg, userMsg) => string
 *                                     default: 不接, 立即返 {}
 * @param {number} [opts.timeoutMs=30000]  LLM 调用超时
 * @returns {Promise<{[appName: string]: string}>}
 */
async function classifyByLLM(apps, opts = {}) {
  if (!Array.isArray(apps) || apps.length === 0) return {};
  const llmCaller = typeof opts.llmCaller === 'function' ? opts.llmCaller : null;
  if (!llmCaller) {
    // 没人注入 caller — 跳过 LLM 阶段, 返 {}
    return {};
  }
  const validCatIds = CATEGORIES_SORTED.map((c) => c.id);
  const systemMsg = typeof opts.systemMsg === 'string' && opts.systemMsg.trim()
    ? opts.systemMsg.trim()
    : [
      '你是一个 app 分类助手.',
      `你只能输出以下 categoryId 之一: ${validCatIds.join(', ')}`,
      '对每个 app 选最合适的一个. 输出严格 JSON 格式: {"appName": "categoryId", ...}',
      '不要任何额外文字、markdown fence 或注释.',
    ].join(' ');
  const userLines = ['下面是待分类的 app 列表 (含启发式提示, 你可参考但独立判断):', ''];
  for (const a of apps) {
    if (!a || typeof a.name !== 'string' || a.name.length === 0) continue;
    const heur = a._heuristic ? ` [提示: ${a._heuristic}]` : '';
    const bundle = a.bundle ? ` (bundle: ${a.bundle})` : '';
    const url = a.download_url ? ` (url: ${a.download_url})` : '';
    userLines.push(`- ${a.name}${bundle}${url}${heur}`);
  }
  const userMsg = userLines.join('\n');
  let raw;
  try {
    const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 30_000;
    raw = await Promise.race([
      llmCaller(systemMsg, userMsg),
      new Promise((_, reject) => setTimeout(() => reject(new Error('classifyByLLM: timeout')), timeoutMs)),
    ]);
  } catch (err) {
    // 网络/超时 — 不 throw, 上层用 heuristic
    return {};
  }
  if (typeof raw !== 'string') return {};
  // 提取 JSON — LLM 偶尔会包 ```json ... ```; 兼容两种
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0 || jsonEnd <= jsonStart) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  // 过滤: 只保留合法 catId
  const out = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof k !== 'string' || k.length === 0) continue;
    if (typeof v !== 'string' || !CATEGORIES_BY_ID.has(v)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * 拿全部分类 (按 order asc). 返回新数组, 不暴露内部引用.
 * @returns {Array<{id: string, name: string, icon: string, order: number}>}
 */
function getAllCategories() {
  return CATEGORIES_SORTED.map((c) => ({ ...c }));
}

/**
 * 按 id 查分类. 找不到 → undefined (跟 getCategory 兜底 'other' 区分).
 * @param {string} id
 * @returns {object|undefined}
 */
function getCategoryById(id) {
  if (typeof id !== 'string') return undefined;
  const c = CATEGORIES_BY_ID.get(id);
  return c ? { ...c } : undefined;
}

/**
 * 按显示名 (e.g. "AI 工具") 查分类. 找不到 → 'other' Category.
 * @param {string} name
 * @returns {object}
 */
function getCategoryByName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    return { ...(CATEGORIES_BY_ID.get('other') || { id: 'other', name: '其他', order: 99 }) };
  }
  for (const c of CATEGORIES_SORTED) {
    if (c.name === name) return { ...c };
  }
  return { ...(CATEGORIES_BY_ID.get('other') || { id: 'other', name: '其他', order: 99 }) };
}

/**
 * 验证当前 map. 启动期自动跑一次 (启动 log 已含报告), 也可手动调.
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
function validateCategoryMap() {
  const errors = [];
  const warnings = [];
  if (CATEGORIES_SORTED.length !== DEFAULT_CATEGORIES.length) {
    warnings.push(`expected ${DEFAULT_CATEGORIES.length} categories, got ${CATEGORIES_SORTED.length}`);
  }
  if (!CATEGORIES_BY_ID.has('other')) {
    errors.push('"other" category is required (fallback for unmapped apps)');
  }
  // id 唯一
  const ids = new Set();
  for (const c of CATEGORIES_SORTED) {
    if (ids.has(c.id)) errors.push(`duplicate category id: '${c.id}'`);
    ids.add(c.id);
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * @param {Map<string, any>|Iterable<string>} results  Map<appName, result> 或单纯的可迭代 name 集合
 * @returns {Array<{id: string, name: string, count: number, title: string}>}
 */
function getCategoryTabsWithCount(results) {
  const counts = new Map();
  let total = 0;
  const names =
    results && typeof results.keys === 'function' ? results.keys() : results;
  if (names && typeof names[Symbol.iterator] === 'function') {
    for (const name of names) {
      const n = typeof name === 'string' ? name : '';
      const cat = getCategory(n);
      counts.set(cat, (counts.get(cat) || 0) + 1);
      total += 1;
    }
  }

  const tabs = [];
  // 1) "全部" 永远第一
  tabs.push({ id: 'all', name: '全部', count: total, title: '所有 app' });

  // 2) 其他 7 个分类 (除 'other'), 按 count desc → order asc
  const cats = CATEGORIES_SORTED.filter((c) => c.id !== 'other');
  cats.sort((a, b) => {
    const ca = counts.get(a.id) || 0;
    const cb = counts.get(b.id) || 0;
    if (ca !== cb) return cb - ca;
    return a.order - b.order;
  });
  for (const cat of cats) {
    const count = counts.get(cat.id) || 0;
    if (count === 0) continue;  // hide empty
    tabs.push({ id: cat.id, name: cat.name, count, title: cat.name });
  }

  // 3) "其他" 永远在末
  tabs.push({ id: 'other', name: '其他', count: counts.get('other') || 0, title: '其他' });
  return tabs;
}

module.exports = {
  setData,
  getCategory,
  getAllCategories,
  getCategoryById,
  getCategoryByName,
  validateCategoryMap,
  getCategoryTabsWithCount,
  // Step B (LLM classify)
  classifyByHeuristic,
  classifyByLLM,
  setLLMCache,
  getLLMCache,
  // 测试/调试用 (不应在生产代码调)
  _LOAD_STATUS: () => _LOAD_STATUS,
  _DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
  _HEURISTIC_RULES: HEURISTIC_RULES,
  _clearLLMCache,
};
