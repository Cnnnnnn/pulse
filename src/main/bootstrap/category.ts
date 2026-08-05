/**
 * src/main/bootstrap/category.ts
 *
 * 启动期 category config 加载 + LLM 批量分类未映射 app.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type * as fsType from "node:fs";

const fs: typeof fsType = require("fs");
import { mainLog } from "../log";
import * as categoryConfig from "../../config/category";
import { HttpClient } from "../http-client";
import { CATEGORIES_JSON_PATH, APP_CATEGORY_JSON_PATH } from "./config";

/**
 * 加载 category config (categories.json + app-category.json) → setData 注入.
 * 失败时 log warn, 不 throw.
 */
export function loadCategoryConfig() {
  let cats = null;
  let map = null;

  try {
    const raw = fs.readFileSync(CATEGORIES_JSON_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.categories) &&
      parsed.categories.length > 0
    ) {
      cats = parsed.categories;
    }
  } catch (err: any) {
    mainLog.warn(`[category] categories.json read failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const raw = fs.readFileSync(APP_CATEGORY_JSON_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.mapping && typeof parsed.mapping === "object") {
      map = parsed.mapping;
    }
  } catch (err: any) {
    mainLog.warn(`[category] app-category.json read failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (cats === null || map === null) {
    categoryConfig.setData({ source: "fallback" });
    mainLog.warn("[category] using hardcoded defaults (failed to read disk)");
    return;
  }

  categoryConfig.setData({ cats, map, source: "disk" });
  const status = categoryConfig.getLoadStatus();
  if (status.warnings.length > 0) {
    mainLog.warn(`[category] load warnings: ${status.warnings.join("; ")}`);
  }
  mainLog.info(
    `[category] loaded ${cats.length} categories, ${Object.keys(map).length} mappings`,
  );
}

/**
 * Step B (LLM classify): 启动期同步对未分类的 app 走 LLM 批量分类.
 * 失败 graceful — log warn 不 throw.
 * @param {object} runtimeConfig
 * @param {object} deps
 * @param {object} deps.stateStore
 * @param {function} [deps.llmCaller]  可选, 测试用; 不传则走内置 ollama caller.
 *                                     signature: async (systemMsg: any, userMsg: any) => string
 */
export async function classifyUnmappedAppsByLLM(runtimeConfig: any, deps: any) {
  const { stateStore, llmCaller: externalLlmCaller } = deps;
  const t0 = Date.now();
  if (
    !runtimeConfig ||
    !Array.isArray(runtimeConfig.apps) ||
    runtimeConfig.apps.length === 0
  ) {
    return;
  }
  // [v2.16] 旧 cache 加载同步做 — 即便 LLM 跑失败 / ollama 不在, 历史分类立即可见.
  // 拆出来是因为外面 (main/index.js) 改成 fire-and-forget, 不再等这步.
  // 把同步部分合进 LLM 调用里会让旧 cache 也被延后注入, 是个回归.
  const oldCache = stateStore.loadLLMClassifyCache();
  if (Object.keys(oldCache).length > 0) {
    categoryConfig.setLLMCache(oldCache);
    mainLog.info(
      `[category] LLM cache loaded: ${Object.keys(oldCache).length} entries`,
    );
  }

  const unmapped: any[] = [];
  for (const app of runtimeConfig.apps) {
    if (!app || typeof app.name !== "string" || app.name.length === 0) continue;
    // [v2.16] 注意: getCategory 现在会查到刚注入的 LLM cache (上一步), 所以已分类的会跳过
    if (categoryConfig.getCategory(app.name) !== "other") continue;
    const heur = categoryConfig.classifyByHeuristic(app);
    unmapped.push({
      name: app.name,
      bundle: app.bundle,
      download_url: app.download_url,
      _heuristic: heur || undefined,
    });
  }
  if (unmapped.length === 0) {
    mainLog.info("[category] all apps already classified, skip LLM");
    return;
  }
  mainLog.info(`[category] ${unmapped.length} unmapped apps → LLM classify`);

  const llmCaller = externalLlmCaller || defaultOllamaCaller();
  let systemMsg;
  try {
    const { resolvePrompt } = require("../../ai/prompt-registry.js");
    const validCatIds = categoryConfig.getAllCategories().map((c: any) => c.id);
    const prompt = resolvePrompt("category_classify");
    systemMsg = [
      prompt.system,
      prompt.rules.replace(/\{\{CATEGORY_IDS\}\}/g, validCatIds.join(", ")),
    ].join("\n");
  } catch {
    systemMsg = undefined;
  }

  let llmResult = {};
  try {
    llmResult = await categoryConfig.classifyByLLM(unmapped, {
      llmCaller,
      timeoutMs: 28_000,
      systemMsg,
    });
  } catch (err: any) {
    mainLog.warn(`[category] LLM classify threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (Object.keys(llmResult).length > 0) {
    categoryConfig.setLLMCache(llmResult);
    stateStore.saveLLMClassifyCache(llmResult);
    mainLog.info(
      `[category] LLM classified ${Object.keys(llmResult).length}/${unmapped.length} apps in ${Date.now() - t0}ms: ${Object.entries(
        llmResult,
      )
        .map(([k, v]) => `${k}→${v}`)
        .join(", ")}`,
    );
  } else {
    mainLog.warn(
      `[category] LLM classify returned 0 results in ${Date.now() - t0}ms (apps will fall through to 'other')`,
    );
  }
}

/**
 * 默认 ollama caller — 内置 localhost:11434 + qwen2.5-coder:7b.
 * 拆成 named function 是为了让 (a) deps.llmCaller override 走快速路径
 * (b) 单测能 mock ollama 这一层 (不用 stub HttpClient).
 */
function defaultOllamaCaller() {
  const host = "http://127.0.0.1:11434";
  const model = "qwen2.5-coder:7b";
  const http = new HttpClient({ timeout: 30_000, maxRetries: 0 });
  return async (systemMsg: any, userMsg: any) => {
    const r = await http.post(
      `${host}/api/chat`,
      {
        model,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: userMsg },
        ],
        stream: false,
        options: { num_predict: 1024, temperature: 0.1 },
      },
      { "Content-Type": "application/json" },
      { timeout: 25_000 },
    );
    if (r.error)
      throw new Error(`llm caller: ${r.error} (${r.status || "no_status"})`);
    if (r.status < 200 || r.status >= 300) {
      throw new Error(
        `llm caller: http_status_${r.status} body=${(r.body || "").slice(0, 200)}`,
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(typeof r.body === "string" ? r.body : String(r.body ?? ""));
    } catch (err: any) {
      throw new Error(`llm caller: response not JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    const content =
      parsed && parsed.message && typeof parsed.message.content === "string"
        ? parsed.message.content
        : "";
    return content;
  };
}

/**
 * [v2.16] 同步注入历史 LLM cache — fire-and-forget 拆分, 让 bootstrap 立即可用
 * 旧分类, 不必等异步 LLM 跑完. 跟 classifyUnmappedAppsByLLM 内的 cache 加载逻辑一致.
 *
 * 用法: bootstrap() 启动时同步调一次, 把 state.json 里的历史 LLM 分类注入 module-level
 *      Map; 之后 getCategory() 立即能看到. classifyUnmappedAppsByLLM 内部会再次注入
 *      (会覆盖, 但内容相同, 幂等), 所以重复注入是安全的.
 *
 * @param {object} deps
 * @param {object} deps.stateStore
 */
export function primeLLMCacheFromDisk(deps: any) {
  const { stateStore } = deps;
  try {
    const oldCache = stateStore.loadLLMClassifyCache();
    if (Object.keys(oldCache).length > 0) {
      categoryConfig.setLLMCache(oldCache);
      mainLog.info(
        `[category] LLM cache primed: ${Object.keys(oldCache).length} entries`,
      );
    }
  } catch (err: any) {
    mainLog.warn(`[category] prime LLM cache failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

module.exports = {
  loadCategoryConfig,
  classifyUnmappedAppsByLLM,
  primeLLMCacheFromDisk,
};