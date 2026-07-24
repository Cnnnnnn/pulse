/**
 * src/ai-usage/index.ts
 *
 * 统一导出 + main process 入口.
 * CommonJS, 跟 src/ai-sessions/ 一致.
 */

import { MiniMaxQuotaClient, ENDPOINTS } from "./client";
import * as normalize from "./normalize";

export { MiniMaxQuotaClient, ENDPOINTS, normalize };

module.exports = {
  MiniMaxQuotaClient,
  ENDPOINTS,
  normalize,
};
