/**
 * src/detectors/redirect-base.js
 *
 * cursor-redirect + redirect-filename 共用的 HEAD 重定向链 + GET 兜底逻辑.
 */

const { DetectorError, REASONS } = require("./errors");

function absUrl(loc, base) {
  if (!loc) return base;
  if (loc.startsWith("http://") || loc.startsWith("https://")) return loc;
  try {
    const u = new URL(base);
    if (loc.startsWith("//")) return `${u.protocol}${loc}`;
    if (loc.startsWith("/")) return `${u.protocol}//${u.host}${loc}`;
    return `${u.protocol}//${u.host}/${loc}`;
  } catch {
    return loc;
  }
}

/**
 * HEAD 跟随重定向链 (follow=false, 手动解析 Location).
 * @returns {{ current: string, finalUrl: string, lastStatus: number, lastAllowHeader: string }}
 */
async function followHeadRedirects(ctx, startUrl, opts) {
  const { detector, timeout, maxHops = 5 } = opts;
  let current = startUrl;
  let finalUrl = startUrl;
  let lastStatus = 0;
  let lastAllowHeader = "";
  for (let i = 0; i < maxHops; i++) {
    const r = await ctx.http.head(current, { timeout, follow: false });
    if (r.error === "timeout") {
      throw new DetectorError({
        detector,
        reason: REASONS.TIMEOUT,
        note: current,
      });
    }
    if (r.error === "network") {
      throw new DetectorError({
        detector,
        reason: REASONS.NETWORK,
        note: current,
      });
    }
    lastStatus = r.status;
    if (r.headers && r.headers.allow) {
      lastAllowHeader = String(r.headers.allow).toUpperCase();
    }
    if (r.status >= 300 && r.status < 400 && r.headers && r.headers.location) {
      current = absUrl(r.headers.location, current);
      continue;
    }
    finalUrl = r.finalUrl || current;
    break;
  }
  return {
    current,
    finalUrl: finalUrl || current,
    lastStatus,
    lastAllowHeader,
  };
}

/**
 * HEAD 4xx/405 + Allow:GET 时 GET 兜底, 否则按 lastStatus 抛 HTTP 错.
 */
async function resolveFinalUrlAfterHead(ctx, opts) {
  const {
    detector,
    current,
    finalUrl,
    lastStatus,
    lastAllowHeader,
    getOptions,
    tooLargeNote,
  } = opts;
  const needsGet =
    lastStatus === 405 ||
    (lastStatus >= 400 && lastStatus < 500 && /GET/.test(lastAllowHeader));
  if (!needsGet) {
    if (lastStatus >= 400 && lastStatus < 500) {
      throw new DetectorError({
        detector,
        reason: REASONS.HTTP_4XX,
        httpStatus: lastStatus,
        note: finalUrl,
      });
    }
    if (lastStatus >= 500) {
      throw new DetectorError({
        detector,
        reason: REASONS.HTTP_5XX,
        httpStatus: lastStatus,
        note: finalUrl,
      });
    }
    return finalUrl;
  }

  const getResp = await ctx.http.get(current, getOptions);
  if (getResp.error === "timeout") {
    throw new DetectorError({
      detector,
      reason: REASONS.TIMEOUT,
      note: current,
    });
  }
  if (getResp.error === "network") {
    throw new DetectorError({
      detector,
      reason: REASONS.NETWORK,
      note: current,
    });
  }
  if (getResp.error === "too_large") {
    throw new DetectorError({
      detector,
      reason: REASONS.TOO_LARGE,
      note: tooLargeNote || "response body too large",
    });
  }
  if (getResp.status >= 400 && getResp.status < 500) {
    throw new DetectorError({
      detector,
      reason: REASONS.HTTP_4XX,
      httpStatus: getResp.status,
      note: current,
    });
  }
  if (getResp.status >= 500) {
    throw new DetectorError({
      detector,
      reason: REASONS.HTTP_5XX,
      httpStatus: getResp.status,
      note: current,
    });
  }
  return getResp.finalUrl || current;
}

/** 从 URL 末段文件名提取 semver-ish 版本 */
function extractVersionFromFilename(finalUrl) {
  const filename = finalUrl.split("/").pop() || "";
  const m = filename.match(/[vV]?(\d+\.\d+(?:\.\d+)*)/);
  if (!m) return null;
  let v = m[1];
  if (v.startsWith("v") || v.startsWith("V")) v = v.slice(1);
  return { version: v, filename };
}

module.exports = {
  absUrl,
  followHeadRedirects,
  resolveFinalUrlAfterHead,
  extractVersionFromFilename,
};
