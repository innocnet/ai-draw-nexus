# AI Diagram Hub

一个 AI 驱动的图表创作平台，用自然语言描述你想要的图表，AI 帮你生成。

这不仅仅是一个工具，更是一个功能完善的图表创作平台。

## 核心亮点

### 三大绘图引擎

支持三种各具特色的绘图引擎，满足不同场景需求：

- **Mermaid** - 流程图、时序图、类图等，代码驱动，精确可控
- **Excalidraw** - 手绘风格图表，简洁美观，适合头脑风暴
- **Draw.io** - 专业图表编辑器，功能丰富，适合复杂图表

### 简约好用的项目管理

- 轻松管理所有图表项目
- 完整的版本历史，随时回退到任意版本
- **所有数据存储在本地**，无需担心隐私问题

### 卓越的绘图体验

- **秒级响应** - 几乎所有绘图都能达到秒级响应，告别漫长等待
- **样式精美** - 特别优化了 Mermaid 的渲染样式，美观度大幅提升
- **智能编辑** - 基于现有图表进行后续编辑，AI 理解上下文
- **空间感知** - 更优秀的布局能力，箭头贯穿元素的情况大幅减少

### 多模态输入

不止于文字描述，还支持：

- **文档可视化** - 上传文档，自动生成可视化图表
- **图片复刻** - 上传图片，AI 识别并复刻图表
- **链接解析** - 输入链接，自动解析内容并生成图表

## 快速开始

### 方式一：首页快速生成

1. 打开首页
2. 选择绘图引擎（Mermaid / Excalidraw / Draw.io）
3. 输入图表描述，例如："画一个用户登录流程图"
4. 点击生成，AI 自动创建项目并生成图表

### 方式二：项目管理

1. 进入项目列表页
2. 点击"新建项目"
3. 选择引擎并命名
4. 在编辑器中通过对话描述你的需求

## 使用技巧

### AI 对话生成

在编辑器右侧的对话面板中，你可以：

- 描述新图表："画一个电商下单流程图"
- 修改现有图表："把支付节点改成红色"
- 添加元素："增加一个库存检查的步骤"

### 手动编辑

- **Excalidraw** - 直接在画布上拖拽、绘制
- **Draw.io** - 使用专业的图表编辑工具
- **Mermaid** - 可直接编辑代码

### 版本管理

- 点击工具栏的"历史记录"按钮
- 查看所有历史版本
- 点击任意版本预览
- 点击"恢复"回退到该版本

## 本地开发

### 1. 克隆项目并安装依赖

```bash
git clone https://github.com/liujuntao123/ai-draw-nexus
cd ai-draw-nexus

# 安装前端依赖
pnpm install

# 安装后端依赖
cd worker && pnpm install 
```

### 2. 配置环境变量

在 `worker/` 目录下创建 `.dev.vars` 文件：

```env
AI_API_KEY=your-api-key
AI_BASE_URL=https://api.openai.com/v1
AI_PROVIDER=openai
AI_MODEL_ID=gpt-4o-mini
```

> 支持 OpenAI、Anthropic 及其他兼容 OpenAI 格式的服务

### 3. 启动开发服务器

需要同时运行前端和后端：

```bash
# 终端 1 - 启动前端
pnpm run dev
# 访问 http://localhost:5173

# 终端 2 - 启动后端
cd worker && pnpm run dev
# 访问 http://localhost:8787
```

## Cloudflare 部署

### 前端部署

构建静态文件后部署到任意静态托管平台（Vercel、Netlify、Cloudflare Pages 等）：

```bash
pnpm run build
# 输出目录: dist/
```

### 后端部署 (Cloudflare Workers)

#### 1. 安装 Wrangler CLI

```bash
pnpm install -g wrangler
wrangler login
```

#### 2. 配置生产环境密钥

```bash
cd worker

# 设置必需的环境变量
wrangler secret put AI_API_KEY --env production
wrangler secret put AI_BASE_URL --env production
wrangler secret put AI_PROVIDER --env production
wrangler secret put AI_MODEL_ID --env production
```

#### 3. 部署到生产环境

```bash
pnpm run deploy:prod
```

### 支持的 AI 服务

| 服务商 | AI_PROVIDER | AI_BASE_URL | 推荐模型 |
|--------|-------------|-------------|----------|
| OpenAI | openai | https://api.openai.com/v1 | gpt-5 |
| Anthropic | anthropic | https://api.anthropic.com/v1 | claude-sonnet-4-5 |
| 其他兼容服务 | openai | 自定义 URL | - |

## 技术栈

- 前端：React 19 + Vite + TypeScript + Tailwind CSS
- 状态管理：Zustand
- 本地存储：Dexie.js (IndexedDB)
- 后端：Cloudflare Workers

## 开源协议

MIT
