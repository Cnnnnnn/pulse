/**
 * src/main/wechat-hot/read-store.ts
 *
 * wechat-hot 已读词持久化 — state.json.wechat_hot.readIds.
 */
"use strict";

const fs = require("fs");
const stateStore = require("../state-store.ts");
const { mainLog } = require("../log.ts");

function _readStateRaw(statePath: any): any {
    const p = statePath || stateStore.defaultPath();
    try {
        const raw = fs.readFileSync(p, "utf-8");
        const j = JSON.parse(raw);
        return j && typeof j === "object" ? j : {};
    } catch (err: any) {
        if (err && err.code === "ENOENT") return {};
        mainLog.warn("[wechat-hot/read-store] state read failed", {
            msg: err && err.message,
        });
        return {};
    }
}

/**
 * 读 wechat_hot.readIds (无则 {})
 * @param statePath
 * @returns Record<string, number>
 */
export function loadReadIds(statePath?: any): any {
    const s = _readStateRaw(statePath);
    const wh = s && s.wechat_hot;
    if (!wh || typeof wh !== "object") return {};
    const readIds = wh.readIds;
    if (!readIds || typeof readIds !== "object" || Array.isArray(readIds)) return {};
    return readIds;
}

/**
 * 标记一个热搜词已读 — 写 readIds[title] = now, atomic write 落盘.
 * @param title
 * @param statePath
 * @returns { ok: boolean, readIds?: object }
 */
export function markItemRead(title: string, statePath?: any): any {
    if (!title || typeof title !== "string") {
        return { ok: false, reason: "invalid_args" };
    }
    try {
        const result = stateStore.patchState((next: any) => {
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
    } catch (err: any) {
        mainLog.warn("[wechat-hot/read-store] markItemRead failed", {
            msg: err && err.message,
        });
        return { ok: false, reason: "write_failed" };
    }
}

module.exports = { loadReadIds, markItemRead };
