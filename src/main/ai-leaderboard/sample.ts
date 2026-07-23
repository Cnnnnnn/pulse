/**
 * src/main/ai-leaderboard/sample.ts
 *
 * 兜底L2：内置 sample 加载器。当 Arena + AA + OpenRouter 全失败时，
 * 用它填充，保证 UI 永远不空白。每条 source:'sample'（renderer 显示"示例"徽标）。
 *
 * 这是精选的、贴近真实的占位数据（知名模型 + 合理分值），仅用于演示与布局，
 * 非实时。要接实时数据，请配置 .env 或保证网络可达 Arena / AA。
 */

const fs = require("fs");
const path = require("path");
const { SOURCE, toAiModel } = require("./types.ts");

export const SAMPLE_PATH = path.join(__dirname, "sample.json");

let _cache: any[] | null = null;

/**
 * 读取内置 sample，返回 AiModel[]（统一标 source:'sample'、isSample:true）。
 * @returns {object[]}
 */
export function getSampleModels(): any[] {
  if (_cache) return _cache;
  let raw: any[] = [];
  try {
    const txt = fs.readFileSync(SAMPLE_PATH, "utf8");
    const parsed = JSON.parse(txt);
    raw = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    raw = [];
  }
  _cache = raw.map((m) =>
    toAiModel({
      ...m,
      isSample: true,
      sources: {
        arena: SOURCE.SAMPLE,
        aa: SOURCE.SAMPLE,
        openrouter: SOURCE.SAMPLE,
      },
    }),
  );
  return _cache;
}

module.exports = { getSampleModels, SAMPLE_PATH };
