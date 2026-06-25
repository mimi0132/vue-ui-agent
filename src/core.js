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
