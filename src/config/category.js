/**
 * src/config/category.js
 *
 * Phase A1b (App Categorization, Feature A): 静态 map 加载 + 验证 + 纯函数 API.
 *
 * 数据源:
 *   - config/categories.json   (8 类元数据)
 *   - config/app-category.json (24 app 1:1 映射)
 *
 * 降级:
 *   - 任意文件读不到 / parse 错 → log error, 用文件底部硬编码 DEFAULT
 *   - 任一 mapping 引用不存在的 categoryId → log warn + 跳过该 entry
 *   - 'other' 分类必须存在 (启动期保证)
 *
 * API (跟 spec §4.1 一致):
 *   - getCategory(appName)            → categoryId  ('other' 兜底)
 *   - getAllCategories()              → Category[] (按 order asc)
 *   - getCategoryById(id)             → Category | undefined
 *   - getCategoryByName(name)         → Category ('other' 兜底)
 *   - validateCategoryMap()           → { ok, errors[], warnings[] }
 *   - getCategoryTabsWithCount(map)   → Tab[]  (sort + hide-empty)
 *
 * CommonJS 风格, 跟 src/config/{schema,migrate}.js 保持一致. main 进程 +
 * renderer (esbuild bundle) 都直接 require().
 */

const fs = require('fs');
const path = require('path');

// 仓库根: src/config/category.js → ../../config
const CONFIG_DIR = path.resolve(__dirname, '..', '..', 'config');
const CATEGORIES_PATH = path.join(CONFIG_DIR, 'categories.json');
const MAPPING_PATH = path.join(CONFIG_DIR, 'app-category.json');

// 硬编码 fallback, 跟 config/categories.json schema 严格一致 (spec §3.3).
// 仅 fallback 用; 正常路径从磁盘读.
const DEFAULT_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'ai',      name: 'AI 工具', icon: '🤖', order: 1 }),
  Object.freeze({ id: 'dev',     name: '开发者',  icon: '🛠', order: 2 }),
  Object.freeze({ id: 'browser', name: '浏览器',  icon: '🌐', order: 3 }),
  Object.freeze({ id: 'comms',   name: '沟通',    icon: '💬', order: 4 }),
  Object.freeze({ id: 'media',   name: '媒体',    icon: '🎨', order: 5 }),
  Object.freeze({ id: 'notes',   name: '笔记',    icon: '📝', order: 6 }),
  Object.freeze({ id: 'system',  name: '系统',    icon: '🔧', order: 7 }),
  Object.freeze({ id: 'other',   name: '其他',    icon: '📦', order: 99 }),
]);

const DEFAULT_MAPPING = Object.freeze({
  cursor: 'ai', claude: 'ai', chatgpt: 'ai',
  raycast: 'system',
  iterm2: 'dev', vscode: 'dev', docker: 'dev', postman: 'dev',
  chrome: 'browser', firefox: 'browser', arc: 'browser',
  slack: 'comms', discord: 'comms', wechat: 'comms',
  figma: 'media', sketch: 'media', spotify: 'media', iina: 'media',
  obsidian: 'notes', notion: 'notes', things: 'notes',
  alfred: 'system', '1password': 'system', bartender: 'system',
});

// ── Module-level 缓存 (启动期一次性构建, 不 hot reload) ──
let APP_TO_CATEGORY = new Map();
let CATEGORIES_BY_ID = new Map();
let CATEGORIES_SORTED = [];
let _LOAD_STATUS = { ok: true, usedFallback: false, errors: [], warnings: [] };

function _isCategoryShape(c) {
  return (
    c != null
    && typeof c === 'object'
    && typeof c.id === 'string'
    && c.id.length > 0
    && typeof c.name === 'string'
    && c.name.length > 0
    && typeof c.icon === 'string'
    && typeof c.order === 'number'
    && Number.isFinite(c.order)
  );
}

function _build(cats, map, source) {
  // 1. Filter + sort categories
  const valid = (Array.isArray(cats) ? cats : []).filter(_isCategoryShape);
  if (!valid.find((c) => c.id === 'other')) {
    // 兜底: 任何 'other' 缺失都强行补
    valid.push({ id: 'other', name: '其他', icon: '📦', order: 99 });
    _LOAD_STATUS.warnings.push(`[${source}] 'other' category missing, appended fallback`);
  }
  const sorted = valid.slice().sort((a, b) => a.order - b.order);
  const byId = new Map(sorted.map((c) => [c.id, c]));

  // 2. Build app → categoryId
  const appToCat = new Map();
  const entries = (map && typeof map === 'object' && !Array.isArray(map)) ? Object.entries(map) : [];
  for (const [rawName, catId] of entries) {
    if (typeof rawName !== 'string' || rawName.length === 0) {
      _LOAD_STATUS.warnings.push(`[${source}] app-category.json: invalid app name key, skipping`);
      continue;
    }
    if (typeof catId !== 'string' || !byId.has(catId)) {
      _LOAD_STATUS.warnings.push(
        `[${source}] app-category.json: app '${rawName}' → unknown categoryId '${catId}', skipping`
      );
      continue;
    }
    appToCat.set(rawName.toLowerCase(), catId);
  }

  APP_TO_CATEGORY = appToCat;
  CATEGORIES_BY_ID = byId;
  CATEGORIES_SORTED = sorted;
}

function _loadFromDisk(catsPath = CATEGORIES_PATH, mapPath = MAPPING_PATH) {
  const status = { ok: true, usedFallback: false, errors: [], warnings: [] };

  // categories.json
  let cats = null;
  try {
    const raw = fs.readFileSync(catsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.categories) && parsed.categories.length > 0) {
      cats = parsed.categories;
    } else {
      status.errors.push('categories.json: empty or missing "categories" array');
    }
  } catch (e) {
    status.errors.push(`categories.json: ${e.message}`);
  }

  // app-category.json
  let map = null;
  try {
    const raw = fs.readFileSync(mapPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      parsed
      && parsed.mapping
      && typeof parsed.mapping === 'object'
      && !Array.isArray(parsed.mapping)
    ) {
      map = parsed.mapping;
    } else {
      status.errors.push('app-category.json: empty or invalid "mapping" object');
    }
  } catch (e) {
    status.errors.push(`app-category.json: ${e.message}`);
  }

  if (status.errors.length > 0) {
    status.usedFallback = true;
    // 走 default, 但 default 已经 frozen, deep-copy 防止 build 期间被改
    return {
      cats: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      map: { ...DEFAULT_MAPPING },
      status,
    };
  }
  return { cats, map, status };
}

function _init(opts = {}) {
  const { catsPath, mapPath } = opts;
  const { cats, map, status } = _loadFromDisk(catsPath, mapPath);
  _LOAD_STATUS = status;
  _build(cats, map, status.usedFallback ? 'fallback' : 'disk');
  // 启动期 console 报告 (main + renderer 都会看到)
  if (status.usedFallback) {
    // eslint-disable-next-line no-console
    console.error('[category] failed to load from disk, using hardcoded defaults:', status.errors);
  } else if (status.warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[category] load warnings:', status.warnings);
  }
}

// 自动 init (require 时一次性). plan A1b 要求.
_init();

// ── 6 API ──

/**
 * 查 app 的分类. 找不到 → 'other' (兜底, 永不崩).
 * @param {string} appName
 * @returns {string} categoryId
 */
function getCategory(appName) {
  if (typeof appName !== 'string' || appName.length === 0) return 'other';
  return APP_TO_CATEGORY.get(appName.toLowerCase()) || 'other';
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
    return { ...(CATEGORIES_BY_ID.get('other') || { id: 'other', name: '其他', icon: '📦', order: 99 }) };
  }
  for (const c of CATEGORIES_SORTED) {
    if (c.name === name) return { ...c };
  }
  return { ...(CATEGORIES_BY_ID.get('other') || { id: 'other', name: '其他', icon: '📦', order: 99 }) };
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
 * 给 renderer 用: 根据当前 results (Map<name, result>) 算出 tab 列表.
 * "全部" + 非空非'other'分类(count desc → order asc) + "📦 其他" 永远在末.
 *
 * @param {Map<string, any>|Iterable<string>} results  Map<appName, result> 或单纯的可迭代 name 集合
 * @returns {Array<{id: string, name: string, icon: string, count: number, title: string}>}
 */
function getCategoryTabsWithCount(results) {
  const counts = new Map();
  let total = 0;
  if (results && typeof results.keys === 'function') {
    // Map
    for (const name of results.keys()) {
      const n = typeof name === 'string' ? name : '';
      const cat = getCategory(n);
      counts.set(cat, (counts.get(cat) || 0) + 1);
      total += 1;
    }
  } else if (results && typeof results[Symbol.iterator] === 'function') {
    // Iterable<string>
    for (const name of results) {
      const n = typeof name === 'string' ? name : '';
      const cat = getCategory(n);
      counts.set(cat, (counts.get(cat) || 0) + 1);
      total += 1;
    }
  }

  const tabs = [];
  // 1) "全部" 永远第一
  tabs.push({ id: 'all', name: '全部', icon: '📋', count: total, title: '所有 app' });

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
    tabs.push({ id: cat.id, name: cat.name, icon: cat.icon, count, title: cat.name });
  }

  // 3) "📦 其他" 永远在末
  tabs.push({ id: 'other', name: '其他', icon: '📦', count: counts.get('other') || 0, title: '其他' });
  return tabs;
}

module.exports = {
  getCategory,
  getAllCategories,
  getCategoryById,
  getCategoryByName,
  validateCategoryMap,
  getCategoryTabsWithCount,
  // 测试/调试用 (不应在生产代码调)
  _init,
  _LOAD_STATUS: () => _LOAD_STATUS,
  _DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
  _DEFAULT_MAPPING: DEFAULT_MAPPING,
  _CATEGORIES_PATH: CATEGORIES_PATH,
  _MAPPING_PATH: MAPPING_PATH,
};
