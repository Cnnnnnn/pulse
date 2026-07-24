/**
 * src/renderer/version.ts
 *
 * 应用版本号单一来源. esbuild 构建时通过 --define:process.env.APP_VERSION
 * 注入 (值取自 package.json version), 见 scripts/build-renderer.js.
 *
 * 测试环境无 define 时回退 "0.0.0", 保证 UI 不崩.
 */
declare const process: { env?: { APP_VERSION?: string; NODE_ENV?: string } };
export const APP_VERSION = (process.env && process.env.APP_VERSION) || "0.0.0";
