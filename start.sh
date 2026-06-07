#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 正在启动 AppUpdateChecker (Electron)..."
echo ""
echo "首次运行需要安装依赖，请稍候..."
if [ ! -d "node_modules" ]; then
  npm install
fi
npx electron . 2>&1 &
echo "✅ AppUpdateChecker 已启动"
echo "   菜单栏会出现 UC 图标，点击可打开面板"
