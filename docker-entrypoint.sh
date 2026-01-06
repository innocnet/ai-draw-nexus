#!/bin/sh

# 创建 .dev.vars 文件，将 Docker 环境变量传递给 Wrangler
echo "Creating .dev.vars from environment variables..."
cat > /app/.dev.vars <<EOF
AI_API_KEY=${AI_API_KEY}
AI_BASE_URL=${AI_BASE_URL:-https://api.openai.com/v1}
AI_PROVIDER=${AI_PROVIDER:-openai}
AI_MODEL_ID=${AI_MODEL_ID:-gpt-4o-mini}
ACCESS_PASSWORD=${ACCESS_PASSWORD}
EOF

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
