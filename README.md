# Vue UI Agent

从 UI 截图一键生成完整前端组件库。支持 Vue 3 / React 双框架，兼容所有 AI 编程工具（Cursor、Claude Code、Codex、GitHub Copilot 等）。

## 特性

- **整张截图 → 整套组件库**：自动推导 Design Token，生成 Button、Input、Card、Badge、Avatar、Tooltip 等高复用组件
- **双框架输出**：Vue 3 (`<script setup lang="ts">`) / React (Function Component + TypeScript)
- **多 AI 自动适配**：只需配置一个环境变量，自动使用 Gemini / GPT / Claude / DeepSeek / 通义千问
- **通用兼容**：不绑定特定 Agent，任何具备文件读写能力的 AI 工具都能用
- **零业务耦合**：纯视觉还原，不引入任何第三方 UI 库
- **浏览器预览**：生成后自动打开预览页面

## 安装

### 一键安装（推荐）

```bash
npx skills add mimi0132/vue-ui-agent
```

Vercel `skills` CLI 会自动检测你的 Agent 环境，把技能文件安装到对应目录。

### 直接使用（无需安装）

在任意 AI 聊天框中粘贴以下内容即可：

```
Read https://github.com/mimi0132/vue-ui-agent/tree/main/skills/vue-ui-agent/SKILL.md
```

Agent 会自动读取 SKILL.md 并按照规范工作。

---

## 使用方式

### 基础用法

在任意 AI 编程工具中：

1. 拖入一张 UI 截图
2. 说："帮我根据这张截图生成 Vue 3 组件库"

Agent 会自动完成：分析截图 → 提取设计 Token → 生成组件 → 写入文件 → 打开预览。

### 完整命令

```
根据这张截图生成 Vue 3 组件库，输出到 src/components/ui/
```

或

```
用 React 实现这套 UI，包含 Button、Input、Card、Badge 组件
```

---

## 环境变量配置

设置以下环境变量之一（**三选一**）：

```bash
# Google Gemini（推荐，免费额度高）
export GEMINI_API_KEY="AIza..."

# OpenAI / GPT / DeepSeek / 通义千问
export OPENAI_API_KEY="sk-..."
# 如用 DeepSeek：
export OPENAI_BASE_URL="https://api.deepseek.com/v1"

# Anthropic Claude
export ANTHROPIC_API_KEY="sk-ant-..."
```

**优先级**：`OPENAI_API_KEY` > `ANTHROPIC_API_KEY` > `GEMINI_API_KEY`

---

## 支持的 Agent

本技能兼容所有具备以下能力的 AI 工具：

| 能力 | 用途 |
|------|------|
| 文件读取 | 分析项目结构、代码风格 |
| 文件写入 | 创建组件文件 |
| 命令执行 | 调用 AI API、启动预览服务 |
| 图片分析 | 读取截图内容 |

**已测试兼容**：
- Cursor
- Claude Code
- Codex
- GitHub Copilot
- Trae AI
- Cline
- Roo Code

---

## 生成示例

```
用户：帮我根据这张图生成 Vue 3 组件库

Agent：
✅ 开始分析截图，提取 Design Token...
📦 正在生成组件库（共 10 个组件）...
   📄 Button.vue
   📄 Input.vue
   📄 Card.vue
   📄 Badge.vue
   📄 Avatar.vue
   📄 Divider.vue
   📄 Tooltip.vue
   📄 Modal.vue
   📄 Select.vue
   📄 Switch.vue
🌐 预览已打开：http://localhost:3456
```

---

## 生成的组件结构

每个组件包含：

- **完整变体**：primary / secondary / ghost / outline / danger
- **多尺寸**：sm / md / lg
- **全状态**：default / hover / active / focus / disabled / loading
- **CSS 变量**：通过 `--ui-color-primary` 等变量统一设计 Token
- **Slots**：icon / prefix / suffix / header / footer
- **无障碍**：aria 属性、role、键盘导航

---

## 项目结构

```
vue-ui-agent/
├── skills/
│   └── vue-ui-agent/
│       ├── SKILL.md                    # 入口文件（Agent 读取这个）
│       └── references/
│           ├── system-prompt.md        # 核心设计规范 + 代码模板
│           └── generic.md              # 通用工具能力描述
├── src/
│   ├── cli.js                          # 命令行入口（独立使用）
│   ├── core.js                         # AI 调用核心逻辑
│   ├── preview.js                      # 浏览器预览引擎
│   ├── prompt.js                       # 系统提示词
│   └── providers/                      # AI Provider 适配器
│       ├── gemini.js
│       ├── openai.js
│       └── claude.js
├── package.json
└── README.md
```

---

## 命令行独立使用

不需要 Agent 环境时，也可以直接用命令行：

```bash
# 安装 CLI
npm install -g vue-ui-agent

# 执行
vue-ui-agent ./screenshot.png --framework vue --output ./src/components/ui
```

---

## 常见问题

### 1. npx skills 提示找不到命令

```bash
npm install -g @skills/cli
# 或
npx @skills/cli add mimi0132/vue-ui-agent
```

### 2. 提示 "未检测到 AI 服务配置"

```bash
echo $OPENAI_API_KEY   # 确认环境变量已设置
```

### 3. 生成的文件为空

建议换用更强的模型：Claude Opus 4.8 / GPT-4o / Gemini 2.5 Flash

### 4. 如何更新到最新版本？

```bash
npx skills update mimi0132/vue-ui-agent
```

### 5. 我的 Agent 不支持图片分析怎么办？

将截图保存到本地，然后用命令行模式：

```bash
vue-ui-agent ./screenshot.png --framework vue
```

---

## License

ISC
