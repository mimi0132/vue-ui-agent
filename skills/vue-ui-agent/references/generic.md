# 通用工具能力描述

本文件描述 Vue UI Agent 所需的工具能力。无论运行在哪个 Agent 环境中，都需要这些基础能力。

## 核心能力清单

### 1. 文件读取能力

**用途**：分析目标项目结构、确认代码风格、检查是否已有同名组件。

**期望行为**：
- 能读取指定路径的文件内容
- 能列出指定目录下的文件列表
- 能搜索文件内容（grep/搜索）

### 2. 文件写入能力

**用途**：创建组件文件、写入生成的代码。

**期望行为**：
- 能创建新文件并写入内容
- 能编辑已有文件（增量修改）
- 能创建目录（mkdir -p）

**输出路径**：`src/components/ui/` 目录下的 `.vue` 或 `.tsx` 文件。

### 3. 命令执行能力

**用途**：调用 AI API 进行图片分析、启动预览服务。

**期望行为**：
- 能执行 shell 命令
- 能设置环境变量
- 能读取命令输出

**常用命令**：

```bash
# 调用 AI API（如果 Agent 本身不能分析图片）
export GEMINI_API_KEY="AIza..."
node /path/to/vue-ui-agent/src/core.js ./screenshot.png --framework vue

# 启动预览服务
python3 -m http.server 3456 --directory src/components/ui

# 确认目录存在
mkdir -p src/components/ui
```

### 4. 图片分析能力

**用途**：读取截图内容，提取视觉特征。

**期望行为**：
- 能读取聊天上下文中的图片
- 能分析图片中的颜色、形状、布局
- 能识别 UI 组件的视觉属性

**注意**：大多数现代 AI Agent（Claude、GPT-4o、Gemini）本身就具备图片分析能力。如果当前 Agent 不支持图片分析，可以通过命令行调用外部 AI API。

## 工作流程（通用）

### 模式 A：Agent 自带图片分析能力（推荐）

1. 用户在聊天框中提供 UI 截图
2. Agent 读取截图，分析 Design Token（颜色、圆角、阴影、间距）
3. Agent 参考 `system-prompt.md`，生成组件代码
4. Agent 确认目标项目目录存在：`mkdir -p src/components/ui`
5. Agent 将每个组件写入独立文件：`Write src/components/ui/Button.vue`
6. Agent 启动预览服务：`python3 -m http.server 3456`
7. Agent 告诉用户预览地址和生成的文件列表

### 模式 B：Agent 无图片分析能力

1. 用户在聊天框中提供 UI 截图（或本地文件路径）
2. Agent 将截图保存到本地临时目录
3. Agent 通过命令行调用外部 AI API：

```bash
export GEMINI_API_KEY="AIza..."
node /path/to/vue-ui-agent/src/core.js ./temp/screenshot.png --framework vue
```

4. Agent 读取命令输出（已清理好的组件代码）
5. Agent 将代码写入文件
6. Agent 启动预览服务

## AI API 配置

如果需要调用外部 AI API，需要配置以下环境变量之一：

```bash
# Google Gemini（推荐，免费额度高）
export GEMINI_API_KEY="AIza..."

# OpenAI / GPT / DeepSeek / 通义千问
export OPENAI_API_KEY="sk-..."

# Anthropic Claude
export ANTHROPIC_API_KEY="sk-ant-..."
```

优先级：`OPENAI_API_KEY` > `ANTHROPIC_API_KEY` > `GEMINI_API_KEY`

## 输出格式规范

### 组件文件

每个组件必须写入独立文件，路径格式：`src/components/ui/{组件名}.vue` 或 `.tsx`。

文件名必须使用 PascalCase（大驼峰）：
- `Button.vue` ✅
- `button.vue` ❌
- `my-button.vue` ❌

### 代码标记

输出内容必须用以下标记分隔，便于解析：

```
<!-- FILE_START: Button.vue -->
...组件代码...
<!-- FILE_END: Button.vue -->
```

**禁止**：
- 用 markdown 代码块包裹（```vue ```）
- 输出解释性文字（"以下是生成的组件"等）
- 输出 JSON 或其他格式的结果

### 组件命名规范

组件名必须使用 PascalCase：
- Button
- Input
- Card
- Badge
- Avatar
- Divider
- Tooltip
- Modal
- Select
- Switch
- Checkbox
- Radio
- Table
- Navbar
- Tabs
- Spinner
- Skeleton
- Empty

### 文件内容规范

详见 [system-prompt.md](system-prompt.md)

## 兼容性说明

### Agent 环境要求

本技能需要 Agent 具备以下基础能力：
1. 文件读写
2. 命令执行
3. 图片理解（或能调用外部 API）

### 不依赖特定工具

本技能不依赖任何特定的工具名称或 API。无论 Agent 提供的工具叫什么名字（Read/Write/Terminal/Bash/Exec），只要能完成上述能力即可。

### 适配建议

如果当前 Agent 的工具命名与本描述不同，Agent 应该：
1. 识别自身可用的工具
2. 将本技能描述的能力映射到自身工具
3. 按相同的逻辑执行

例如：
- `Read` 可能对应 Agent 的 `file_read`、`read_file`、`open` 等工具
- `Write` 可能对应 Agent 的 `file_write`、`write_file`、`save` 等工具
- `Terminal` 可能对应 Agent 的 `bash`、`exec`、`run_command` 等工具

## 调试与故障排除

### 常见问题

#### 1. 图片分析失败

**原因**：Agent 不支持图片分析，或 AI API Key 未配置。

**解决**：
- 确认环境变量已设置：`echo $GEMINI_API_KEY`
- 使用命令行模式：`node src/core.js ./screenshot.png`

#### 2. 文件写入失败

**原因**：目标目录不存在，或权限不足。

**解决**：
- 先执行：`mkdir -p src/components/ui`
- 确认当前工作目录是项目根目录

#### 3. 预览服务无法启动

**原因**：端口被占用，或 Python 未安装。

**解决**：
- 使用其他端口：`python3 -m http.server 8080`
- 使用 Node.js：`node src/preview.js`

#### 4. 生成的组件不符合预期

**原因**：AI 模型能力不足，或提示词不够详细。

**解决**：
- 使用更强的模型：Claude Opus 4.8 / GPT-4o / Gemini 2.5 Flash
- 参考 `system-prompt.md` 中的设计规范

## 扩展能力

### 可选增强能力

如果 Agent 支持以下能力，可以提供更好的体验：

| 能力 | 增强效果 |
|------|---------|
| **浏览器预览** | 直接在 Agent 内置浏览器中打开预览 |
| **实时编辑** | 用户点击组件，直接编辑源码 |
| **多文件操作** | 一次性生成并写入多个组件文件 |
| **代码审查** | 生成后自动检查代码质量 |
| **版本控制** | 自动 commit 生成的组件 |

### 未来扩展方向

- 支持更多框架：Svelte、Solid、Angular
- 支持设计系统导出：Figma、Tailwind CSS、CSS Variables
- 支持响应式设计：移动端、平板端适配
- 支持动画效果：hover、transition、animation
