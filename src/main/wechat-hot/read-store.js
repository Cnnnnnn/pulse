/**
 * src/main/wechat-hot/read-store.js
 *
 * wechat-hot 已读词持久化 — state.json.wechat_hot.readIds.
 * 仿 src/main/ithome/news-store.js 的 markArticleRead 模式.
 *
 * state.json 结构: { ..., wechat_hot: { readIds: { "<title>": <readAt(ms)> } } }
 *
 * diff key = title (热搜词本身; rank 随热度浮动不稳定).
 * 只存 readIds (已读词); newIds 是 session 级, 不落盘 (重启清零, 跟 ithome 一致).
 */

const fs = require("fs");
const stateStore = require("../state-store");
const { mainLog } = require("../log.ts");

function _readStateRaw(statePath) {
  const p = statePath || stateStore.defaultPath();
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : {};
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    mainLog.warn("[wechat-hot/read-store] state read failed", {
      msg: err && err.message,
    });
    return {};
  }
}

/**
 * 读 wechat_hot.readIds (无则 {})
 * @param {string} [statePath]
 * @returns {Record<string, number>}
 */
function loadReadIds(statePath) {
  const s = _readStateRaw(statePath);
  const wh = s && s.wechat_hot;
  if (!wh || typeof wh !== "object") return {};
  const readIds = wh.readIds;
  if (!readIds || typeof readIds !== "object" || Array.isArray(readIds)) return {};
  return readIds;
}

/**
 * 标记一个热搜词已读 — 写 readIds[title] = now, atomic write 落盘.
 * 幂等: 重复标记只更新 readAt. 保留已有 readIds + 其它 state 字段.
 * @param {string} title
 * @param {string} [statePath]
 * @returns {{ ok: boolean, readIds?: object }}
 */
function markItemRead(title, statePath) {
  if (!title || typeof title !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  try {
    const result = stateStore.patchState((next) => {
      const existing = _readStateRaw(statePath);
      const prevReadIds =
        existing.wechat_hot && existing.wechat_hot.readIds
          ? existing.wechat_hot.readIds
          : {};
      next.wechat_hot = {
        readIds: { ...prevReadIds, [title]: Date.now() },
      };
    }, statePath);
    return { ok: true, readIds: result && result.wechat_hot && result.wechat_hot.readIds };
  } catch (err) {
    mainLog.warn("[wechat-hot/read-store] markItemRead failed", {
      msg: err && err.message,
    });
    return { ok: false, reason: "write_failed" };
  }
}

module.exports = { loadReadIds, markItemRead };
