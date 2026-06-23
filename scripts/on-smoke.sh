#!/usr/bin/env bash
# =============================================================================
# ON (Release Notes Onboarding) 手测脚本 — v2.31.1
# 对应 plan §11 Step 4 的 10 步 smoke
#
# 新行为 (v2): "每次都弹直到收到". mark-seen 的唯一入口是
#   完成 → 确认弹窗 → 收到. 跳过/ESC/遮罩/稍后再说都不写已看 → 下次还会弹.
#
# 用法:
#   bash scripts/on-smoke.sh <step>      # 跑单步 (1-10)
#   bash scripts/on-smoke.sh reset       # 重置到"未看"状态
#   bash scripts/on-smoke.sh status      # 看 state.json 里的 last_seen_release
#   bash scripts/on-smoke.sh run         # 启动 app (npm run dev)
#
# 前置: 先 `npm run build:renderer` (或直接用 run, 它会自己 build)
# =============================================================================

set -euo pipefail

STATE_FILE="$HOME/Library/Application Support/Pulse/state.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

color() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
header() { echo; color "1;36" "▶ $1"; }
ok()     { color "1;32" "  ✅ $1"; }
warn()   { color "1;33" "  ⚠️  $1"; }
info()   { color "0;37" "  $1"; }

check_state_exists() {
  if [[ ! -f "$STATE_FILE" ]]; then
    warn "state.json 不存在: $STATE_FILE"
    info "app 还没跑过 (cold start). 先 bash $0 run 跑一次."
    return 1
  fi
}

# 读 last_seen_release.version (没有就输出 null)
get_last_seen() {
  check_state_exists >/dev/null || { echo "null"; return; }
  node -e "
    try {
      const s = JSON.parse(require('fs').readFileSync('$STATE_FILE', 'utf8'));
      console.log(s.last_seen_release ? s.last_seen_release.version : 'null');
    } catch { console.log('null'); }
  "
}

# 把 last_seen_release 改成指定 version (或删掉)
set_last_seen() {
  local target="$1"  # version 或 'null'
  if [[ ! -f "$STATE_FILE" ]]; then
    warn "state.json 不存在, 无法改. 先跑一次 app."
    return 1
  fi
  node -e "
    const fs = require('fs');
    const p = '$STATE_FILE';
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    if ('$target' === 'null') delete s.last_seen_release;
    else s.last_seen_release = { version: '$target', at: Date.now() };
    fs.writeFileSync(p, JSON.stringify(s, null, 2));
    console.log('  last_seen_release ->', s.last_seen_release ? s.last_seen_release.version : 'null');
  "
}

case "${1:-help}" in

  # ───────────────────────────────────────────────────────────
  reset)
    header "重置到「未看 2.31.1」状态"
    if [[ -f "$STATE_FILE" ]]; then
      set_last_seen null
      ok "已清 last_seen_release, 下次启动会自动弹"
    else
      warn "state.json 不存在 → 全新装场景, 直接启动就会弹"
    fi
    ;;

  # ───────────────────────────────────────────────────────────
  status)
    header "当前 last_seen_release"
    check_state_exists || exit 0
    local_seen=$(get_last_seen)
    info "version = $local_seen"
    if [[ "$local_seen" == "2.31.1" ]]; then
      ok "已看过 2.31.1 → 启动不会自动弹"
    else
      warn "未看 2.31.1 (当前 $local_seen) → 启动会自动弹 + Header 📖 有红点"
    fi
    ;;

  # ───────────────────────────────────────────────────────────
  run)
    header "启动 app (dev)"
    cd "$PROJECT_DIR"
    npm run dev
    ;;

  # ───────────────────────────────────────────────────────────
  # Step 1: 全新装 → 自动弹
  1)
    header "Step 1: 全新装场景 — 删 state.json, 启动应自动弹"
    if [[ -f "$STATE_FILE" ]]; then
      mv "$STATE_FILE" "$STATE_FILE.bak.$(date +%s)"
      info "已备份原 state.json"
    fi
    ok "现在 bash $0 run → 期望: wizard 自动弹 (page 0 = changelog)"
    info "  验证点: 进度点显示 3 个 (changelog + 2 slides), Header 📖 有红点"
    ;;

  # Step 2: 跨版本升级 → 自动弹
  2)
    header "Step 2: 跨版本升级 — last_seen 改 2.31.0, 启动应自动弹"
    check_state_exists || exit 1
    set_last_seen 2.31.0
    ok "现在 bash $0 run → 期望: wizard 自动弹 (因为 2.31.0 ≠ 2.31.1)"
    ;;

  # Step 3: 完成向导后 state 写入
  3)
    header "Step 3: 完成向导 → state 应写入 2.31.1"
    info "前置: 先跑 step 2 启动 app, 翻到最后一页点【完成】"
    info "然后关掉 app, 回来跑:"
    info "  bash $0 status"
    ok "期望: version = 2.31.1"
    ;;

  # Step 4: 已看 → 重启不弹
  4)
    header "Step 4: 已看后重启不弹"
    local_seen=$(get_last_seen)
    if [[ "$local_seen" != "2.31.1" ]]; then
      warn "当前 last_seen = $local_seen, 不是 2.31.1. 先跑 step 3 完成"
      exit 1
    fi
    ok "last_seen = 2.31.1. bash $0 run → 期望: wizard 不弹, Header 📖 无红点"
    ;;

  # Step 5: 手动重看不写已看
  5)
    header "Step 5: 手动点 📖 → 不写已看"
    info "前置: step 4 状态 (已看, 无红点)"
    info "操作: 点 Header 📖 → wizard 弹 → 任意方式关闭"
    info "然后跑:"
    info "  bash $0 status"
    ok "期望: last_seen 仍是 2.31.1 (manual 路径不写), 重启不弹"
    ;;

  # Step 6: 未看时有红点
  6)
    header "Step 6: 红点显隐"
    info "未看: bash $0 reset → bash $0 run → 📖 角标应有红点"
    info "已看: 跑完向导 → 重启 → 📖 角标无红点"
    ok "手动对照看 📖 按钮右上角"
    ;;

  # Step 7: 不发 slides → 单页退化
  7)
    header "Step 7: 无 slides.json → 单页退化"
    info "临时移走 slides:"
    info "  mv src/release-notes-content/2.31.1/slides.json /tmp/slides.bak.json"
    info "  bash $0 reset && bash $0 run"
    ok "期望: wizard 只有 1 页 (changelog), 底部只有【跳过】【完成】, 无【上一步/下一步】"
    info "测完恢复: mv /tmp/slides.bak.json src/release-notes-content/2.31.1/slides.json"
    ;;

  # Step 8: 关闭路径分两类 — 不写已看 vs 写已看 (新行为)
  8)
    header "Step 8: 关闭路径分两类 (新行为: 每次都弹直到收到)"
    info "=== A. 不写已看 (下次启动还会弹) — 每种前先 bash \$0 reset ==="
    info "  a) 点【跳过】          → bash \$0 status 应是 null (重启还会弹)"
    info "  c) 按 ESC              → bash \$0 status 应是 null"
    info "  d) 点遮罩 (modal 外)   → bash \$0 status 应是 null"
    info "  e) 翻到【完成】→ 弹确认 → 点【稍后再说】→ bash \$0 status 应是 null"
    info ""
    info "=== B. 写已看 (下次启动不再弹) — 唯一路径 ==="
    info "  f) 翻到【完成】→ 弹确认 → 点【收到】→ bash \$0 status 应是 2.31.1"
    ok "只有 f) 写入 last_seen_release.version = 2.31.1; a/c/d/e 都是 null"
    ;;

  # Step 9: mark-seen 失败 → toast + 仍关闭
  9)
    header "Step 9: mark-seen IPC 失败 → toast + 仍关闭"
    info "前置: bash $0 reset"
    info "操作: 启动 app → 翻到最后页点【完成】→ 点【收到】"
    info "  // 改坏 markSeen: 把 state.json 目录临时设只读"
    info "  // chmod -w \"\$HOME/Library/Application Support/Pulse\""
    info "  bash \$0 run, 翻完成 → 收到"
    ok "期望: wizard 仍关闭 + 右下角 toast「保存失败, 下次启动还会再弹」"
    info "测完恢复: chmod +w \"\$HOME/Library/Application Support/Pulse\""
    ;;

  # Step 10: 键盘可达
  10)
    header "Step 10: 键盘 ← → Enter ESC"
    info "启动 wizard 后:"
    info "  →     下一步"
    info "  ←     上一步"
    info "  Enter 在最后一页 = 完成 (auto 入口会弹确认, 再按 Enter 收到)"
    info "  ESC   关闭 (向导 ESC = 只关不写; 确认弹窗 ESC = 稍后再说)"
    ok "翻页正常, 不跑焦 (focus trap v1 没做, 这是已知范围外)"
    ;;

  # ───────────────────────────────────────────────────────────
  all)
    header "提示: 这是交互式手测, 不能一键全跑"
    info "按顺序逐个跑: bash $0 1, 然后 bash $0 run, 验证, 关 app, 再 bash $0 2 ..."
    echo "  steps: 1 2 3 4 5 6 7 8 9 10"
    ;;

  *)
    cat <<EOF
${SCRIPT##*/} — ON (Release Notes Onboarding) 手测助手

命令:
  bash $0 reset     清 last_seen_release (模拟未看)
  bash $0 status    查看当前 last_seen_release
  bash $0 run       启动 app (npm run dev)
  bash $0 <N>       跑第 N 步 (N=1..10), 打印操作指引 + 预期
  bash $0 all       列出所有步骤

state.json: $STATE_FILE
项目根:     $PROJECT_DIR

推荐顺序:
  bash $0 1   # 全新装
  bash $0 run # 启动, 验证自动弹
  # 关 app
  bash $0 2   # 跨版本
  bash $0 run
  # 完成向导, 关 app
  bash $0 status  # 应是 2.31.1
  bash $0 4   # 已看不弹
  ... (5-10 逐个)
EOF
    ;;
esac
