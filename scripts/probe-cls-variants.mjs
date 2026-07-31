// 财联社端点变体探测：主端点 404，确认是否参数/路径问题，或整域 API 已变。
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0 Safari/537.36";

const VARIANTS = [
  ["no-query", "https://www.cls.cn/nodeapi/telegraphList"],
  ["with-app-os", "https://www.cls.cn/nodeapi/telegraphList?app=CailianpressWeb&os=web&rn=20"],
  ["rn-only", "https://www.cls.cn/nodeapi/telegraphList?rn=20"],
  ["detail-api3", "https://api3.cls.cn/share/article/1"],
  ["roll-v1", "https://www.cls.cn/v1/roll/get_roll_list?app=CailianpressWeb&os=web&rn=20"],
];

async function hit(url, headers) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(to);
    const buf = Buffer.from(await r.arrayBuffer());
    const head = buf.toString("utf-8").slice(0, 200).replace(/\n/g, " ");
    return { status: r.status, ct: r.headers.get("content-type"), bytes: buf.length, head };
  } catch (e) {
    return { status: "ERR", error: `${e.name}: ${e.message}` };
  }
}

(async () => {
  for (const [name, url] of VARIANTS) {
    const headers = {
      "User-Agent": UA,
      Referer: "https://www.cls.cn/telegraph",
      Accept: "application/json, */*",
    };
    const r = await hit(url, headers);
    console.log(`[${name}] ${url}`);
    console.log(`   ->`, JSON.stringify(r));
  }
})();
