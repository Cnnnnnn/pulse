/**
 * src/main/ai-leaderboard/hf-token.ts
 *
 * HuggingFace token 加载（镜像同目录 aa-key.ts / movies/tmdb-env.ts 范式）:
 *   密钥库 vault（条目名 "huggingface"）> 进程环境变量（HF_TOKEN / HUGGINGFACE_TOKEN）> 项目根 .env。
 *
 * 为什么值得配：Arena 主源 datasets-server 匿名 /filter 限流严格且冷查询要现场建索引
 * （2026-09 实测间歇挂起 45s+）；带 token 额度显著放大，冷启动慢可大幅缓解。
 * Hub API（fetcher-huggingface）同样受益。
 *
 * 不做长期缓存：vault/env 每次调用现查（fetch 有 24h/6h TTL，频率极低），
 * 用户后补 token 无需重启。dev 下 env/.env 命中后 best-effort 种入 vault。
 */

import * as fs from "fs";
import * as path from "path";
import {
  getSecretValue,
  hasEntryNamed,
  setEntry,
} from "../vault/secret-vault";

export const HF_VAULT_NAME = "huggingface";

/** 读 .env 里的 HF token（HF_TOKEN / HUGGINGFACE_TOKEN 均可，支持引号包裹）；无则 ""。 */
function readDotenvKey(envFile: string): string {
  try {
    if (!envFile || !fs.existsSync(envFile)) return "";
    const txt = fs.readFileSync(envFile, "utf8");
    for (const line of txt.split("\n")) {
      if (/^\s*#/.test(line)) continue;
      const m = line.match(/^\s*(?:HF_TOKEN|HUGGINGFACE_TOKEN)\s*=\s*(.+?)\s*$/);
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

/** dev 便利迁移：env/.env 有 token 且 vault 尚无条目 → 写入 vault（不删 .env）。 */
function migrateEnvKeyToVault(key: string): void {
  if (!key || hasEntryNamed(HF_VAULT_NAME)) return;
  try {
    setEntry({
      name: HF_VAULT_NAME,
      value: key,
      category: "内置功能",
      note: "HuggingFace Token（AI 榜单 datasets-server / Hub API，自动迁移自 .env）",
      upsert: true,
    });
  } catch {
    /* ignore */
  }
}

/**
 * HF token 解析链：vault → env → .env。全部未命中返回 ""（调用方发匿名请求）。
 * @param opts envFile 测试注入；缺省 process.cwd()/.env
 */
export function loadHfToken(opts: { envFile?: string } = {}): string {
  const fromVault = getSecretValue(HF_VAULT_NAME);
  if (fromVault && String(fromVault).trim()) {
    return String(fromVault).trim();
  }
  const fromProc = String(process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "").trim();
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

