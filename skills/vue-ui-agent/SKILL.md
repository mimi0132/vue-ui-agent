---
name: vue-ui-agent
description: Generate a complete UI component library from screenshots. Use when the user provides a UI screenshot and asks to generate Vue 3 or React components, build a design system, or create reusable UI components.
---

# Vue UI Agent

从 UI 截图生成一整套高复用的前端组件库。

## 安装

```bash
npx skills add mimi0132/vue-ui-agent --all
```

`--all` 会自动检测本机所有 AI 编程工具，把技能装到所有检测到的 Agent，无需手动选择。

## 核心能力

- **图片分析**：识别截图中的主色、圆角、阴影、毛玻璃质感、间距等视觉特征
- **组件推导**：从单张截图推导出完整组件体系（Button、Input、Card、Badge、Avatar、Tooltip 等）
- **双框架输出**：Vue 3 (`<script setup lang="ts">`) 或 React (Function Component)
- **自动写入**：在用户项目中创建独立组件文件
- **浏览器预览**：生成后自动打开预览页面

## 工作流程

### Step 1：分析设计体系

当用户提供 UI 截图后，首先提取 Design Token：

| Token | 提取内容 |
|-------|---------|
| **颜色** | 主色、背景色、文字色、边框色、语义色（success/warning/danger） |
| **圆角** | sm/md/lg/full 的具体 px 值 |
| **阴影** | 精确的 box-shadow 值（轻/中/重/浮层） |
| **间距** | padding、gap 的具体 px 值 |
| **字体** | 字号、字重、line-height |
| **毛玻璃** | backdrop-blur 值、透明度 |

### Step 2：生成组件库

根据 Design Token，生成以下组件（根据截图内容自动调整）：

**基础组件**（必选）：
- Button — 5 种变体 × 3 种尺寸 × disabled/loading
- Input — default/error/success + prefix/suffix
- Card — plain/header/footer/elevated/glass
- Badge — dot/text × color variants
- Avatar — image/text/icon + group
- Divider — horizontal/vertical
- Tooltip — placement variants

**智能延伸组件**（根据截图内容）：
- Modal — header/body/footer slots
- Select — single/multiple + search
- Switch — on/off + disabled
- Checkbox — checked/unchecked/indeterminate
- Radio — group
- Table — pagination + sort + filter
- Navbar — brand/logo/links/actions
- Tabs — default/pill
- Spinner — size variants
- Skeleton — paragraph/circle/rect
- Empty — icon/title/description/action

### Step 3：输出格式

每个组件必须写入独立文件，文件路径：`src/components/ui/{组件名}.vue` 或 `.tsx`。

输出内容必须用标记分隔，便于解析。**第一个文件必须是 theme.css**：

```
<!-- FILE_START: theme.css -->
:root {
  --ui-color-primary: #从截图提取的主色;
  --ui-radius-md: 8px;
  --ui-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  /* ... 所有 Design Token */
}
<!-- FILE_END: theme.css -->

<!-- FILE_START: Button.vue -->
...组件代码（引用 theme.css 中的 CSS 变量）...
<!-- FILE_END: Button.vue -->

<!-- FILE_START: Input.vue -->
...组件代码...
<!-- FILE_END: Input.vue -->
```

**禁止**：用 ```vue ``` 等 markdown 代码块包裹。

**输出文件清单**：
- `theme.css` — Design Token（颜色、圆角、阴影、间距、字体）
- `Button.vue` / `Button.tsx` — 按钮组件
- `Input.vue` / `Input.tsx` — 输入框组件
- `Card.vue` / `Card.tsx` — 卡片组件
- `Badge.vue` / `Badge.tsx` — 徽章组件
- `Avatar.vue` / `Avatar.tsx` — 头像组件
- `Divider.vue` / `Divider.tsx` — 分割线组件
- `Tooltip.vue` / `Tooltip.tsx` — 提示气泡组件
- `index.ts` — 组件统一导出（自动生成）

### Step 4：浏览器预览

组件生成后，启动本地预览服务（自动找空闲端口），用浏览器打开预览页面。

预览页面包含：
- 所有组件的实时渲染
- 组件源码查看
- 响应式布局

## 设计规范

详见 [references/system-prompt.md](references/system-prompt.md)

## 工具能力需求

本技能需要以下能力，由当前运行的 Agent 提供：

| 能力 | 用途 |
|------|------|
| **读取文件** | 分析现有项目结构、代码风格 |
| **写入文件** | 创建组件文件 |
| **执行命令** | 调用 AI API、启动预览服务 |
| **分析图片** | 读取截图内容（截图已在聊天上下文中） |

详见 [references/generic.md](references/generic.md)
