# 使用 Node.js 20 (Debian-based) 以支持 Cloudflare workerd
FROM node:20

# 安装 pnpm
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml* ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制项目文件
COPY . .

# 给启动脚本添加执行权限
RUN chmod +x docker-entrypoint.sh

# 暴露端口
EXPOSE 8788 5173

# 启动开发服务器
CMD ["sh", "./docker-entrypoint.sh"]
