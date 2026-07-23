/**
 * src/main/wechat-hot/cache.ts
 *
 * 内存 cache + in-flight guard.
 * 不写 state.json (spec §3 YAGNI).
 */
"use strict";

const EMPTY = { items: [], fetchedAt: 0, source: "xxapi" };

export function createWechatHotCache({ fetcher, onUpdate }: any = {}): any {
    let cache = { ...EMPTY };
    let inflight: any = null;

    function load(): any {
        return { ...cache, items: [...cache.items] };
    }

    async function refresh(): Promise<any> {
        if (inflight) return inflight;
        if (typeof fetcher !== "function") {
            throw Object.assign(new Error("fetcher missing"), {
                reason: "fetch_failed",
            });
        }
        inflight = (async () => {
            try {
                const payload = await fetcher({});
                if (!payload || !Array.isArray(payload.items)) {
                    throw Object.assign(new Error("bad payload"), {
                        reason: "parse_failed",
                    });
                }
                cache = {
                    items: payload.items,
                    fetchedAt: payload.fetchedAt || Date.now(),
                    source: payload.source || "xxapi",
                };
                if (typeof onUpdate === "function") {
                    try {
                        onUpdate(cache);
                    } catch {
                        /* noop */
                    }
                }
                return cache;
            } finally {
                inflight = null;
            }
        })();
        return inflight;
    }

    return { load, refresh };
}

module.exports = { createWechatHotCache, EMPTY };
