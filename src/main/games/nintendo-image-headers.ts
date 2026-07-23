/**
 * src/main/games/nintendo-image-headers.ts
 *
 * assets.nintendo.com 对 Electron User-Agent 返回 404；
 * 在 session webRequest 层把 Nintendo 封面请求 UA 改成普通 Chrome。
 */
"use strict";

const { BROWSER_UA: CHROME_UA } = require("./normalize");

const NINTENDO_WEBREQUEST_FILTER: any = {
  urls: ["https://assets.nintendo.com/*"],
};

export function isNintendoAssetUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "assets.nintendo.com";
  } catch {
    return false;
  }
}

export function patchBeforeSendHeaders(details: any): any {
  const incoming = details.requestHeaders || {};
  if (!isNintendoAssetUrl(details.url)) {
    return { requestHeaders: incoming };
  }
  return {
    requestHeaders: { ...incoming, "User-Agent": CHROME_UA },
  };
}

export function installNintendoImageHeaders(session: any): void {
  const wr = session && session.webRequest;
  if (!wr || typeof wr.onBeforeSendHeaders !== "function") return;
  wr.onBeforeSendHeaders(NINTENDO_WEBREQUEST_FILTER, (details: any, callback: any) => {
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
