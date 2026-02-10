#!/bin/bash

echo "================================================"
echo "  Cloudflare Pages 实时日志监控"
echo "================================================"
echo ""
echo "📡 正在连接到 Cloudflare Pages..."
echo ""
echo "⚠️  准备好后，请在浏览器中上传一张图片："
echo "   https://img.doufei.eu.org/upload?uploadNameType=ai"
echo ""
echo "🔍 将显示所有请求日志，包括 AI 命名相关的日志"
echo "   - 查找 [AI Naming] 开头的日志"
echo "   - 按 Ctrl+C 停止监听"
echo ""
echo "================================================"
echo ""

# 启动日志监听，过滤 POST 请求（上传请求）
npx wrangler pages deployment tail \
  --project-name=imgbed \
  --format=pretty \
  --method POST

echo ""
echo "📊 日志监听已停止"
