/**
 * src/renderer/games/shareImage.js
 *
 * 分享图（P1b · F）— 纯 renderer canvas 渲染 + 导出。
 *
 * 约定（见 PRD §2 F / 架构 §3.8 / 任务「导出决策」）：
 *  - 纯本地：零 IPC、零网络出口。导出用 canvas.toBlob → <a download> 锚点下载，
 *    绝不走 saveDialog / IPC（Q10 已降级为安全模式）。
 *  - 远程缩略图 P1 不绘（避免 canvas 跨域污染 taint → toBlob 失败），一律「色块 + 标题」安全模式（Q9 已降级）。
 *  - 颜色仅用 oklch()（canvas 不支持 CSS var()，故用 oklch 字面量；非裸 hex）。
 *  - 尊重 prefers-reduced-motion：静态渲染，无动画。
 *  - 本文件不依赖 signals / DOM 之外的模块，便于单测（renderShareImage 在 stub canvas 下不抛）。
 */

/** 默认分享模板（代码常量；用户偏好存 pulse.games.share.templates.v1）。 */
export const SHARE_TEMPLATES = [
  { id: "classic", name: "经典墙" },
  { id: "minimal", name: "极简" },
];
export const DEFAULT_SHARE_TEMPLATE = "classic";

/** 稀有度 id → canvas 用 oklch 颜色（避免裸 hex；remote 缩略图不绘）。 */
const RARITY_CANVAS_COLORS = {
  common: "oklch(72% 0.02 280)",
  rare: "oklch(65% 0.14 150)",
  epic: "oklch(66% 0.14 255)",
  legendary: "oklch(72% 0.15 85)",
  unranked: "oklch(55% 0.01 280)",
};
function rarityCanvasColor(id) {
  return RARITY_CANVAS_COLORS[id] || "oklch(58% 0.01 280)";
}

/** canvas 背景（oklch 深底）。 */
const BG_COLOR = "oklch(22% 0.02 280)";
/** 卡片/分隔面（oklch 浅于背景）。 */
const PANEL_COLOR = "oklch(28% 0.02 280)";
/** 主文本色（oklch 近白）。 */
const TEXT_COLOR = "oklch(96% 0.01 280)";
/** 次文本色（oklch 灰）。 */
const TEXT_DIM_COLOR = "oklch(78% 0.01 280)";
/** 强调色（oklch 琥珀，用于高亮数字/计数）。 */
const ACCENT_COLOR = "oklch(80% 0.14 80)";

/**
 * 组装分享图 payload（纯函数，便于单测）。
 * @param {Array<{rarity?:string|null}>} entries 收藏条目（用于稀有度分布）
 * @param {{total?:number,totalValue?:number,totalSaved?:number}} stats 收藏统计
 * @param {object} badgesEarned 已点亮徽章集合 { [id]: { earnedAt } }
 * @param {{tiers?:Array<{id:string,name:string,color:string}>,title?:string,template?:string}} [opts]
 * @returns {{title:string,total:number,totalValue:number,totalSaved:number,rarityBreakdown:Array<{id:string,name:string,color:string,count:number}>,badgeCount:number,achievementCount:number,template:string}}
 */
export function buildSharePayload(entries, stats, badgesEarned, opts = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const tiers = Array.isArray(opts.tiers) ? opts.tiers : [];
  const tierMap = new Map(tiers.map((t) => [t.id, t]));

  // 稀有度分布：按 rarity id 计数（unranked 归并为 "unranked"）
  const counts = {};
  for (const e of list) {
    const id = e && e.rarity ? e.rarity : "unranked";
    counts[id] = (counts[id] || 0) + 1;
  }
  const rarityBreakdown = Object.keys(counts)
    .map((id) => {
      const t = tierMap.get(id);
      return {
        id,
        name: id === "unranked" ? "未分级" : t ? t.name : id,
        color: id === "unranked" ? "var(--text-secondary)" : t ? t.color : "var(--text-secondary)",
        count: counts[id],
      };
    })
    .sort((a, b) => b.count - a.count);

  const earnedKeys =
    badgesEarned && typeof badgesEarned === "object"
      ? Object.keys(badgesEarned).filter((k) => badgesEarned[k])
      : [];

  return {
    title: opts.title || "我的游戏收藏墙",
    total: stats && typeof stats.total === "number" ? stats.total : 0,
    totalValue: stats && typeof stats.totalValue === "number" ? stats.totalValue : 0,
    totalSaved: stats && typeof stats.totalSaved === "number" ? stats.totalSaved : 0,
    rarityBreakdown,
    badgeCount: earnedKeys.length,
    achievementCount: 0, // P1c 成就引擎接入后填充；P1b 仅徽章
    template: opts.template || DEFAULT_SHARE_TEMPLATE,
  };
}

/** 货币格式化（与展示一致，零网络）。 */
function fmtMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * 将当前收藏绘入 canvas（P1 安全模式：背景 + 标题 + 统计 + 稀有度色块 + 徽章/成就计数）。
 * 远程缩略图不绘（避免跨域污染）。
 *
 * 容错：若 canvas 2D 上下文不可用（如测试环境的 stub canvas / happy-dom），直接返回，不抛。
 * 尊重 prefers-reduced-motion：纯静态渲染。
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} payload buildSharePayload 的返回值
 * @returns {boolean} 是否成功绘制（上下文不可用返回 false）
 */
export function renderShareImage(canvas, payload) {
  if (!canvas || typeof canvas.getContext !== "function") return false;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false; // 测试 / 不支持 canvas 时优雅降级

  const W = canvas.width || 1200;
  const H = canvas.height || 630;
  const p = payload || {};

  // 背景
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  // 标题
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = "700 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(p.title || "我的游戏收藏墙", 48, 44);

  // 统计数字
  const total = p.total || 0;
  const totalValue = p.totalValue || 0;
  const totalSaved = p.totalSaved || 0;
  ctx.font = "600 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillStyle = TEXT_DIM_COLOR;
  ctx.fillText(
    `共 ${fmtMoney(total)} 款 · 总值 ¥${fmtMoney(totalValue)} · 累计省 ¥${fmtMoney(totalSaved)}`,
    48,
    108,
  );

  // 稀有度色块（安全模式：按 rarity 聚类色块，不绘远程缩略图）
  const breakdown = Array.isArray(p.rarityBreakdown) ? p.rarityBreakdown : [];
  const blockY = 180;
  const blockSize = 64;
  const blockGap = 16;
  const maxBlocks = Math.max(1, Math.floor((W - 96) / (blockSize + blockGap)));
  let drawn = 0;
  for (const r of breakdown) {
    if (drawn >= maxBlocks) break;
    const x = 48 + drawn * (blockSize + blockGap);
    ctx.fillStyle = rarityCanvasColor(r.id);
    roundRect(ctx, x, blockY, blockSize, blockSize, 12);
    ctx.fill();
    // 色块内计数
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = "700 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(r.count), x + blockSize / 2, blockY + blockSize / 2 - 14);
    ctx.font = "500 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = TEXT_DIM_COLOR;
    ctx.fillText(r.name, x + blockSize / 2, blockY + blockSize / 2 + 8);
    ctx.textAlign = "left";
    drawn += 1;
  }

  // 徽章 / 成就计数
  const badgeCount = p.badgeCount || 0;
  const achCount = p.achievementCount || 0;
  const footY = H - 96;
  ctx.fillStyle = PANEL_COLOR;
  roundRect(ctx, 48, footY, W - 96, 64, 16);
  ctx.fill();

  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = "700 30px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(`🏆 ${badgeCount}`, 72, footY + 16);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(`徽章 ${badgeCount}`, 72 + ctx.measureText(`🏆 ${badgeCount}`).width + 24, footY + 20);

  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillText(`🎯 ${achCount}`, W / 2, footY + 16);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(`成就 ${achCount}`, W / 2 + ctx.measureText(`🎯 ${achCount}`).width + 24, footY + 20);

  // 底部水印（本地生成，无品牌外链）
  ctx.fillStyle = TEXT_DIM_COLOR;
  ctx.font = "500 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Pulse · 本地生成", W - 48, H - 36);
  ctx.textAlign = "left";

  return true;
}

/** 圆角矩形路径（兼容旧 canvas，不依赖 ctx.roundRect）。 */
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * 导出 PNG（零 IPC / 零网络）。
 *  - 优先 canvas.toBlob → <a download> 锚点下载（用户拍板决策）；
 *  - toBlob 不可用时降级 canvas.toDataURL + 锚点。
 * 绝不触发任何 fetch / IPC / 远程请求。
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{filename?:string}} [opts]
 * @returns {Promise<{ok:boolean,path:null}>}
 */
export async function exportShareImage(canvas, opts = {}) {
  const filename = opts.filename || "pulse-collection.png";

  const triggerDownload = (url) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    if (typeof document.body.appendChild === "function") document.body.appendChild(a);
    a.click();
    if (typeof a.remove === "function") a.remove();
  };

  if (canvas && typeof canvas.toBlob === "function") {
    const blob = await new Promise((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), "image/png");
      } catch {
        resolve(null);
      }
    });
    if (blob) {
      const url = URL.createObjectURL(blob);
      triggerDownload(url);
      if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
      return { ok: true, path: null };
    }
  }

  // 降级：dataURL 锚点
  if (canvas && typeof canvas.toDataURL === "function") {
    const url = canvas.toDataURL("image/png");
    triggerDownload(url);
  }
  return { ok: true, path: null };
}
