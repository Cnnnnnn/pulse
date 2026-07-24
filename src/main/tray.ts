/**
 * src/main/tray.ts
 *
 * Tray icon + menu. Phase 28: 切换到 Pulse 品牌 + assets/ PNG.
 *
 * 旧实现用 Buffer 像素生成 ECG 圆环 + 箭头 (不精细, 用户反馈"太丑")。
 * 新实现: 从 assets/ 加载 4 个预渲染 PNG (script: scripts/render-icons.js).
 *   - iconTemplate.png / @2x.png  → 16x16 / 32x32 心电图线
 *   - iconBadge-{1..9,9plus}.png / @2x.png  → 32x16 / 64x32 数字角标
 *
 * 依赖：electron (tray/nativeImage/menu)、detect 状态 (lastResults)。
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type {
  MenuItemConstructorOptions,
  NativeImage,
  Tray as TrayInstance,
} from "electron";
import type * as pathType from "node:path";

type ElectronTray = typeof import("electron").Tray;
type ElectronMenu = typeof import("electron").Menu;
type ElectronNativeImage = typeof import("electron").nativeImage;
type ElectronNativeTheme = typeof import("electron").nativeTheme;
type ElectronShell = typeof import("electron").shell;

type ThemeLike = { shouldUseDarkColors?: boolean };

type DetectResult = {
  name?: string;
  has_update?: boolean;
  status?: string;
  installed_version?: string;
  latest_version?: string;
  ts?: number;
};

type TrayPrefs = {
  segments: {
    updates?: boolean;
    ai_usage?: boolean;
    worldcup?: boolean;
    metals?: boolean;
    check_action?: boolean;
    config_action?: boolean;
  };
};

type BuildMenuOpts = {
  results?: DetectResult[];
  aiUsage?: any;
  worldcup?: any;
  metals?: any;
  trayPrefs?: TrayPrefs;
  themeMode?: string;
  onOpenPanel?: () => void;
  onCheck?: () => void;
  onOpenConfig?: () => void;
  onOpenTrayConfig?: () => void;
  onQuit?: () => void;
  onFocusUpdate?: (payload: { rowName: string; action: string }) => void;
  onFocusWorldcup?: (payload: { matchKey: string }) => void;
  onThemeChange?: (mode: string) => void;
  getConfigPath?: () => string;
  getConfig?: () => { apps?: any[] };
  staleNames?: string[];
  selfUpdateState?: { available?: boolean; version?: string; status?: string } | null;
};

type CreateTrayManagerOpts = {
  getConfig?: () => { apps?: any[] };
  getConfigPath?: () => string;
  onCheck?: () => void;
  onOpenPanel?: () => void;
  onOpenConfig?: () => void;
  onOpenTrayConfig?: () => void;
  onQuit?: () => void;
  onFocusUpdate?: (payload: any) => void;
  onFocusWorldcup?: (payload: any) => void;
  onThemeChange?: (mode: string) => void;
};

const {
  Tray,
  Menu,
  nativeImage,
  nativeTheme,
  shell,
}: {
  Tray: ElectronTray;
  Menu: ElectronMenu;
  nativeImage: ElectronNativeImage;
  nativeTheme: ElectronNativeTheme;
  shell: ElectronShell;
} = require("electron");
const path: typeof pathType = require("path");

const ASSETS = path.join(__dirname, "..", "..", "assets");

/**
 * 加载模板图标.
 * - macOS: Apple template image, 走 setTemplateImage(true) 自动适配 light/dark.
 * - Windows: 没有 setTemplateImage 协议, 用两套静态 ICO + nativeTheme 切换.
 *
 * @param {object} [theme] - 注入依赖, 默认走 require('electron').nativeTheme.
 */
function loadTrayIcon(theme?: ThemeLike): NativeImage | null {
  if (process.platform === "win32") {
    // P4: Windows 端用 ICO + 深浅色两套.
    // nativeTheme.shouldUseDarkColors 反映 OS 当前主题.
    const effectiveTheme = theme || nativeTheme;
    const file = effectiveTheme.shouldUseDarkColors
      ? "iconTrayDark.ico"
      : "iconTray.ico";
    const png = nativeImage.createFromPath(path.join(ASSETS, file));
    if (png.isEmpty()) return loadFallbackIcon();
    return png;
  }
  // macOS 现状不变 (template image)
  const png = nativeImage.createFromPath(
    path.join(ASSETS, "iconTemplate@2x.png"),
  );
  if (png.isEmpty()) return null;
  png.setTemplateImage(true);
  return png;
}

/** 加载 badge 图标 (count 1-9 → 数字; ≥10 → 9+). */
function loadBadgeIcon(count: number): NativeImage | null {
  const n = Math.max(0, Math.min(99, count | 0));
  const variant = n >= 10 ? "9plus" : String(n);
  const png = nativeImage.createFromPath(
    path.join(ASSETS, `iconBadge-${variant}@2x.png`),
  );
  return png.isEmpty() ? null : png;
}

/** 最小 fallback PNG (1x1 灰). 资源文件丢失时使用, 避免 tray 完全空白. */
function loadFallbackIcon(): NativeImage {
  // 1x1 transparent PNG
  const buf = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  return nativeImage.createFromBuffer(buf);
}

/**
 * 构造 tray context menu 的 template 数组 (纯函数, 无 Electron Tray 副作用).
 *
 * v2.22 Task A1: 从 rebuildMenu 抽出, 方便单测. 无行为变化 — 仍是
 *   - 有更新 / 已是最新 / 需关注 三段 (现状保留)
 *   - 无结果 → "尚未检查" 占位
 *   - 底部 4 个 action: 打开面板 / 检查更新 / 打开配置文件 / 退出
 *
 * 后续 Task A2-A4 会在此函数里按段替换内容; callback 注入已经预留
 * onFocusUpdate (A2 用). aiUsage / worldcup / metals 字段已收, 待
 * B2/C2/D1 在函数体内插入对应段.
 *
 * @param {object} opts
 * @param {Array}  [opts.results=[]]      - detect 返回的 app 状态列表
 * @param {object} [opts.aiUsage=null]    - A2/B2 任务: AI 配额状态
 * @param {object} [opts.worldcup=null]   - C2 任务: 世界杯比分
 * @param {object} [opts.metals=null]     - D1 任务: 贵金属行情
 * @param {object} [opts.trayPrefs]       - Phase v1: tray 菜单项 prefs (默认 DEFAULT_PREFS 全开)
 * @param {Function} [opts.onOpenPanel]   - 点击 "打开面板" 时调用
 * @param {Function} [opts.onCheck]       - 点击 "检查更新" 时调用
 * @param {Function} [opts.onOpenConfig]  - 配置文件无路径时回退回调
 * @param {Function} [opts.onOpenTrayConfig] - Phase v1: 点击「菜单栏配置...」时调用
 * @param {Function} [opts.onQuit]        - 点击 "退出" 时调用
 * @param {Function} [opts.onFocusUpdate] - A2 任务: 聚焦到某条 update
 * @param {Function} [opts.getConfigPath] - 返回配置文件绝对路径
 * @param {Function} [opts.getConfig]     - 返回配置对象 (含 apps 数组)
 * @param {string[]} [opts.staleNames]    - 超过 7 天没新结果的 app 名字, 显示 "重检查" 入口
 * @param {object}  [opts.selfUpdateState] - P52: {available, version, status, ...} Pulse 自更新状态
 * @returns {Array} Electron Menu template 数组
 */
function buildMenu(opts: BuildMenuOpts): MenuItemConstructorOptions[] {
  const {
    results = [],
    aiUsage = null,
    worldcup = null,
    metals = null,
    staleNames = [],
    selfUpdateState = null,
    trayPrefs = require("./tray-menu-prefs.ts").DEFAULT_PREFS,
    themeMode = "system", // P10: 当前主题偏好 (用于 submenu 选中标记)
    onOpenPanel = () => {},
    onCheck = () => {},
    onOpenConfig = () => {},
    onOpenTrayConfig = () => {},
    onQuit = () => {},
    onFocusUpdate = () => {},
    onFocusWorldcup = () => {},
    onThemeChange = () => {}, // P10: 用户在托盘切换主题
    getConfigPath = () => "",
    getConfig = () => ({ apps: [] }),
  } = opts;
  const seg = trayPrefs.segments;
  const template = [];

  // ─── I7: 顶部总览 (全局快照) ───
  // 用户开菜单瞬间拿到"全局快照"; 与下方各 segment 互补.
  const summaryLine = buildSummaryLine(results);
  if (summaryLine) {
    template.push(summaryLine);
    template.push({ type: "separator" });
  }

  // ─── 🔄 检查更新 (v2.22 Task A2: 内容预览) ───
  if (seg.updates) {
    if (results.length > 0) {
      const updates = results.filter((r) => r.has_update);
      const upToDate = results.filter((r) => r.status === "up_to_date");

      if (updates.length > 0) {
        template.push({
          label: `── 🔄 检查更新 (${updates.length} 待升级) ──`,
          enabled: false,
        });
        updates.forEach((r) => {
          const ver = r.latest_version
            ? `${r.installed_version || "?"} → ${r.latest_version}`
            : "";
          template.push({
            label: `${r.name}  ${ver}  ⬆️ 升级`,
            click: () => {
              onFocusUpdate({ rowName: r.name, action: "upgrade" });
            },
          });
        });
        template.push({ type: "separator" });
      } else if (upToDate.length > 0) {
        // 没有更新时显示总览 (1 行)
        template.push({
          label: `── 🔄 检查更新 · 全部最新 (${upToDate.length}) ──`,
          enabled: false,
        });
        template.push({
          label: '  点击"检查更新"手动刷新',
          enabled: false,
        });
        template.push({ type: "separator" });
      }
    } else {
      template.push({
        label: "── 🔄 检查更新 · 尚未检查 ──",
        enabled: false,
      });
      template.push({ type: "separator" });
    }
  }

  // ─── 📊 AI coding plan 用量 (v2.22 Task B2) ───
  if (seg.ai_usage && aiUsage) {
    const lines = buildAiUsageLines(aiUsage);
    if (lines.length > 0) {
      template.push({ label: "── 📊 AI coding plan 用量 ──", enabled: false });
      for (const line of lines) {
        template.push(line);
      }
      template.push({ type: "separator" });
    }
  }

  // ─── ⚽ 世界杯 (v2.22 Task C2) ───
  if (seg.worldcup && worldcup) {
    const wcLines = buildWorldcupLines(worldcup, onFocusWorldcup);
    if (wcLines.length > 0) {
      template.push({ label: "── ⚽ 世界杯 ──", enabled: false });
      for (const line of wcLines) {
        template.push(line);
      }
      template.push({ type: "separator" });
    }
  }

  // ─── 💎 贵金属 (v2.22 Task D1) ───
  if (seg.metals && metals) {
    const ml = buildMetalsLines(metals);
    if (ml.length > 0) {
      template.push({ label: "── 💎 贵金属 ──", enabled: false });
      for (const line of ml) {
        template.push(line);
      }
      template.push({ type: "separator" });
    }
  }

  // ─── 底部 action (Phase v1: check_action / config_action 可关, 打开面板 + 退出锁死) ───
  // P52: "Pulse 有新版 vX.Y.Z" → 点击打开主面板 (DiagnosticsDrawer 提示)
  if (
    selfUpdateState &&
    selfUpdateState.available &&
    selfUpdateState.version
  ) {
    template.push({
      label: `Pulse 有新版 v${selfUpdateState.version} — 点击查看`,
      click: () => onOpenPanel(),
    });
    template.push({ type: "separator" });
  }
  // Phase stale: "N 个 app 超过 7 天没新结果" → 点击触发 onCheck 重检查
  if (Array.isArray(staleNames) && staleNames.length > 0) {
    template.push({
      label: `${staleNames.length} 个 app 超过 7 天没新结果 — 点击重检查`,
      click: () => onCheck(),
    });
    template.push({ type: "separator" });
  }
  template.push({ label: "打开面板", click: () => onOpenPanel() });
  // P10: 主题切换 (submenu: 跟随系统 / 浅色 / 深色)
  template.push({ type: "separator" });
  template.push({
    label: "主题",
    submenu: [
      {
        label: "跟随系统",
        type: "radio",
        checked: themeMode === "system",
        click: () => onThemeChange("system"),
      },
      {
        label: "浅色",
        type: "radio",
        checked: themeMode === "light",
        click: () => onThemeChange("light"),
      },
      {
        label: "深色",
        type: "radio",
        checked: themeMode === "dark",
        click: () => onThemeChange("dark"),
      },
    ],
  });
  template.push({ type: "separator" });
  if (seg.check_action) {
    template.push({ label: "检查更新", click: () => onCheck() });
  }
  template.push({ type: "separator" });
  if (seg.config_action) {
    template.push({
      label: "打开配置文件",
      click: () => {
        const p = getConfigPath();
        if (p) require("electron").shell.openPath(p);
        else onOpenConfig();
      },
    });
  }
  template.push({ type: "separator" });
  template.push({ label: "退出", click: () => onQuit() });
  return template;
}

const PROVIDER_NAME = { minimax: "MiniMax", glm: "GLM" };

/**
 * 把 aiUsage summary map 渲染成 menu template 行 (v2.22 Task B2).
 * summaryMap = { minimax: {status, percent, remainLabel, fetchedAt}, glm: {...} }
 * - 某 provider unconfigured → 跳过该 provider, 不显示该行
 * - 某 provider ok → "  ProviderName: N% 已用 (剩 X)"  (陈旧时追加 " (Nh 前)")
 * - 某 provider error → "  ProviderName: 拉取失败"
 * - 全部 unconfigured → 整段只显示一行 "  未配置"
 */
function buildAiUsageLines(summaryMap: any): MenuItemConstructorOptions[] {
  const lines = [];
  let hasAny = false;
  for (const pid of ["minimax", "glm"]) {
    const s = summaryMap[pid];
    if (!s || s.status === "unconfigured") continue;
    hasAny = true;
    if (s.status === "ok") {
      const ageLabel = s.fetchedAt ? _ageLabel(Date.now() - s.fetchedAt) : "";
      lines.push({
        label: `  ${PROVIDER_NAME[pid]}: ${s.percent}% 已用 (剩 ${s.remainLabel})${ageLabel}`,
        enabled: false,
      });
    } else if (s.status === "error") {
      lines.push({
        label: `  ${PROVIDER_NAME[pid]}: 拉取失败`,
        enabled: false,
      });
    }
  }
  if (!hasAny) {
    lines.push({ label: "  未配置", enabled: false });
  }
  return lines;
}

/**
 * 把毫秒差格式化成 " (Nm 前)" / " (Nh 前)" (v2.22 Task B2).
 * < 60s → "" (不显示)
 */
function _ageLabel(deltaMs: number): string {
  if (deltaMs < 60_000) return "";
  const m = Math.floor(deltaMs / 60_000);
  if (m < 60) return ` (${m}m 前)`;
  const h = Math.floor(m / 60);
  return ` (${h}h 前)`;
}

/**
 * I7: 构造 tray 菜单顶部总览行.
 *   - 无 results → "🔔 Pulse · 尚未检测"
 *   - 有 results → "🔔 Pulse · N 应用 · M 待升级 · Xm 前"
 *                   或 "🔔 Pulse · N 应用 · 全部最新 · Xm 前"
 *   - age < 60s → 省略 "Xm 前" (避免刚检测完还显示)
 *
 * 返回 null 表示不应插入 (理论上不会发生, 但留兜底).
 * ponytail: macOS Tray 没有 hover tooltip API, 用菜单顶部 1 行代替,
 * 用户左键/右键打开菜单立即可见, 信息密度比 tooltip 高.
 * age 格式与下方 AI 用量段统一 ("Xm 前" / "Xh 前", 无括号), 信息层视觉对齐.
 */
function buildSummaryLine(results: DetectResult[] | null | undefined): MenuItemConstructorOptions | null {
  if (!Array.isArray(results) || results.length === 0) {
    return { label: "🔔 Pulse · 尚未检测", enabled: false };
  }
  const total = results.length;
  const pending = results.filter((r) => r && r.has_update).length;
  // 找最早 ts (最旧的那次检测)
  const tsList = results
    .map((r) => (r && typeof r.ts === "number" ? r.ts : null))
    .filter((t) => t !== null);
  const oldestTs = tsList.length > 0 ? Math.min.apply(null, tsList) : null;
  const age = oldestTs !== null ? _summaryAgeLabel(Date.now() - oldestTs) : "";

  const statusBit = pending > 0 ? `${pending} 待升级` : "全部最新";
  return {
    label: `🔔 Pulse · ${total} 应用 · ${statusBit}${age}`,
    enabled: false,
  };
}

/**
 * I7 专用 age 格式 (与 buildAiUsageLines 的 _ageLabel 输出区分开):
 * "3m 前" / "1h 前" (无括号, 无前导空格, 直接拼接到上一行的 "· " 后).
 * < 60s → "" (不显示).
 */
function _summaryAgeLabel(deltaMs: number): string {
  if (deltaMs < 60_000) return "";
  const m = Math.floor(deltaMs / 60_000);
  if (m < 60) return ` · ${m}m 前`;
  const h = Math.floor(m / 60);
  return ` · ${h}h 前`;
}

/**
 * 把 worldcup summary map 渲染成 menu template 行 (v2.22 Task C2).
 * wc = { todayMatches: [...], upcoming: [...] }
 * - 今日 live 比赛 → "  team1 vs team2  2-1 (live)"
 * - 今日已结束 → "  team1 vs team2  1-0 (终)"
 * - 今日未开赛 → "  team1 vs team2  13:00"
 * - 今日无比赛 + 有 upcoming →  "  下一场: team1 vs team2  明天 15:00"
 */
function buildWorldcupLines(wc: any, onFocusWorldcup?: (payload: { matchKey: string }) => void): MenuItemConstructorOptions[] {
  const lines = [];
  const today = Array.isArray(wc.todayMatches) ? wc.todayMatches : [];
  const cb = typeof onFocusWorldcup === "function" ? onFocusWorldcup : () => {};
  for (const m of today) {
    if (!m || !m.team1 || !m.team2) continue;
    const score = m.score || {};
    let scoreText = "";
    if (score.status === "live" && Array.isArray(score.ft)) {
      scoreText = `  ${score.ft[0]}-${score.ft[1]} (live)`;
    } else if (score.status === "final" && Array.isArray(score.ft)) {
      scoreText = `  ${score.ft[0]}-${score.ft[1]} (终)`;
    } else if (m.time) {
      scoreText = `  ${m.time}`;
    }
    lines.push({
      label: `  ${m.team1} vs ${m.team2}${scoreText}`,
      enabled: typeof m.key === "string",
      click: () => {
        if (m.key) cb({ matchKey: m.key });
      },
    });
  }
  const upcoming = Array.isArray(wc.upcoming) ? wc.upcoming : [];
  if (today.length === 0 && upcoming.length > 0) {
    const next = upcoming[0];
    if (next && next.team1 && next.team2) {
      lines.push({
        label:
          `  下一场: ${next.team1} vs ${next.team2}  ${next.time || next.date || ""}`.trim(),
        enabled: typeof next.key === "string",
        click: () => {
          if (next.key) cb({ matchKey: next.key });
        },
      });
    }
  }
  return lines;
}

const METAL_NAME = {
  XAU: "黄金",
  XAG: "白银",
  AU9999: "Au9999",
  AG9999: "Ag9999",
};

/**
 * 把 metals snapshot 渲染成 menu template 行 (v2.22 Task D1).
 * metals = { quotes: {XAU:{price,prevClose,currency,unit,...}, ...}, ... }
 * - 无任何 quote → 整段只显示一行 "  加载中..." (cold start 或 scheduler 未拉)
 * - 有 quote → 每条金属一行 "  名称 (id): price currency/unit ↑/↓"
 */
function buildMetalsLines(metals: any): MenuItemConstructorOptions[] {
  const lines = [];
  const quotes =
    metals && metals.quotes && typeof metals.quotes === "object"
      ? metals.quotes
      : {};
  const keys = Object.keys(quotes).filter(
    (k) => quotes[k] && typeof quotes[k].price === "number",
  );
  if (keys.length === 0) {
    lines.push({ label: "  加载中...", enabled: false });
    return lines;
  }
  for (const id of keys) {
    const q = quotes[id];
    const name = METAL_NAME[id] || id;
    const arrow =
      typeof q.prevClose === "number" && q.prevClose > 0
        ? q.price > q.prevClose
          ? " ↑"
          : q.price < q.prevClose
            ? " ↓"
            : ""
        : "";
    const unit = q.unit || "";
    const cur = q.currency || "";
    const priceStr = typeof q.price === "number" ? q.price.toFixed(2) : "?";
    lines.push({
      label: `  ${name} (${id}): ${priceStr} ${cur}/${unit}${arrow}`,
      enabled: false,
    });
  }
  return lines;
}

/**
 * Tray 管理器 — 封装 icon + menu + badge，单一职责。
 * 用法：
 *   const tray = createTrayManager({ getApps, getConfigPath, getConfig, onCheck, onQuit, onOpenPanel, onOpenConfig });
 *   tray.install();
 *   tray.setResults(results, staleNames);
 *   tray.setBadge(updateCount);
 *   tray.dispose();
 */
function createTrayManager(opts: CreateTrayManagerOpts) {
  const getConfig = opts.getConfig || (() => ({ apps: [] }));
  const getConfigPath = opts.getConfigPath || (() => "");
  const onCheck = opts.onCheck || (() => {});
  const onOpenPanel = opts.onOpenPanel || (() => {});
  const onOpenConfig = opts.onOpenConfig || (() => {});
  const onOpenTrayConfig = opts.onOpenTrayConfig || (() => {});
  const onQuit = opts.onQuit || (() => {});
  const onFocusUpdate = opts.onFocusUpdate || (() => {});
  const onFocusWorldcup = opts.onFocusWorldcup || (() => {});
  const onThemeChange = opts.onThemeChange || (() => {}); // P10

  let tray: TrayInstance | null = null;
  let lastResults: DetectResult[] = [];
  let lastStaleNames: string[] = [];
  let lastSelfUpdateState: BuildMenuOpts["selfUpdateState"] = null;
  let lastTrayMenuPrefs: TrayPrefs = require("./tray-menu-prefs.ts").DEFAULT_PREFS;
  let lastThemeMode = "system"; // P10: 主进程内存, 由 renderer 同步

  function install() {
    let icon = loadTrayIcon();
    if (!icon) icon = loadFallbackIcon();
    tray = new Tray(icon);
    tray.setToolTip("Pulse");
    tray.on("click", () => onOpenPanel());
    rebuildMenu();

    // P4: Windows 端监听主题变化, 切换亮/暗两套 ICO.
    // macOS 走 template image 协议, 不需要 listener.
    if (process.platform === "win32") {
      nativeTheme.on("updated", () => {
        const next = loadTrayIcon();
        if (next && tray) tray.setImage(next);
      });
    }
  }

  function rebuildMenu() {
    if (!tray) return;
    const template = buildMenu({
      results: lastResults,
      aiUsage: lastAiUsage,
      worldcup: lastWorldcup,
      metals: lastMetals,
      trayPrefs: lastTrayMenuPrefs,
      staleNames: lastStaleNames,
      selfUpdateState: lastSelfUpdateState,
      themeMode: lastThemeMode, // P10
      getConfig: getConfig,
      onOpenPanel,
      onCheck,
      onOpenConfig,
      onThemeChange, // P10
      onOpenTrayConfig,
      onQuit,
      onFocusUpdate,
      onFocusWorldcup,
      getConfigPath,
    });
    // Phase v1: 锁死位置,在「退出」上方拼「菜单栏配置...」(用户可配置入口,锁死位置不漂移)
    if (template.length > 0 && template[template.length - 1].label === "退出") {
      template.splice(
        -1,
        0,
        { type: "separator" },
        { label: "菜单栏配置...", click: () => onOpenTrayConfig() },
      );
    }
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  function setResults(results: any, staleNames?: any) {
    lastResults = Array.isArray(results) ? results : [];
    if (Array.isArray(staleNames)) lastStaleNames = staleNames;
    scheduleRebuild();
  }

  // P52: 自更新 state 变化时 rebuild tray menu (e.g. 检测到 v2.47.0)
  function setSelfUpdateState(state: any) {
    lastSelfUpdateState = state || null;
    scheduleRebuild();
  }

  // ─── debounce + Windows throttle (v2.22 Task B2) ───
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  let lastRebuildAt = 0;
  function scheduleRebuild() {
    if (rebuildTimer) return;
    const elapsed = Date.now() - lastRebuildAt;
    const minInterval = process.platform === "win32" ? 1000 : 0;
    const delay = Math.max(200, minInterval - elapsed);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      lastRebuildAt = Date.now();
      rebuildMenu();
    }, delay);
  }

  let lastAiUsage: any = null;
  function setAiUsage(snapshot: any) {
    lastAiUsage = snapshot;
    scheduleRebuild();
  }

  let lastWorldcup: any = null;
  function setWorldcup(snapshot: any) {
    lastWorldcup = snapshot;
    scheduleRebuild();
  }

  let lastMetals: any = null;
  function setMetals(snapshot: any) {
    lastMetals = snapshot;
    scheduleRebuild();
  }

  // Phase v1: 注入 prefs,触发 rebuild. trayPrefs 是 normalizePrefs 归一化过的对象.
  function setTrayMenuPrefs(prefs: any) {
    const { normalizePrefs, DEFAULT_PREFS: DEF } = require("./tray-menu-prefs.ts");
    lastTrayMenuPrefs = normalizePrefs(prefs) || DEF;
    scheduleRebuild();
  }

  // P10: 同步 renderer 端的主题偏好到主进程 (用于 submenu 选中标记).
  function setThemeMode(mode: string) {
    const m = ["system", "light", "dark"].includes(mode) ? mode : "system";
    if (m === lastThemeMode) return;
    lastThemeMode = m;
    scheduleRebuild();
  }

  function setBadge(updateCount: number) {
    if (!tray) return;
    if (updateCount > 0) {
      const icon = loadBadgeIcon(updateCount) || loadTrayIcon();
      tray.setImage(icon);
      tray.setToolTip(`Pulse — ${updateCount} 个更新`);
    } else {
      const icon = loadTrayIcon() || loadFallbackIcon();
      icon.setTemplateImage(true);
      tray.setImage(icon);
      tray.setToolTip("Pulse — 已是最新");
    }
  }

  function dispose() {
    if (tray) {
      try {
        tray.destroy();
      } catch {
        /* noop */
      }
      tray = null;
    }
  }

  return {
    install,
    setResults,
    setBadge,
    setAiUsage,
    setWorldcup,
    setMetals,
    setSelfUpdateState,
    setTrayMenuPrefs,
    setThemeMode, // P10
    dispose,
  };
}

module.exports = {
  createTrayManager,
  // 暴露给测试 (assets 加载 + badge 变体选择 + menu template 纯函数)
  _internal: {
    loadTrayIcon,
    loadBadgeIcon,
    loadFallbackIcon,
    buildMenu,
    buildSummaryLine,
    ASSETS,
  },
};
