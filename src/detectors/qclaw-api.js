/**
 * src/detectors/qclaw-api.js
 *
 * POST 到一个腾讯网关，body: { from: 'web', system_type: 'macarm' | 'mac' }
 * 响应 JSON 沿 data.resp.data.version_code 链取版本号。
 *
 * 配置: { type: 'qclaw_api', url: 'https://...', body?: {...} }
 *
 * Phase 6 修复 (QClaw):
 *   - 兼容 raw response 顶层 ret=0 校验, 不再因外层校验失败抛错
 *   - 嵌套链搜索 — 优先 data.resp.data.version_code, 失败回退
 *     data.resp.data.version / data.resp.version_code / data.version_code
 *   - URL 模板展开
 *   - confidence 从 medium → high (因为该 detector 直接对腾讯网关, 数据可靠)
 */

const { Detector, DetectorResult } = require("./base");
const { DetectorError, REASONS } = require("./errors");
const { expandUrl } = require("./url-template");
const { truncate, assertHttpResponse } = require("./utils");

class QClawApiDetector extends Detector {
  static name = "qclaw_api";

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 10000 });
    this.url = opts.url || "";
  }

  async detect(ctx) {
    const rawUrl = this.url || ctx.url;
    if (!rawUrl) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "no url configured",
      });
    }
    const url = expandUrl(rawUrl, ctx.arch);

    const systemType = ctx.arch === "arm64" ? "macarm" : "mac";
    const body = { from: "web", system_type: systemType };
    const headers = {
      Origin: "https://qclaw.qq.com",
      Referer: "https://qclaw.qq.com/",
    };

    const r = await ctx.http.post(url, body, headers, {
      timeout: ctx.timeout || this.timeout,
    });
    assertHttpResponse(r, this.constructor.name, url);

    let data;
    try {
      data = JSON.parse(r.body);
    } catch (e) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.PARSE,
        raw: truncate(r.body),
        note: e.message,
      });
    }

    // 顶层 ret 非 0 → 业务错误, 抛错 (data 可能含 msg)
    if (
      data &&
      typeof data === "object" &&
      data.ret != null &&
      data.ret !== 0
    ) {
      const msg = data.msg || data.message || `ret=${data.ret}`;
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: data,
        note: `qclaw ret=${data.ret} msg="${msg}"`,
      });
    }

    // Phase 6: 多路径尝试 (按真实响应优先排序)
    const candidates = [
      ["data", "resp", "data", "version_code"], // 真实 (2026-06-05 fixture)
      ["data", "resp", "data", "version"], // 旧版 / 服务端调整后
      ["data", "resp", "version_code"],
      ["data", "resp", "version"],
      ["data", "version_code"],
      ["data", "version"],
      ["resp", "data", "version_code"],
      ["version_code"],
      ["version"],
    ];
    for (const path of candidates) {
      const v = pluckPath(data, path);
      if (v != null && v !== "") {
        // QClaw 网关在 update_content 字段直返当前版本的更新日志原文 (含 emoji
        // + bullet 列表), 跟 app 内嵌"版本日志"窗口内容一致. 提取到 changelog
        // 字段, 用户点 ⓘ 展开 panel 时能看到具体更新点.
        const updateContent = pluckPath(data, [
          "data",
          "resp",
          "data",
          "update_content",
        ]);
        return new DetectorResult({
          version: String(v),
          raw: data,
          source: this.constructor.name,
          confidence: "high",
          note: `qclaw ${systemType} path=${path.join(".")}`,
          changelog: typeof updateContent === "string" ? updateContent : "",
          changelog_url: "https://qclaw.qq.com", // 官方主页作为兜底深链
          changelog_format: "md",
        });
      }
    }

    throw new DetectorError({
      detector: this.constructor.name,
      reason: REASONS.NO_VERSION,
      raw: data,
      note: "no version_code / version in chain",
    });
  }
}

function pluckPath(obj, path) {
  let node = obj;
  for (const seg of path) {
    if (node == null || typeof node !== "object") return null;
    node = node[seg];
  }
  return node;
}

module.exports = { QClawApiDetector };
