/**
 * src/ai-usage/index.js
 *
 * 统一导出 + main process 入口.
 * CommonJS, 跟 src/ai-sessions/ 一致.
 */

const { MiniMaxQuotaClient, ENDPOINTS } = require("./client");
const normalize = require("./normalize");

module.exports = {
  MiniMaxQuotaClient,
  ENDPOINTS,
  normalize,
};
