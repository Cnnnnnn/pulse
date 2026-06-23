#!/usr/bin/env bash
#
# scripts/q4v2-profile.sh
#
# 2026-06-23: Q4 v2 辅助脚本 — 启 Pulse 带 inspect, 在 Chrome 采 profile.
#
# 这是辅助说明文件 (不是 .js), 实际跑由用户在本地 terminal 复制粘贴.
# 走完后产物:
#   - main profile:   ~/Desktop/pulse-startup-main.cpuprofile.json
#   - renderer profile: ~/Desktop/pulse-startup-renderer.cpuprofile.json
#   - baseline 数字:   scripts/q4-baseline.js --runs=5
#
# 步骤 1: 启 Pulse 带 Node Inspector
# ────────────────────────────────────
# (新开 terminal tab 1, 跑下面这条, **不要** Ctrl+C, 让它常驻)
cd ~/Desktop/AppUpdateChecker-Electron && npx electron . --inspect=9229
# 你会看到:
#   [main] DevTools listening on ws://127.0.0.1:9229/<uuid>
#   Pulse 启动, tray icon 出现
#
# 步骤 2: 采 main profile
# ────────────────────────────────────
# 在 Chrome 访问 chrome://inspect
# → "Remote Target" 列表里会看到 "pulse" (electron main process)
# → 点 "inspect" → DevTools 弹
# → 切到 "Performance" 面板
# → 点左上 ⏺ 按钮 (Start profiling)
# → 立刻点 Pulse tray icon 选 "退出 Pulse" (触发冷启)
# → 再 cd ~/Desktop/AppUpdateChecker-Electron && npx electron . (不带 --inspect, 冷启)
# → 等 1-2 秒 (窗口出现), 停 recording
# → Save profile → 存 ~/Desktop/pulse-startup-main.cpuprofile.json
#
# 步骤 3: 采 renderer profile
# ────────────────────────────────────
# (回到 chrome://inspect, 找 "pulse" 旁可能有的 Page target,
#  标题是 index.html; 或者走 --enable-tracing 路线)
#
# 路线 A: chrome://inspect
#   → 在 "Remote Target" 找 Page target, inspect → DevTools
#   → Performance → Start → 同样冷启一次 → Stop → Save
#   → 存 ~/Desktop/pulse-startup-renderer.cpuprofile.json
#
# 路线 B: --enable-tracing (更简单, 一条命令搞定)
#   cd ~/Desktop/AppUpdateChecker-Electron && rm -f /tmp/pulse-trace.json
#   npx electron . --enable-tracing=file --trace-startup=* --trace-file=/tmp/pulse-trace.json
#   (等几秒 app 启动, 然后关掉)
#   cat /tmp/pulse-trace.json | head -1   # 验证有内容
#   cp /tmp/pulse-trace.json ~/Desktop/pulse-startup-trace.json
#   # 然后 chrome://tracing → Load → 选 ~/Desktop/pulse-startup-trace.json
#
# 步骤 4: 跑 baseline 对比
# ────────────────────────────────────
# (在本地 terminal, 独立 tab 2)
cd ~/Desktop/AppUpdateChecker-Electron && npm run baseline:q4 -- --runs=5
# 输出会有 "Total cold (median): X.X ms"  — 跟 v1 commit 时的 16.1ms 对比
# 若数字大幅涨 (>= 30ms), 有 commit 引入了 main 端回归
#
# 步骤 5: 回发给我
# ────────────────────────────────────
# 把以下三个文件拖到聊天 / 桌面共享:
#   1. ~/Desktop/pulse-startup-main.cpuprofile.json
#   2. ~/Desktop/pulse-startup-renderer.cpuprofile.json  (or pulse-startup-trace.json)
#   3. baseline 输出截图 (含 "Total cold (median): X.X ms" 行)
# 加 1-2 张 DevTools flame graph 截图 (整张图, 不要裁, 我要看到 main vs renderer 的耗时分布)
#
# 然后我会:
#   1. 解析 .cpuprofile.json 找 top-10 self-time function
#   2. 跟 baseline 16.1ms 对比, 定位 "main 启动 → did-finish-load" 之间的耗时分布
#   3. 写 Q4 v2 plan: 选 1-2 个 profile 直接证明有收益的优化
#   4. 实施 + 再跑 profile 验证
#
# 注意: 这次跑只采集数据, 不动任何代码. spec §3.4 验收要等真优化后看 readyMs < 800ms.

echo "📋 上面是 5 步流程, 复制到本地 terminal 跑即可. 跑完回发 profile + 截图."