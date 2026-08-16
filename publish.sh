#!/usr/bin/env bash
# ============================================================
# 泡泡小英雄 · 一键构建并发布到 GitHub Pages
# 用法: ./publish.sh "提交说明"
# ============================================================
set -e
cd "$(dirname "$0")"

MSG="${1:-更新}"

echo "① 构建单文件 …"
npm run build

echo "② 复制到发布入口 index.html …"
cp dist/index.html index.html

echo "③ 提交 …"
git add -A
if git diff --cached --quiet; then
  echo "（没有改动，跳过提交）"
else
  git commit -m "$MSG"
fi

echo "④ 推送（GitHub Actions 会自动构建并部署到 Pages）…"
git push

echo "✅ 完成。约 1 分钟后生效：https://hollowkt5.github.io/bombman/"
