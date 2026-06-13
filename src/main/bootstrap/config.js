/**
 * src/main/bootstrap/config.js
 *
 * 启动时 config + 路径常量.
 * ARCH / CONFIG_PATH 仍从 main/index.js re-export 给测试.
 */

const fs = require("fs");
const path = require("path");
const { mainLog } = require("../log");
const { migrateConfigFile, isOldSchemaApp } = require("../../config/migrate");
const { validateConfig, sanitizeConfig } = require("../../config/schema");

const ARCH = process.arch === "arm64" ? "arm64" : "x64";
const PROJECT_ROOT = path.join(__dirname, "..", "..", "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config.json");
const CATEGORIES_JSON_PATH = path.join(
  PROJECT_ROOT,
  "config",
  "categories.json",
);
const APP_CATEGORY_JSON_PATH = path.join(
  PROJECT_ROOT,
  "config",
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
