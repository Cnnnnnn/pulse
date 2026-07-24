/**
 * tests/main/games/nintendo-image-headers.test.js
 *
 * Nintendo CDN 封面在 Electron UA 下 404 — 主进程 webRequest 改写 UA。
 */
import { describe, it, expect, vi } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../../_setup/require-main.cjs");

const {
  patchBeforeSendHeaders,
  installNintendoImageHeaders,
  NINTENDO_WEBREQUEST_FILTER,
  CHROME_UA,
} = requireMain("games/nintendo-image-headers");

describe("patchBeforeSendHeaders", () => {
  it("Nintendo 资产 URL 将 User-Agent 改为普通 Chrome", () => {
    const out = patchBeforeSendHeaders({
      url: "https://assets.nintendo.com/image/upload/c_pad,f_auto,q_auto,w_240/abc.jpg",
      requestHeaders: {
        "User-Agent": "Mozilla/5.0 Electron/37.0.0",
        Accept: "image/webp,*/*",
      },
    });
    expect(out.requestHeaders["User-Agent"]).toBe(CHROME_UA);
    expect(out.requestHeaders.Accept).toBe("image/webp,*/*");
  });

  it("非 Nintendo 域名不修改 headers", () => {
    const headers = {
      "User-Agent": "Mozilla/5.0 Electron/37.0.0",
      Accept: "image/webp,*/*",
    };
    const out = patchBeforeSendHeaders({
      url: "https://cdn.akamai.steamstatic.com/steam/apps/123/header.jpg",
      requestHeaders: headers,
    });
    expect(out).toEqual({ requestHeaders: headers });
  });

  it("复制 headers 对象，不 mutate 入参", () => {
    const headers = { "User-Agent": "Electron/37", Foo: "bar" };
    patchBeforeSendHeaders({
      url: "https://assets.nintendo.com/x.jpg",
      requestHeaders: headers,
    });
    expect(headers["User-Agent"]).toBe("Electron/37");
  });
});

describe("installNintendoImageHeaders", () => {
  it("只注册 assets.nintendo.com filter", () => {
    const onBeforeSendHeaders = vi.fn();
    installNintendoImageHeaders({
      webRequest: { onBeforeSendHeaders },
    });
    expect(onBeforeSendHeaders).toHaveBeenCalledWith(
      NINTENDO_WEBREQUEST_FILTER,
      expect.any(Function),
    );
  });

  it("注册的 listener 通过 callback 返回改写 UA 并保留其它 header", () => {
    let listener;
    const onBeforeSendHeaders = vi.fn((_filter, registeredListener) => {
      listener = registeredListener;
    });
    installNintendoImageHeaders({
      webRequest: { onBeforeSendHeaders },
    });

    const callback = vi.fn();
    listener({
      url: "https://assets.nintendo.com/image/upload/cover.jpg",
      requestHeaders: {
        "User-Agent": "Mozilla/5.0 Electron/37.0.0",
        Accept: "image/webp,*/*",
        "X-Test": "kept",
      },
    }, callback);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        "User-Agent": CHROME_UA,
        Accept: "image/webp,*/*",
        "X-Test": "kept",
      },
    });
  });

  it("session / webRequest 不可用时安全 no-op", () => {
    expect(() => installNintendoImageHeaders(null)).not.toThrow();
    expect(() => installNintendoImageHeaders({})).not.toThrow();
    expect(() => installNintendoImageHeaders({ webRequest: {} })).not.toThrow();
  });
});
