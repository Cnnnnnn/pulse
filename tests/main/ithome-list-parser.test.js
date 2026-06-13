/**
 * tests/main/ithome-list-parser.test.js
 */

import { describe, it, expect } from "vitest";
const { parseIthomeListPage } = require("../../src/main/ithome/list-parser.js");

const SAMPLE = `
<div id="list">
<ul>
<li>
        <a class="c" href="//it.ithome.com/" data-ot="2026-06-12T23:59:39.0670000+08:00" target="_blank">[IT资讯]</a>
        <a class="t" href="https://www.ithome.com/0/963/729.htm" target="_blank">测试标题 A</a>
        <i>2026-06-12 23:59:39</i>
    </li>
<li>
        <a class="c" href="//it.ithome.com/" target="_blank">[数码之家]</a>
        <a class="t" href="//www.ithome.com/0/963/728.htm" target="_blank">测试标题 B</a>
        <i>2026-06-12 15:00:00</i>
    </li>
</ul>
</div>`;

describe("ithome list-parser", () => {
  it("parseIthomeListPage extracts articles", () => {
    const items = parseIthomeListPage(SAMPLE, "2026-06-12");
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("测试标题 A");
    expect(items[0].category).toBe("[IT资讯]");
    expect(items[0].dateKey).toBe("2026-06-12");
    expect(items[1].link).toBe("https://www.ithome.com/0/963/728.htm");
  });
});
