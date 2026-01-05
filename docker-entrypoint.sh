#!/bin/sh

# 启动 Vite 开发服务器（后台运行）
echo "Starting Vite development server..."
pnpm run dev:frontend &

# 等待 Vite 启动
sleep 3

# 启动 Wrangler Pages Dev（添加 Docker 优化参数）
echo "Starting Wrangler Pages Dev..."
pnpm exec wrangler pages dev \
  --compatibility-date=2024-01-01 \
  --proxy=5173 \
  --port=8788 \
  --ip=0.0.0.0 \
  --local

# 保持进程运行
wait
