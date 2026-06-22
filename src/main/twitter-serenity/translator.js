/**
 * src/main/twitter-serenity/translator.js
 *
 * Tweet 翻译: 内存 LRU 200 + 调 shared-llm.translate.
 * Prompt 硬编码常量 (spec §6.1 决策: 不读 config.json).
 * 通过依赖注入接受 sharedLlm, 便于测试.
 */

const TWITTER_TRANSLATE_PROMPT = [
  "你是中文财经翻译,保留股票代码(如 $NVDA、$SIVE)、人名、公司名不译。",
  "风格:简洁、信息密度高、不加主观评论。",
  "输出:只输出中文译文,不加任何前缀。",
].join("\n");

const LRU_LIMIT = 200;

function createTranslator(deps = {}) {
  // 默认 require 真 shared-llm (生产路径); 测试通过 deps.sharedLlm 注入 mock
  const sharedLlm = deps.sharedLlm || require("../../ai/shared-llm.js");
  // Map 保持插入序, 淘汰时删 first (LRU 语义)
  const lru = new Map();

  async function translateTweet(tweet) {
    if (!tweet || !tweet.text) return "";
    const id = String(tweet.id);
    if (lru.has(id)) {
      // refresh: delete + re-set 让它变最新
      const v = lru.get(id);
      lru.delete(id);
      lru.set(id, v);
      return v;
    }
    const translated = await sharedLlm.translate(tweet.text, {
      prompt: TWITTER_TRANSLATE_PROMPT,
    });
    if (!translated) return "";
    lru.set(id, translated);
    if (lru.size > LRU_LIMIT) {
      const oldest = lru.keys().next().value;
      lru.delete(oldest);
    }
    return translated;
  }

  function getCached(id) {
    return lru.get(String(id)) || null;
  }

  function clear() {
    lru.clear();
  }

  return { translateTweet, getCached, clear, LRU_LIMIT };
}

module.exports = {
  createTranslator,
  TWITTER_TRANSLATE_PROMPT,
  LRU_LIMIT,
};
