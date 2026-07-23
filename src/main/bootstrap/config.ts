/**
 * src/main/bootstrap/config.ts
 *
 * 启动时 config + 路径常量.
 * ARCH / CONFIG_PATH 仍从 main/index.js re-export 给测试.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type * as fsType from "node:fs";
import type * as pathType from "node:path";

const fs: typeof fsType = require("fs");
const path: typeof pathType = require("path");
const { mainLog } = require("../log.ts");
const { migrateConfigFile, isOldSchemaApp } = require("../../config/migrate");
const { validateConfig, sanitizeConfig } = require("../../config/schema");

const ARCH = process.arch === "arm64" ? "arm64" : "x64";
const PROJECT_ROOT = path.join(__dirname, "..", "..", "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config.json");
const CATEGORIES_JSON_PATH = path.join(
  PROJECT_ROOT,
  "src",
  "config",
  "data",
  "categories.json",
);
const APP_CATEGORY_JSON_PATH = path.join(
  PROJECT_ROOT,
  "src",
  "config",
  "data",
  "app-category.json",
);

function loadConfig() {
  let parsed = null;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    parsed = JSON.parse(raw);
  } catch (err) {
    mainLog.error(`config read/parse failed: ${err.message}`);
    return sanitizeConfig(null);
  }

  const oldShape =
    Array.isArray(parsed && parsed.apps) && parsed.apps.some(isOldSchemaApp);
  if (oldShape) {
    try {
      const r = migrateConfigFile({ configPath: CONFIG_PATH });
      if (r.migrated) {
        mainLog.info(`config migrated; backup=${r.backupPath}`);
        parsed = r.config;
      }
    } catch (err) {
      mainLog.error(`config migrate failed: ${err.message}`);
    }
  }

  const v = validateConfig(parsed);
  if (!v.valid) {
    mainLog.warn(`config validation: ${v.errors.slice(0, 5).join(" | ")}`);
  }
  return sanitizeConfig(v.config || parsed);
}

module.exports = {
  ARCH,
  PROJECT_ROOT,
  CONFIG_PATH,
  CATEGORIES_JSON_PATH,
  APP_CATEGORY_JSON_PATH,
  loadConfig,
};
