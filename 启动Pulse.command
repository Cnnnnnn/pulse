#!/bin/bash
cd "$(dirname "$0")"
echo "========================================="
echo "  Pulse - 构建并启动 (Session v2)"
echo "========================================="
echo ""
echo "[1/2] 构建 renderer bundle..."
npx esbuild src/renderer/index.jsx --bundle --format=iife --outfile=renderer-dist/renderer.bundle.js --loader:.jsx=jsx --jsx=automatic --jsx-import-source=preact --target=es2020 --define:process.env.NODE_ENV=\"production\" 2>&1
if [ $? -ne 0 ]; then
  echo "❌ 构建失败！"
  read -p "按回车键退出..."
  exit 1
fi
echo ""
echo "[2/2] 启动 Electron 应用..."
echo "   菜单栏会出现 Pulse 图标"
echo ""
npx electron . 2>&1 &
sleep 2
echo "✅ Pulse 已启动！"
sleep 1
exit 0
