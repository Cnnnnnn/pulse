/**
 * src/stocks/stock-search.js
 *
 * 模糊搜个股 (加自选用). 走东财搜索建议接口.
 * 跟 fund-search.js 同套路: 纯包装 HttpClient, 返 [{code,name,industry}].
 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

/**
 * @param {string} query  代码或名称片段
 * @param {{get:(url,opts)=>Promise<{status:number,body:string,error?:string}>}} httpClient
 * @returns {Promise<Array<{code:string,name:string,industry:string}>>}
 */
async function searchStocks(query, httpClient) {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(q)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=15`;
  try {
    const r = await httpClient.get(url, {
      headers: { "User-Agent": UA },
      timeout: 6000,
    });
    if (r.error || r.status !== 200 || !r.body) return [];
    const j = JSON.parse(r.body);
    const list =
      (j && j.QuotationCodeTable && j.QuotationCodeTable.Data) || [];
    return list
      .filter((x) => x && /^\d{6}$/.test(String(x.Code)))
      .map((x) => ({
        code: String(x.Code),
        name: x.Name || "",
        industry: "",
      }));
  } catch {
    return [];
  }
}

module.exports = { searchStocks };
