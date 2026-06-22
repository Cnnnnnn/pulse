/**
 * src/renderer/twitter-serenity/TwitterSourcesSettings.jsx
 *
 * 镜像源管理 (spec §5.3): 列表 (URL/类型/优先级/状态) + 测试 + 删除 + 添加.
 */

import { useEffect, useState } from "preact/hooks";
import { api } from "../api.js";

function statusBadge(src) {
  if (src.enabled === false) return "⏸ 已禁用";
  return "?"; // 健康状态需 main 推送, v1 只显示静态信息
}

export function TwitterSourcesSettings() {
  const [sources, setSources] = useState([]);
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState("nitter");
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState({});

  useEffect(() => {
    // 防护: api.twitterSourcesList 在测试/非 Electron 环境可能是 noop (返回 undefined).
    // Promise.resolve 包装让它对非 Promise 也容错.
    Promise.resolve(api.twitterSourcesList()).then((r) =>
      setSources(Array.isArray(r) ? r : []),
    );
  }, []);

  async function addSrc() {
    if (!newUrl) return;
    await api.twitterSourcesAdd({
      id: `user-${Date.now()}`,
      type: newType,
      url: newUrl,
      enabled: true,
      priority: sources.length + 1,
    });
    setNewUrl("");
    const r = await api.twitterSourcesList();
    setSources(r || []);
  }

  async function removeSrc(id) {
    await api.twitterSourcesRemove(id);
    const r = await api.twitterSourcesList();
    setSources(r || []);
  }

  async function testSrc(src) {
    setTesting(src.id);
    setTestResult((prev) => ({ ...prev, [src.id]: null }));
    try {
      const r = await api.twitterSourcesTest(src);
      setTestResult((prev) => ({ ...prev, [src.id]: r }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div class="twitter-sources-settings">
      <h3>Serenity 镜像源</h3>
      <ul class="sources-list">
        {sources.map((src) => (
          <li key={src.id} class="source-row">
            <span class="source-url">{src.url}</span>
            <span class="source-type">{src.type}</span>
            <span class="source-priority">P{src.priority}</span>
            <span class="source-status">{statusBadge(src)}</span>
            <button
              type="button"
              onClick={() => testSrc(src)}
              disabled={testing === src.id}
            >
              {testing === src.id ? "测试中…" : "测试"}
            </button>
            <button type="button" onClick={() => removeSrc(src.id)}>
              删除
            </button>
            {testResult[src.id] && (
              <span class="source-test-result">
                {testResult[src.id].ok
                  ? `✓ ${testResult[src.id].durationMs}ms · ${testResult[src.id].count} 条`
                  : `✗ ${testResult[src.id].error}`}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div class="source-add">
        <select value={newType} onChange={(e) => setNewType(e.target.value)}>
          <option value="nitter">Nitter</option>
          <option value="rsshub">RSSHub</option>
          <option value="rss">通用 RSS</option>
        </select>
        <input
          value={newUrl}
          onInput={(e) => setNewUrl(e.target.value)}
          placeholder="https://..."
        />
        <button type="button" onClick={addSrc}>
          添加
        </button>
      </div>
    </div>
  );
}
