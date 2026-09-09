/**
 * src/main/ai-leaderboard/aa-key.ts
 *
 * Artificial Analysis API key 加载（镜像 movies/tmdb-env.ts 范式）:
 *   密钥库 vault（条目名 "artificial-analysis"）> 进程环境变量 > 项目根 .env。
 *
 * 为什么必须走 vault：打包版 process.cwd() 不是仓库根、读不到 .env，
 * 旧逻辑只有 env/.env 两条路 → 打包版恒 401、AA 视角空数据。
 * dev 下 .env 命中后 best-effort 种进 vault（同机 dev/packaged 共用 userData
 * 时打包版直接继承；vault 不可用则静默跳过，不影响本次取值）。
 *
 * 不做长期缓存：vault/env 每次调用现查（fetch 本身 24h TTL + 5min 请求缓存，
 * 频率极低），用户后补/换 key 无需重启。
 */

import * as fs from "fs";
import * as path from "path";
import {
  getSecretValue,
  hasEntryNamed,
  setEntry,
} from "../vault/secret-vault";

export const AA_VAULT_NAME = "artificial-analysis";

/** 读 .env 里的 ARTIFICIAL_ANALYSIS_API_KEY（支持引号包裹）；无文件/无 key 返回 ""。 */
function readDotenvKey(envFile: string): string {
  try {
    if (!envFile || !fs.existsSync(envFile)) return "";
    const txt = fs.readFileSync(envFile, "utf8");
    for (const line of txt.split("\n")) {
      if (/^\s*#/.test(line)) continue;
      const m = line.match(/^\s*ARTIFICIAL_ANALYSIS_API_KEY\s*=\s*(.+?)\s*$/);
      if (!m) continue;
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    }
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * dev 便利迁移：.env 有 key 且 vault 尚无条目 → 写入 vault（不删 .env，保持 dev 工作流）。
 * vault 不可用（no_safe_storage / 非 Electron 环境）静默失败。
 */
function migrateEnvKeyToVault(key: string): void {
  if (!key || hasEntryNamed(AA_VAULT_NAME)) return;
  try {
    setEntry({
      name: AA_VAULT_NAME,
      value: key,
      category: "内置功能",
      note: "Artificial Analysis API Key（AA 榜单，自动迁移自 .env）",
      upsert: true,
    });
  } catch {
    /* ignore */
  }
}

/**
 * AA key 解析链：vault → env → .env。全部未命中返回 ""（调用方发无 key 请求，上游 401）。
 * @param opts envFile 测试注入；缺省 process.cwd()/.env
 */
export function loadAaApiKey(opts: { envFile?: string } = {}): string {
  const fromVault = getSecretValue(AA_VAULT_NAME);
  if (fromVault && String(fromVault).trim()) {
    return String(fromVault).trim();
  }
  const fromProc = String(process.env.ARTIFICIAL_ANALYSIS_API_KEY || "").trim();
  if (fromProc) {
    migrateEnvKeyToVault(fromProc);
    return fromProc;
  }
  const envFile = opts.envFile != null ? opts.envFile : path.join(process.cwd(), ".env");
  const fromDot = readDotenvKey(envFile);
  if (fromDot) {
    migrateEnvKeyToVault(fromDot);
    return fromDot;
  }
  return "";
}

