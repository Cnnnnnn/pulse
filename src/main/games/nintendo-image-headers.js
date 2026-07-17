/**
 * src/main/games/nintendo-image-headers.js
 *
 * assets.nintendo.com 对 Electron User-Agent 返回 404；
 * 在 session webRequest 层把 Nintendo 封面请求 UA 改成普通 Chrome。
 */

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const NINTENDO_WEBREQUEST_FILTER = {
  urls: ["https://assets.nintendo.com/*"],
};

function isNintendoAssetUrl(url) {
  try {
    return new URL(url).hostname === "assets.nintendo.com";
  } catch {
    return false;
  }
}

/**
 * @param {{ url: string, requestHeaders?: Record<string, string> }} details
 * @returns {{ requestHeaders: Record<string, string> }}
 */
function patchBeforeSendHeaders(details) {
  const incoming = details.requestHeaders || {};
  if (!isNintendoAssetUrl(details.url)) {
    return { requestHeaders: incoming };
  }
  return {
    requestHeaders: { ...incoming, "User-Agent": CHROME_UA },
  };
}

/**
 * @param {import("electron").Session | null | undefined} session
 */
function installNintendoImageHeaders(session) {
  const wr = session && session.webRequest;
  if (!wr || typeof wr.onBeforeSendHeaders !== "function") return;
  wr.onBeforeSendHeaders(NINTENDO_WEBREQUEST_FILTER, (details, callback) => {
    callback(patchBeforeSendHeaders(details));
  });
}

module.exports = {
  CHROME_UA,
  NINTENDO_WEBREQUEST_FILTER,
  isNintendoAssetUrl,
  patchBeforeSendHeaders,
  installNintendoImageHeaders,
};
