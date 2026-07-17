/**
 * src/main/search/tokenizer.js
 *
 * A3: 分词器. 中文走 bigram (二元组滑动窗口), 英文按空格/标点切.
 * 停用词过滤 + 去重. 零依赖.
 */

const STOPWORDS = new Set([
  // 中文高频虚词 (单字, bigram 不会等于这些, 但单独英文词会命中)
  '的', '了', '是', '和', '在', '有', '与', '或', '也', '都', '就', '而', '及',
  // 英文停用词
  'the', 'a', 'an', 'is', 'are', 'of', 'to', 'in', 'on', 'and', 'or', 'for',
]);

const CJK_RANGE = /[\u4e00-\u9fff]/;

function isCjk(ch) {
  return CJK_RANGE.test(ch);
}

/**
 * 中文连续段做 bigram. "人工智能" → ["人工", "工智", "智能"].
 * 单字不切 (太短无区分度).
 */
function bigramCjk(segment) {
  const tokens = [];
  for (let i = 0; i < segment.length - 1; i++) {
    tokens.push(segment.slice(i, i + 2));
  }
  return tokens;
}

/**
 * @param {string} text
 * @returns {string[]} 去重后的 token 数组
 */
function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const lower = text.toLowerCase();
  const tokens = new Set();
  let buf = '';

  const flushBuf = () => {
    if (buf.length === 0) return;
    if (isCjk(buf[0])) {
      // 中文段: bigram
      for (const t of bigramCjk(buf)) tokens.add(t);
    } else {
      // 英文/数字单词: 过滤单字符 (无区分度) 和停用词
      if (buf.length > 1 && !STOPWORDS.has(buf)) {
        tokens.add(buf);
      }
    }
    buf = '';
  };

  for (const ch of lower) {
    if (isCjk(ch)) {
      // 中文: 若 buf 是英文段先 flush
      if (buf && !isCjk(buf[0])) flushBuf();
      buf += ch;
    } else if (/[a-z0-9]/.test(ch)) {
      // 英文/数字: 若 buf 是中文段先 flush
      if (buf && isCjk(buf[0])) flushBuf();
      buf += ch;
    } else {
      // 标点/空格/其他: flush 当前 buf
      flushBuf();
    }
  }
  flushBuf();

  return [...tokens];
}

module.exports = { tokenize, STOPWORDS, bigramCjk };
