#!/bin/bash
set -e

echo "🔍 检查前端目录..."
if [ ! -d "../imgFront" ]; then
    echo "❌ 错误：找不到 imgFront 目录！"
    exit 1
fi

echo "📦 编译前端..."
cd ../imgFront
npm run build

echo "📋 复制文件到项目根目录（正确位置）..."
cd ../imgBed
cp -rf ../imgFront/dist/css/* css/
cp -rf ../imgFront/dist/js/* js/
cp -rf ../imgFront/dist/img/* img/
cp -rf ../imgFront/dist/fonts/* fonts/
cp -f ../imgFront/dist/index.html .

echo "✅ 文件复制完成"
echo ""
read -p "是否提交到 Git 并部署？(y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📝 提交到 Git..."
    git add css/ js/ img/ fonts/ index.html
    git commit -m "chore: 更新前端编译文件"
    git push origin main

    echo "🚀 部署到 Cloudflare..."
    npx wrangler pages deploy ./ --project-name=imgbed

    echo ""
    echo "✅ 部署完成！"
    echo "🌐 访问: https://img.doufei.eu.org"
else
    echo "⏸️  已取消部署"
fi
