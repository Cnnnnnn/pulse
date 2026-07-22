import type { api, metalsApi, platformInfo, pulse } from "../../preload";

declare global {
  interface Window {
    api: typeof api;
    pulse: typeof pulse;
    metalsApi: typeof metalsApi;
    platformInfo: typeof platformInfo;
  }
}

export {};
