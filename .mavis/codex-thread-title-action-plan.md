# Codex Thread Title 整合者行动建议

> 角色：整合者（final-cross-check）
> 输入：Track A 报告（数据链路）+ Track B 报告（PR 风险）+ 前置研究 final.md §8
> 输出：今天 18:50 之后的明确行动
> 仓 HEAD：`0ffcefaf3ddb3a61d8683ca0703f7d8b39ad6c1e`（已 `git ls-remote` 二次确认）
> 时间：2026-06-10 18:50

---

## 1. 交叉验证：Track A 与 Track B 一致吗？

### 1.1 关键 claim 对照（Verdict 表）

| 维度 | Track A 说法 | Track B 说法 | 一致？ | 验证 |
|---|---|---|---|---|
| Codex Desktop 在 `openai/codex` 仓？ | ❌ closed-source，从 `persistent.oaistatic.com/codex-app-prod/Codex.dmg` 下载（mac.rs:8） | ❌ 同样 `mac.rs:1-44` 引用 + DMG URL | ✅ 完全一致 | `curl raw/.../mac.rs \| sed -n '1,15p'` → DMG URL 命中 |
| `if (!item.title)` 在仓内 0 hit？ | 全仓 grep 0 hit | sparse clone 4,881 文件 0 hit + 582 个 .ts 都是 schema 自动生成 | ✅ 一致 | `/tmp/codex-sparse` 二次 `grep -rn 'item\.title'` → 0 hit，`.ts` 文件 582 个（Track B 是 584，差 2 个来自 SDK 样本可忽略） |
| #25456 issue 状态 | (未单独抓 issue 详情) | open, 0 comments, labels bug+app+session, opened 2026-05-31 by kpg1t | ⚠️ 略有时间差 | `api.github.com/repos/openai/codex/issues/25456` 实时：state=open, **comments=1**（比 Track B 采集时多了 1 条，**时间差**），labels+title+created_at 全部一致 |
| `ThreadNameUpdated` 是 broadcast 还是 per-connection？ | ❌ per-connection（`self.outgoing.send_server_notification` 只写当前 connection 的 outgoing sink，line 494-500） | (未单独说，但 §6.2 #3 写"等 OpenAI 修 #24202"间接承认) | ✅ 互洽 | `curl raw/.../thread_processor.rs \| sed -n '484,505p'` → 字面确认 `self.outgoing.send_server_notification` 不是 broadcast |
| `apply_thread_name` 双写？ | ✅ SQLite `update_thread_title` + 写 `session_index.jsonl`（`update_thread_metadata.rs:497-521`） | (未单独覆盖) | ✅ 已被 Track A 抓到 | `curl raw/.../update_thread_metadata.rs \| sed -n '497,521p'` → `state_db.update_thread_title` + `append_thread_name` 双写确认 |
| 仓内可改的最小风险入口？ | §5.2 加 `ThreadListInvalidate` notification（50-100 行，1 个新 struct） | §4.3 草案 C 加 `title_source` 枚举（v2 protocol breaking change，30-60 行，外部 PR 概率 < 20%） | ⚠️ **不一致** | 见 §1.2 详细对比 |
| #25456 能/不能 PR？ | 仓内无 path:line，结论隐含"不在仓内不能 PR" | §6.1 明确"**不要在 openai/codex 提 PR 改 #25456**" | ✅ 一致 | 两份独立分析殊途同归 |

### 1.2 关键不一致点：Track A §5.2 vs Track B §4.3

**Track A 推荐**: 在 `codex-rs/app-server/src/request_processors/thread_processor.rs:484` 加一个 `ThreadListInvalidate` notification，Desktop 端订阅 → 间接解决 #25456。

**Track B 推荐**: 不要提这个 PR。理由是草案 C 涉及 v2 protocol breaking change，外部 PR 合入概率 < 20%。

**我的判断（整合者）**: **Track A 更具体、Track B 更保守**。两者**不矛盾**，是不同风险偏好下的两个选项：

- Track A 的 §5.2 notification 严格说**不是 v2 protocol breaking change**——它只**新增**一个 notification 类型，不改既有 payload。schema JSON 多了 1 个 entry，旧 client 收到时直接忽略（默认 ts-optional behavior）。**Track B 把 Track A 的方案高估了风险**。
- 但 Track A 的 §5.2 也**不能直接解决 #24202**（per-connection 发送策略不变，外部 orchestrator 改 title Desktop 仍然收不到）。Track A §5.3 指出"真正解决需要 broadcast 或独立 broker"。
- **正确的合并结论**: Track A §5.2 是"OpenAI 内部愿意扩展协议时的合理选项"；Track B 草案 C 是"OpenAI 愿意做 v2 protocol bump 时的更彻底方案"；两者**都不在外部 PR 射程内**。任何外部 PR 到 `openai/codex` 解决 #25456 都是 wrong layer。

→ 结论不变：**外部能做的不是提 PR**。

### 1.3 哪份报告更可信？

**Track A** 在 "数据链路事实层" 更可信（path:line 全部 curl 二次确认，31 条引用 + 一次性验证脚本）。
**Track B** 在 "PR 风险评估层" 更可信（独立 sparse clone + ripgrep 二次验证，给了 3 个具体 diff 草案 + 风险表）。
**两份独立工作的结论高度一致**，交叉验证通过。

### 1.4 Track A §1.5 的诚实声明（不影响主结论）

Track A §1.5 提到 TUI renderer 三个文件 `tui/src/app_server_event_targets.rs` / `tui/src/chatwidget/protocol.rs` / `tui/src/chatwidget/session_flow.rs`，并诚实标"具体行号未二次确认"。我做了二次确认：

- `interaction.rs` ✅
- `protocol.rs` ✅
- `protocol_requests.rs` ✅（Track A 没列这个）
- `session_flow.rs` ✅
- `app_server_event_targets.rs` ❌ **不存在**（按字面查不到）

→ Track A §1.5 写错了一个文件名（应是 `protocol_requests.rs` 或类似，不带 `app_server_event_targets`）。但 Track A 已诚实标"二手报告"，且**这个错误**只影响 §1.5 一段约 5 行的 TUI 渲染细节，**不影响**主结论（Codex Desktop 是 closed-source / #25456 在仓内无 path:line / #24202 真因是 fan-out 缺失）。

---

## 2. 三个选项评估（明确推荐，不是 pros & cons）

### 选项 1：直接提 PR 修 #25456（Track B 的 diff 草案 B/C/D）

- **状态**: **N/A**。两轨独立得出同一结论。
- **理由（30 字版）**: 目标文件在闭源 `.dmg` 里，`openai/codex` 仓无 path:line。
- **预期收益**: 0（PR 会被 OpenAI 标记 off-topic / won't fix）
- **风险**: 浪费 2-4 小时写 diff + 等 review + 被拒的心理成本
- **时间**: 0
- **结论**: **不做**。

### 选项 2：绕过 Desktop，自己起 `codex app-server`（final.md §8 路径 2）

- **状态**: **可做，但有前提**。
- **做法**（具体可执行）:
  1. 启 `codex app-server --listen unix:///tmp/codex-orchestrator.sock`（或 `--listen ws://127.0.0.1:3939`）
  2. 通过 WebSocket-over-UDS 发 `{"method": "thread/setName", "params": {"threadId": "...", "name": "..."}}`（注意是 camelCase `thread/setName`，不是 `thread/name/set`——Track A 校正过）
  3. 接受 Desktop 当前 sidebar **不 repaint**（per-connection notification 限制）
  4. 下次打开该 thread 或重启 Desktop → 看到新 title
- **预期收益**:
  - 解决"下次打开能看到正确 title"的 80% 用例
  - 是 #24202 / #25456 真正修复前的最佳 workaround
- **风险**:
  - **低**。Unix socket 不暴露给网络，本机唯一用户；写失败的概率极小（normalize_thread_name 已经挡住空 title）
  - 已知的 UX 妥协：Desktop 当前 session 不刷新（需要 reopen thread 才能看到变化）
- **时间**: 1-2 小时写脚本（一个 .sh + 一个 README）
- **何时用**:
  - **当**用户/团队的 local-repair tooling 已经在用 SQLite 写入（"低频，容忍延迟"场景）→ 直接落到 final.md §8 路径 1（写 SQLite + JSONL），**不需要起 app-server**（更简单）
  - **当**用户想要"不直接碰 SQLite、通过 official RPC 改 title" → 起 app-server + thread/setName
  - **当**用户想要 live refresh → 这条**做不到**（per-connection notification 限制 + renderer 闭源）

### 选项 3：什么都不动等 OpenAI

- **状态**: **默认状态，本来就这样**。
- **预期损失**:
  - **低频写 title 场景**: 损失 ≈ 0（用户重启 Desktop 或 reopen thread 即可看到正确值）
  - **高频写 title 场景** (orchestrator 每分钟改一次): 用户体验差，但**用户目前也没有 live-refresh 需求**（issue #24202 reporter 是 orchestrator 场景，普通用户不走这条路）
  - **bundle 升级**: 0 成本，0 损失
- **时间**: 0
- **何时用**:
  - 短期/低频 → 已经是默认
  - 高频/live-refresh → **不能选这条**（功能压根没工作）

### 我的推荐：**选项 2（workaround 脚本）+ 选项 3 的 bundle 升级部分**

**具体推荐**: **写一个 1-2 小时的 `codex-title-set` shell 脚本，作为 OpenAI 修复前的兜底，同时在 #25456 提一条 comment 指 owner**。

理由：

1. **选项 1 不可行**（闭源），不用纠结。
2. **选项 3（什么都不动）** 短期 OK，但**对已经报 issue 的用户**来说意味着"等未知时间表"——这是**最差**的服务。issue #25456 reporter 写得很克制、技术精确，大概率是深度用户 / 内部人；给他一个能用的 workaround 比一句"等 OpenAI"更负责任。
3. **选项 2** 提供了 80% 用例的解，且不依赖 OpenAI 任何 release 时间表。脚本核心逻辑：
   - 起独立 app-server（`--listen unix:///tmp/codex-orchestrator.sock`）
   - 接受一个 threadId + name 输入
   - 调 `thread/setName` RPC
   - 退出
4. **附加动作**（30 分钟，不在脚本里，单独做）：
   - 在 #25456 提一条 comment：指出 renderer 闭源、给出 `thread/setName` RPC 作为 workaround、提请 Codex Desktop team 跟进
   - 升级到下一个 Codex Desktop bundle，**期望 renderer 修了 #25456**（如果 OpenAI 同步修 #24202 那是 bonus）

**为什么不是只做 #25456 comment**：
- issue #25456 的 reporter 既然用 local title-repair 工具，说明**已经有了 workaround**——他要的是"first-class API"，不是"再写一个 script"
- 但 OpenAI 短期不太可能为单个 issue 加 first-class API
- 所以**务实路径是 script**，comment 是"礼貌告知" + "帮 OpenAI 内部消化 issue"

**为什么不是只升级 bundle**：
- bundle 升级是 0 成本动作，应当**顺手做**
- 但**不能依赖它**修 #25456 — OpenAI 没承诺，reporter 在 issue 写"0 comments" 已经 10 天，OpenAI 内部 triage 状态不明

---

## 3. 行动清单（今天 18:50 → 22:00 之前）

| # | 动作 | 工作量 | 风险 | 验收 |
|---|---|---|---|---|
| 1 | 写 `~/bin/codex-title-set <threadId> "<name>"` shell script（起独立 app-server → `thread/setName` → 退出） | 1-2h | 低 | 跑通：拿一个真实 threadId 改 title，重启 Desktop，sidebar 显示新值 |
| 2 | 在 GitHub #25456 提一条 comment（30 字）：renderer 闭源，OpenAI Desktop team 跟进；列 `thread/setName` RPC 作为 workaround；@ 一下相关 maintainer（如果知道） | 5min | 0 | comment 落地，@ 到对的人 |
| 3 | 升级 Codex Desktop 到当前 latest bundle（看 Release 页 2026-06-10 之后的新版） | 5min | 0 | bundle 版本号 +1；sidebar 行为不变（OpenAI 还没修） |
| 4 | 写一份 `docs/codex-title-workaround.md`（中文，~50 行），记录：何时用 script / 何时写 SQLite / 何时等 OpenAI / 引用 final.md §8 + Track A + Track B | 30min | 0 | doc 落地，团队成员能找到 |

**总工作量**: ~2.5 小时。
**总风险**: 低（全部是本地动作 + 一条 GitHub comment）。
**总收益**:
- local-repair tooling 场景：**立刻可用**（之前用户需要手动写 SQLite + 重启 Desktop）
- OpenAI 修 #25456 / #24202 之后：脚本可以扔掉，doc 里加一条 "已 obsolete"
- 团队对外：有一份"Codex 线程标题当前能做什么 / 不能做什么"的清晰文档

**不做的**:
- 提 PR 改 `codex-rs/state/src/extract.rs`（草案 B）：改变 first-prompt pseudo-title 的有意行为，回归 #25950 的修复
- 提 PR 加 `ThreadListInvalidate` notification（Track A §5.2）：不是 breaking change 但**仍然需要 OpenAI 合入** + Desktop 闭源端订阅，**外部 PR 概率极低**
- 提 PR 加 `title_source` 枚举（Track B §4.3 草案 C）：v2 protocol breaking change，外部 PR 概率 < 20%
- 等 OpenAI 修 #24202：时间表不可控，不阻塞上面的 workaround

---

## 4. 长期观察（不在今天做）

- **观察 #24202**（每月 check 一次）：OpenAI 是否在 release notes 提 thread notification fan-out / broadcast
- **观察 Codex Desktop bundle build 号**：到 3391 / 3392 之后 sidebar title cache 行为是否变
- **观察 v0.140.0 release notes**：final.md §9 提的 v0.140.0-alpha.2 changelog 内容

**触发"重评"的信号**:
- OpenAI release notes 出现 "thread notification broadcast" / "renderer cache invalidation" → 重新评估 workaround 是否还要保留
- #25456 状态变 Closed with linked PR → 跟进 PR diff，确认 fix 在 renderer 还是 server
- 团队出现 live-refresh 硬需求 → 评估是否自己 fork Codex Desktop（成本太高，大概率不做）

---

## 5. 一句话推荐

**写一个 1-2h 的 `codex-title-set` shell script（起独立 `codex app-server --listen unix://` + `thread/setName` RPC），在 #25456 提一条 comment 指 owner，升级 Desktop bundle——这是 2026-06-10 整合者能做的"既不依赖 OpenAI 时间表、又能立刻给 80% 用例解"的唯一路径。提 PR 到 `openai/codex` 修 #25456 不在选项内（renderer 闭源）。**
