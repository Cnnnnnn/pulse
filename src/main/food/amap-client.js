/**
 * src/main/food/amap-client.js
 *
 * 高德地图 API 封装 — geocode (/v3/geocode/geo) + around-search (/v3/place/around).
 *
 * 设计原则:
 *   - 复用现有 http-client.js (timeout + retry 已就位)
 *   - 不抛: 全部走 {ok, data|error} 形式, 上游 orchestrator 决定 UI 行为
 *   - POI 字符串坐标 "lng,lat" 拆成 {lng, lat}, 跟 orchestrator / FoodItem 形状一致
 *   - infocode 错误码按高德文档映射为业务错误码 (invalid_key / quota / api_error)
 *   - 默认 keywords="美食" radius=1000 offset=30, 跟 spec §3.2 一致
 *
 * 文档参考: https://lbs.amap.com/api/webservice/guide/api/search
 */

const { HttpClient } = require("../http-client");
const { mainLog } = require("../log");

const BASE = "https://restapi.amap.com/v3";
const TIMEOUT_MS = 8000;

const INVALID_KEY_CODES = new Set(["10001", "10003", "10004", "10005", "10006", "20000"]);
const QUOTA_CODES = new Set(["10009", "10011", "10012"]);

function _parseLocation(loc) {
  // 高德格式: "lng,lat" — 缺位/空串时退化为 0, 避免 NaN 漏到下游
  const parts = String(loc || "").split(",");
  return { lng: parseFloat(parts[0]) || 0, lat: parseFloat(parts[1]) || 0 };
}

function createAmapClient(opts) {
  if (!opts || !opts.key) {
    throw new Error("createAmapClient: key is required");
  }
  const key = opts.key;
  const http = opts.http || new HttpClient({ timeout: TIMEOUT_MS });
  const log = opts.logger || mainLog;

  async function _getJson(path, params) {
    const qs = new URLSearchParams({ key, ...params }).toString();
    const url = `${BASE}${path}?${qs}`;
    const r = await http.get(url, { timeout: TIMEOUT_MS });
    if (!r || r.error) {
      if (log && log.warn) log.warn("[amap] http error", { err: r && r.error });
      return { ok: false, error: r && r.error === "timeout" ? "network" : "network" };
    }
    let body;
    try { body = JSON.parse(r.body); }
    catch (e) { return { ok: false, error: "parse" }; }
    if (body.status !== "1") {
      const code = String(body.infocode || "");
      if (INVALID_KEY_CODES.has(code)) return { ok: false, error: "invalid_key" };
      if (QUOTA_CODES.has(code)) return { ok: false, error: "quota" };
      return { ok: false, error: "api_error", infocode: code, info: body.info };
    }
    return { ok: true, data: body };
  }

  async function geocode(address) {
    const r = await _getJson("/geocode/geo", { address });
    if (!r.ok) return r;
    if (!r.data.geocodes || r.data.geocodes.length === 0) {
      return { ok: false, error: "no_match" };
    }
    const g = r.data.geocodes[0];
    const loc = _parseLocation(g.location);
    return {
      ok: true,
      data: {
        lng: loc.lng,
        lat: loc.lat,
        label: g.formatted_address || address,
      },
    };
  }

  async function aroundSearch(params) {
    const { location, radius = 1000, keywords = "美食" } = params || {};
    const r = await _getJson("/place/around", {
      location,
      radius: String(radius),
      keywords,
      offset: "30",
      extensions: "base",
    });
    if (!r.ok) return r;
    const pois = (r.data.pois || []).map((p) => {
      const loc = p.location ? _parseLocation(p.location) : { lng: 0, lat: 0 };
      return {
        id: p.id,
        name: p.name,
        address: p.address || "",
        location: loc,
        distance: parseInt(p.distance, 10) || 0,
        type: p.type || "",
      };
    });
    return { ok: true, data: pois };
  }

  return { geocode, aroundSearch };
}

module.exports = { createAmapClient };
