/**
 * src/config/category.js
 *
 * Phase A1b (App Categorization, Feature A): 静态 map + 验证 + 纯函数 API.
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
 *
 * CommonJS 风格, 跟 src/config/{schema,migrate}.js 保持一致.
 */

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

// ── Module-level 缓存 (setData 时构建, 之后只读) ──
let APP_TO_CATEGORY = new Map();
let CATEGORIES_BY_ID = new Map();
let CATEGORIES_SORTED = [...DEFAULT_CATEGORIES];
let _LOAD_STATUS = { ok: true, usedFallback: true, errors: [], warnings: ['module not yet initialized via setData'] };

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
  const status = { ok: true, usedFallback: false, errors: [], warnings: [] };

  // 1. Filter + sort categories
  const valid = (Array.isArray(cats) ? cats : []).filter(_isCategoryShape);
  if (!valid.find((c) => c.id === 'other')) {
    // 兜底: 任何 'other' 缺失都强行补
    valid.push({ id: 'other', name: '其他', icon: '📦', order: 99 });
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
  setData,
  getCategory,
  getAllCategories,
  getCategoryById,
  getCategoryByName,
  validateCategoryMap,
  getCategoryTabsWithCount,
  // 测试/调试用 (不应在生产代码调)
  _LOAD_STATUS: () => _LOAD_STATUS,
  _DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
  _DEFAULT_MAPPING: DEFAULT_MAPPING,
};
