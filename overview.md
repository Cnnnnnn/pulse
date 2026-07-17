# GitHub Token 保存后仍报错 — 根因定位与修复

## 问题
用户在「设置 → GitHub」保存了 Personal Access Token，但点击「检查更新」仍然报错。

## 根因（用系统化调试法定位，非猜测）
先写了一个**决定性测试** `tests/renderer/github-token-flow.test.js`，证明 `checkGithubUpdates → api.githubFetchRelease` 在 `githubToken.value` 非空时**确实把 token 透传**给主进程。链路本身正确 → 错误不在这里。

真正的两个根因：

1. **401 被误分类为"仓库不存在"**（主因）
   - 主进程 `fetchRepoMeta` / `fetchRepoRelease` 把「任何非 200」都归为 `not_found`（提示"仓库不存在或地址错误"）。
   - 但 GitHub 对**无效 / 已失效 / 被吊销的 Token 返回 401**。结果是：用户贴了 token，仓库明明存在，却看到"仓库不存在"——误以为 token 没生效。
   - 你的 token 很可能正是之前贴在对话里、我们建议你撤销重置的那串（或已过期），所以即便"保存了"也仍报 401。

2. **Token 加载存在竞态**
   - `loadGithubSettings()` 只在 GitHub 视图挂载时才调用；App 启动时不加载 → 若 GitHub 视图还没打开，`githubToken` 信号为空，鉴权不生效。
   - Settings 输入框用 `useState(githubToken.value)` 初始化，视图未加载时拿到空值，重新打开设置看到空白字段，容易误以为"没保存上"。

## 修复（已提交 b60e6e4，已 push main）
- 主进程：将 **401 单独归类为 `auth_invalid`**（不再误报成 not_found）。
- `githubReasonText`：新增 `auth_invalid` → "GitHub Token 无效或已失效，请在设置 → GitHub 中重新生成"。
- 检查更新 toast：对 `auth_invalid` 额外提示"请在 设置 → GitHub 中重新生成 Token"。
- `AppShell`：应用启动即调用 `loadGithubSettings()`，确保保存的 Token 始终进入信号。
- `SettingsPage`：打开 GitHub 设置区块时回填已保存的 Token，字段不再显示空白。

## 验证
- 新增测试：token 透传（3 项，证明链路正确）+ `auth_invalid` 文案（1 项）。
- 全量测试 **4011 passed / 4 skipped / 0 failed**（原 4007 → 现 4011）。

## 给你的下一步
重新拉起应用（已 `npm run build:renderer` 重建 dist）后：
- 如果这次看到提示 **"GitHub Token 无效或已失效"** → 说明你保存的那串 token 确实失效/被吊销了。请到 https://github.com/settings/tokens 重新生成一个 classic token（无需 scope 即可读公开仓库），在「设置 → GitHub」里重新保存即可。
- 如果检查更新变回成功 / "已是最新版本" → token 已生效。
- ⚠️ 之前贴在对话里的那串明文 token 建议已在 GitHub 后台撤销，避免泄露风险。
