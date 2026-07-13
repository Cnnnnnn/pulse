/**
 * src/newcar/fetch-details.js
 *
 * P1 详情增强: 接入汽车数据 API 补全参数 / 价格 / 图册.
 * 失败静默降级返 null, 不阻断主列表.
 *
 * MVP: 不接真实 API, 直接返 null (签名 / 结构已留好, 供 P1 填充).
 * 真实实现示例 (伪代码):
 *   const r = await api.newCarFetchDetails({ id });
 *   return r?.ok ? normalizeDetails(r.details) : null;
 */

/**
 * @param {string} id
 * @returns {Promise<import('./types.js').CarDetails|null>}
 */
export async function fetchCarDetails(id) {
  try {
    // P1: 真实请求 + 归一化; 当前占位.
    // const r = await api.newCarFetchDetails({ id });
    // return r?.ok ? r.details : null;
    void id;
    return null;
  } catch {
    return null;
  }
}

export default fetchCarDetails;
