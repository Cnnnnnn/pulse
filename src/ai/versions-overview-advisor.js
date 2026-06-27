/**
 * src/ai/versions-overview-advisor.js
 *
 * ponytail: V1 静态模板, 等真实 AI 接入再接 shared-llm. 真正 LLM 集成是后续 task,
 * 当前 contract 已经是 (ctx) => string, 后续替换 stub 不动 IPC.
 */
async function aiOverviewSummary(_ctx) {
  return "本周共监控若干 app, 建议优先升级安全相关更新, 然后是高频使用的开发工具.";
}

module.exports = { aiOverviewSummary };