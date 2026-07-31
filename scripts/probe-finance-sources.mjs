// scripts/probe-finance-sources.mjs
// 一次性只读探针：确认财经新闻/行情源可达、抓取真实字段形状、标注风险。
// 不落库、不改代码、无副作用。仅做单次 GET（不循环打压，避免触发限频）。

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0 Safari/537.36";

const SOURCES = [
  {
    key: "cls_telegraph",
    label: "财联社电报",
    url: "https://www.cls.cn/nodeapi/telegraphList?rn=20",
    type: "json",
    headers: {
      "User-Agent": UA,
      Referer: "https://www.cls.cn/telegraph",
      Accept: "application/json, */*",
    },
  },
  {
    key: "eastmoney_rss",
    label: "东方财富 RSS",
    url: "http://rss.eastmoney.com/rss_partener.xml",
    type: "rss",
    headers: {
      "User-Agent": UA,
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  },
  {
    key: "wallstreetcn_rss",
    label: "华尔街见闻 RSS",
    url: "https://dedicated.wallstreetcn.com/rss.xml",
    type: "rss",
    headers: {
      "User-Agent": UA,
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  },
  {
    key: "stats_rss",
    label: "国家统计局 RSS",
    url: "https://www.stats.gov.cn/sj/zxfb/rss.xml",
    type: "rss",
    headers: {
      "User-Agent": UA,
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  },
  {
    key: "sina_indices",
    label: "新浪行情(指数)",
    url: "http://hq.sinajs.cn/list=s_sh000001,s_sz399001,sz399006,sh000300",
    type: "sina",
    headers: {
      "User-Agent": UA,
      Referer: "https://finance.sina.com.cn",
      Accept: "*/*",
    },
  },
  {
    key: "sina_fx",
    label: "新浪行情(汇率 USD/CNY)",
    url: "http://hq.sinajs.cn/list=USDCNY",
    type: "sina",
    headers: {
      "User-Agent": UA,
      Referer: "https://finance.sina.com.cn",
      Accept: "*/*",
    },
  },
];

function extractRssItems(xml, max = 2) {
  const items = [];
  const re = /<item[\s\S]*?<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < max) {
    const block = m[0];
    const g = (tag) => {
      const mm = block.match(
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
      );
      return mm
        ? mm[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim()
        : null;
    };
    items.push({ title: g("title"), pubDate: g("pubDate"), link: g("link") });
  }
  return items;
}

function parseSina(body) {
  const rows = body
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const r of rows) {
    const mm = r.match(/hq_str_(\w+)="([^"]*)"/);
    if (mm) out.push({ symbol: mm[1], data: mm[2] });
  }
  return out;
}

// 粗略编码探测：含大量非 ASCII 且出现典型乱码字节（如 ä¸æµ·è¯ï¼）则疑似 GBK
function looksGarbled(text) {
  return /æµ·|ä¸|è¯|è¡/.test(text);
}

async function probe(src) {
  const res = {
    key: src.key,
    label: src.label,
    url: src.url,
    type: src.type,
    ok: false,
    status: null,
    contentType: null,
    bytes: 0,
    latencyMs: 0,
    error: null,
    fields: null,
    sample: null,
    garbled: false,
  };
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(src.url, { headers: src.headers, signal: ctrl.signal });
    clearTimeout(to);
    res.status = r.status;
    res.contentType = r.headers.get("content-type");
    const buf = Buffer.from(await r.arrayBuffer());
    res.bytes = buf.length;
    const text = buf.toString("utf-8");
    res.garbled = looksGarbled(text);
    if (!r.ok) {
      res.error = `HTTP ${r.status}`;
      return res;
    }
    if (src.type === "json") {
      const j = JSON.parse(text);
      const arr =
        j?.data?.roll_data || j?.data?.list || j?.data || (Array.isArray(j) ? j : null);
      if (!Array.isArray(arr)) {
        res.error = "未找到数组";
        res.sample = JSON.stringify(j).slice(0, 300);
        return res;
      }
      res.ok = true;
      const first = arr[0] || {};
      res.fields = Object.keys(first);
      res.sample = { count: arr.length, first };
    } else if (src.type === "rss") {
      const items = extractRssItems(text, 2);
      res.ok = items.length > 0;
      res.fields = ["title", "pubDate", "link"];
      res.sample = {
        itemCount: (text.match(/<item/g) || []).length,
        first: items[0],
      };
      if (items.length === 0) res.error = "未解析到 <item>";
    } else if (src.type === "sina") {
      const rows = parseSina(text);
      res.ok = rows.length > 0;
      res.fields = ["symbol", "data"];
      res.sample = rows.slice(0, 4);
      if (rows.length === 0) res.error = "未解析到 sina 行";
    }
  } catch (e) {
    res.error = `${e.name}: ${e.message}`;
  }
  res.latencyMs = Date.now() - t0;
  return res;
}

(async () => {
  const results = [];
  for (const s of SOURCES) {
    process.stdout.write(`probing ${s.label} ... `);
    const r = await probe(s);
    process.stdout.write(
      `${r.ok ? "OK" : "FAIL"} (status=${r.status ?? "-"}) ${r.latencyMs}ms bytes=${r.bytes}\n`,
    );
    results.push(r);
  }
  console.log("\n===== PROBE RESULT (JSON) =====");
  console.log(JSON.stringify(results, null, 2));
})();
