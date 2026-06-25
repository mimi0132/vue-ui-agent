import fs from 'node:fs';
import path from 'node:path';

/**
 * 检测当前环境可用的 AI Provider
 * 优先级：OPENAI > ANTHROPIC > GEMINI
 */
export async function detectProvider() {
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) {
    const { createProvider: createOpenAI } = await import('./providers/openai.js');
    const provider = await createOpenAI();
    return { name: 'openai', displayName: provider.modelName, client: provider };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const { createProvider: createClaude } = await import('./providers/claude.js');
    const provider = await createClaude();
    return { name: 'claude', displayName: provider.modelName, client: provider };
  }

  if (process.env.GEMINI_API_KEY) {
    const { createProvider: createGemini } = await import('./providers/gemini.js');
    const provider = await createGemini();
    return { name: 'gemini', displayName: provider.modelName, client: provider };
  }

  throw new Error('未检测到任何 AI 服务配置。请设置 GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY 之一。');
}

/**
 * 从 AI 返回文本中解析多个组件文件
 */
export function parseComponentFiles(rawText, defaultExt) {
  const filePattern = /<!--\s*FILE_START:\s*(.+?)\s*-->([\s\S]*?)<!--\s*FILE_END:\s*\1\s*-->/g;
  const files = [];
  let match;

  while ((match = filePattern.exec(rawText)) !== null) {
    let fileName = match[1].trim();
    const content = match[2].trim();
    if (!path.extname(fileName)) fileName = fileName + defaultExt;
    if (content && content.length > 50) files.push({ fileName, content });
  }

  if (files.length === 0) {
    const cleanCode = rawText
      .replace(/^```(?:vue|tsx|html|typescript|ts|javascript|js|css)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    if (cleanCode) {
      files.push({
        fileName: `GeneratedComponent_${Date.now()}${defaultExt}`,
        content: cleanCode,
      });
    }
  }

  return files;
}

/**
 * 生成组件统一导出文件
 */
function generateIndexFile(componentFiles, framework) {
  const isVue = framework === 'vue';
  const exports = componentFiles
    .filter(f => f.fileName.endsWith(isVue ? '.vue' : '.tsx'))
    .map(f => {
      const compName = f.fileName.replace(isVue ? '.vue' : '.tsx', '');
      return `export { default as ${compName} } from './${f.fileName}';`;
    })
    .join('\n');

  return `${exports}\n`;
}

/**
 * 生成主题 CSS 文件（从组件中提取 Design Token）
 */
function generateThemeCSS(componentFiles) {
  const tokens = new Set();

  componentFiles.forEach(f => {
    const cssVarMatches = f.content.match(/--ui-\w+:\s*[^;]+;/g);
    if (cssVarMatches) {
      cssVarMatches.forEach(match => tokens.add(match));
    }
  });

  if (tokens.size === 0) {
    return `:root {
  --ui-color-primary: #6366F1;
  --ui-color-primary-hover: #4F46E5;
  --ui-color-secondary: #64748B;
  --ui-color-success: #10B981;
  --ui-color-warning: #F59E0B;
  --ui-color-danger: #EF4444;
  --ui-color-info: #3B82F6;
  --ui-color-bg: #FFFFFF;
  --ui-color-surface: #FAFAFA;
  --ui-color-border: #E5E7EB;
  --ui-color-text-primary: #111827;
  --ui-color-text-secondary: #6B7280;
  --ui-color-text-muted: #9CA3AF;
  --ui-radius-sm: 4px;
  --ui-radius-md: 8px;
  --ui-radius-lg: 12px;
  --ui-radius-xl: 16px;
  --ui-radius-full: 9999px;
  --ui-shadow-xs: 0 1px 2px rgba(0,0,0,0.05);
  --ui-shadow-sm: 0 1px 3px rgba(0,0,0,0.1);
  --ui-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --ui-shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
  --ui-shadow-xl: 0 20px 25px rgba(0,0,0,0.1);
  --ui-transition-fast: 150ms ease;
  --ui-transition-normal: 200ms ease;
  --ui-transition-slow: 300ms ease;
}
`;
  }

  return `:root {\n${Array.from(tokens).join('\n')}\n}\n`;
}

/**
 * 生成组件库说明文档（README.md）
 */
function generateDocsFile(componentFiles, framework) {
  const isVue = framework === 'vue';
  const frameworkLabel = isVue ? 'Vue 3' : 'React';

  const componentList = componentFiles
    .filter(f => f.fileName.endsWith(isVue ? '.vue' : '.tsx'))
    .map(f => {
      const name = f.fileName.replace(isVue ? '.vue' : '.tsx', '');
      return `| \`${f.fileName}\` | ${name} | ${name} 组件 |`;
    })
    .join('\n');

  return `# UI Agent 组件库

> 由 Vue UI Agent 自动生成 - 基于 ${frameworkLabel} 的完整组件库

## 目录

1. [组件清单](#组件清单)
2. [快速开始](#快速开始)
3. [设计 Token](#设计-token)
4. [栅格系统](#栅格系统)
5. [间距系统](#间距系统)
6. [排版系统](#排版系统)
7. [颜色规范](#颜色规范)
8. [圆角规范](#圆角规范)
9. [阴影规范](#阴影规范)
10. [动画规范](#动画规范)
11. [交互规则](#交互规则)
12. [无障碍规范](#无障碍规范)

---

## 组件清单

| 文件 | 组件名 | 用途 |
|------|--------|------|
${componentList}

---

## 快速开始

### 安装

\`\`\`bash
# 1. 复制组件文件到你的项目 src/components/ui/ 目录
# 2. 引入 theme.css 到入口文件
\`\`\`

### 引入样式

\`\`\`${isVue ? 'javascript' : 'javascript'}
// main.ts / main.js / main.tsx
import './components/ui/theme.css'
\`\`\`

### 使用组件

${
  isVue
    ? `\`\`\`vue
<script setup lang="ts">
import { Button, Input, Card } from '@/components/ui'

const handleClick = () => {
  console.log('clicked')
}
</script>

<template>
  <Card title="示例">
    <Input placeholder="请输入内容" />
    <Button variant="primary" @click="handleClick">提交</Button>
  </Card>
</template>
\`\`\`
`
    : `\`\`\`tsx
import { Button, Input, Card } from '@/components/ui'

export default function Example() {
  return (
    <Card title="示例">
      <Input placeholder="请输入内容" />
      <Button variant="primary" onClick={() => console.log('clicked')}>提交</Button>
    </Card>
  )
}
\`\`\`
`
}

---

## 设计 Token

所有视觉变量都定义在 \`theme.css\` 中，使用 CSS Variables 暴露，方便在业务中复用和二次定制。

\`\`\`css
/* 颜色 */
--ui-color-primary      /* 主色 */
--ui-color-primary-hover
--ui-color-secondary
--ui-color-success / warning / danger / info

/* 圆角 */
--ui-radius-sm / md / lg / xl / full

/* 阴影 */
--ui-shadow-xs / sm / md / lg / xl

/* 间距 */
--ui-space-xs / sm / md / lg / xl

/* 字体 */
--ui-font-size-xs / sm / md / lg / xl

/* 过渡 */
--ui-transition-fast / normal / slow
\`\`\`

---

## 栅格系统

| 断点 | 宽度 | 列数 | Gutter |
|------|------|------|--------|
| \`xs\` | < 640px | 4 | 16px |
| \`sm\` | ≥ 640px | 8 | 16px |
| \`md\` | ≥ 768px | 12 | 24px |
| \`lg\` | ≥ 1024px | 12 | 24px |
| \`xl\` | ≥ 1280px | 12 | 32px |
| \`2xl\` | ≥ 1536px | 12 | 32px |

**规则**：
- 内容容器最大宽度 1440px
- 卡片间距统一使用 \`--ui-space-lg\`
- 表单字段垂直间距使用 \`--ui-space-md\`

---

## 间距系统

基于 4px 基准的阶梯：

| Token | 值 | 用途 |
|-------|----|----|
| \`--ui-space-xs\` | 4px | 文字与图标间距、紧凑元素 |
| \`--ui-space-sm\` | 8px | 按钮内边距、标签间距 |
| \`--ui-space-md\` | 16px | 卡片内边距、表单字段间距 |
| \`--ui-space-lg\` | 24px | 区块间距、卡片之间 |
| \`--ui-space-xl\` | 32px | 大区块分隔、页面边距 |

---

## 排版系统

| Token | 字号 | 行高 | 字重 | 用途 |
|-------|------|------|------|------|
| \`--ui-font-size-xs\` | 12px | 16px | 400 | 辅助说明 |
| \`--ui-font-size-sm\` | 14px | 20px | 400 | 次要文字 |
| \`--ui-font-size-md\` | 16px | 24px | 400 | 正文 |
| \`--ui-font-size-lg\` | 18px | 28px | 500 | 小标题 |
| \`--ui-font-size-xl\` | 24px | 32px | 600 | 标题 |

---

## 颜色规范

| 场景 | Token |
|------|-------|
| 品牌主操作（按钮、链接） | \`--ui-color-primary\` |
| 危险操作（删除、错误） | \`--ui-color-danger\` |
| 成功提示 | \`--ui-color-success\` |
| 警告提示 | \`--ui-color-warning\` |
| 信息提示 | \`--ui-color-info\` |
| 页面背景 | \`--ui-color-bg\` |
| 卡片表面 | \`--ui-color-surface\` |
| 分割线/边框 | \`--ui-color-border\` |
| 主要文字 | \`--ui-color-text-primary\` |
| 次要文字 | \`--ui-color-text-secondary\` |

---

## 圆角规范

| 组件类型 | 推荐值 |
|----------|--------|
| 按钮 | \`--ui-radius-md\` |
| 输入框 | \`--ui-radius-md\` |
| 卡片 | \`--ui-radius-lg\` |
| 徽章/标签 | \`--ui-radius-full\` |
| 头像 | \`--ui-radius-full\` |
| 模态框 | \`--ui-radius-xl\` |

---

## 阴影规范

| 场景 | Token |
|------|-------|
| 静态卡片 | \`--ui-shadow-sm\` |
| 悬浮卡片 | \`--ui-shadow-md\` |
| 下拉菜单 | \`--ui-shadow-lg\` |
| 模态框 | \`--ui-shadow-xl\` |
| 按钮 hover | \`--ui-shadow-sm\` |

---

## 动画规范

| Token | 时长 | 用途 |
|-------|------|------|
| \`--ui-transition-fast\` | 150ms | 颜色、透明度变化 |
| \`--ui-transition-normal\` | 200ms | 通用过渡 |
| \`--ui-transition-slow\` | 300ms | 模态框、抽屉 |

缓动函数：\`ease\` / \`cubic-bezier(0.4, 0, 0.2, 1)\`

---

## 交互规则

### Hover 态
- 颜色：主色 → \`primary-hover\`
- 阴影：\`shadow-sm\` → \`shadow-md\`
- 过渡：\`--ui-transition-fast\`

### Active 态
- 颜色：\`primary-hover\` → \`primary\` 加深 10%
- 阴影：缩小至 \`shadow-xs\`

### Focus 态
- 描边：2px solid \`--ui-color-primary\`
- 描边偏移：2px

### Disabled 态
- 透明度：0.5
- cursor: not-allowed
- 无 hover 效果

### Loading 态
- 按钮：禁用点击 + 显示 spinner
- 页面：显示 Skeleton 占位

---

## 无障碍规范

1. **键盘导航**：所有可交互元素必须支持 Tab 聚焦，Enter/Space 触发
2. **ARIA 属性**：按钮带 \`aria-label\`，弹窗带 \`role="dialog"\` + \`aria-modal\`
3. **颜色对比度**：文字与背景对比度 ≥ 4.5:1
4. **焦点可见**：focus 状态必须有明显的视觉指示
5. **语义化标签**：使用正确的 HTML 元素（button / nav / main / section）

---

> 本文档由 Vue UI Agent 自动生成。如需修改，请编辑组件源码。
`;
}

/**
 * 核心生成逻辑：调用 AI → 解析文件 → 写入磁盘
 */
export async function generateComponentLibrary({
  imageBase64,
  imageMimeType = 'image/png',
  framework,
  outputDir = './src/components/ui',
  onProgress,
}) {
  const startTime = Date.now();
  const isVue = framework === 'vue';
  const fileExt = isVue ? '.vue' : '.tsx';
  const frameworkLabel = isVue ? 'Vue 3' : 'React';

  const { name: providerName, displayName, client: aiProvider } = await detectProvider();

  const { getSystemPrompt } = await import('./prompt.js');
  const systemPrompt = getSystemPrompt(framework);

  if (onProgress) onProgress(`🤖 使用模型: ${displayName}，正在分析截图...`);

  const rawText = await aiProvider.generate({
    systemPrompt,
    imageBase64,
    imageMimeType,
    userMessage: `请根据以上系统提示词要求，分析这张 UI 截图，输出完整的 ${frameworkLabel} 组件库。必须使用 <!-- FILE_START: 文件名 --> 和 <!-- FILE_END: 文件名 --> 格式包裹每个组件，至少生成 6 个以上组件。直接输出代码即可，不要任何解释。`,
  });

  if (!rawText || !rawText.trim()) {
    throw new Error(`${displayName} 返回了空内容，请检查 API Key 是否有效或稍后重试`);
  }

  const componentFiles = parseComponentFiles(rawText, fileExt);
  if (componentFiles.length === 0) {
    throw new Error('未能从返回结果中解析出有效组件代码');
  }

  const resolvedOutputDir = path.resolve(outputDir);
  if (!fs.existsSync(resolvedOutputDir)) {
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
  }

  const writtenFiles = [];
  const hasThemeCSS = componentFiles.some(f => f.fileName === 'theme.css');
  const hasREADME = componentFiles.some(f => f.fileName === 'README.md');

  for (const file of componentFiles) {
    const outputPath = path.join(resolvedOutputDir, file.fileName);
    fs.writeFileSync(outputPath, file.content, 'utf-8');
    writtenFiles.push(file.fileName);
  }

  const indexContent = generateIndexFile(componentFiles, framework);
  const indexPath = path.join(resolvedOutputDir, 'index.ts');
  fs.writeFileSync(indexPath, indexContent, 'utf-8');
  writtenFiles.push('index.ts');

  if (!hasThemeCSS) {
    const themeContent = generateThemeCSS(componentFiles);
    const themePath = path.join(resolvedOutputDir, 'theme.css');
    fs.writeFileSync(themePath, themeContent, 'utf-8');
    writtenFiles.push('theme.css');
  }

  if (!hasREADME) {
    const docsContent = generateDocsFile(componentFiles, framework);
    const docsPath = path.join(resolvedOutputDir, 'README.md');
    fs.writeFileSync(docsPath, docsContent, 'utf-8');
    writtenFiles.push('README.md');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  return {
    providerName,
    displayName,
    frameworkLabel,
    writtenFiles,
    outputDir: resolvedOutputDir,
    elapsed,
    fileExt,
  };
}
