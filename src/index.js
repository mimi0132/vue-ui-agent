#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

import { getSystemPrompt } from './prompt.js';

// ─── 初始化 MCP Server ─────────────────────────────────────
const server = new McpServer({
  name: 'vue-ui-agent',
  version: '1.0.0',
});

// ═══════════════════════════════════════════════════════════
//  AI Provider 抽象层 — 自动检测可用 AI
// ═══════════════════════════════════════════════════════════

/**
 * 检测当前环境可用的 AI Provider
 * 优先级：OPENAI > ANTHROPIC > GEMINI > 自定义兼容接口
 */
async function detectProvider() {
  // 1. OpenAI / GPT / 兼容接口（如 DeepSeek、通义千问、Ollama）
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) {
    const { createProvider: createOpenAI } = await import('./providers/openai.js');
    const provider = await createOpenAI();
    return {
      name: 'openai',
      displayName: provider.modelName,
      client: provider,
    };
  }

  // 2. Anthropic Claude
  if (process.env.ANTHROPIC_API_KEY) {
    const { createProvider: createClaude } = await import('./providers/claude.js');
    const provider = await createClaude();
    return {
      name: 'claude',
      displayName: provider.modelName,
      client: provider,
    };
  }

  // 3. Google Gemini
  if (process.env.GEMINI_API_KEY) {
    const { createProvider: createGemini } = await import('./providers/gemini.js');
    const provider = await createGemini();
    return {
      name: 'gemini',
      displayName: provider.modelName,
      client: provider,
    };
  }

  console.error(`
❌ 未检测到任何 AI 服务配置！请至少设置以下其中一项环境变量：

   🟢 OpenAI / GPT / DeepSeek / 通义千问:
      export OPENAI_API_KEY="sk-xxx"
      # 可选：export OPENAI_BASE_URL="https://api.deepseek.com/v1"  （兼容接口）

   🟣 Anthropic Claude:
      export ANTHROPIC_API_KEY="sk-ant-xxx"

   🔵 Google Gemini:
      export GEMINI_API_KEY="AIza..."
`);

  process.exit(1);
}

// ─── 从返回文本中解析多个组件文件 ────────────────────────────
function parseComponentFiles(rawText, defaultExt) {
  // 匹配 <!-- FILE_START: FileName.ext --> ... <!-- FILE_END: FileName.ext --> 格式
  const filePattern = /<!--\s*FILE_START:\s*(.+?)\s*-->([\s\S]*?)<!--\s*FILE_END:\s*\1\s*-->/g;
  const files = [];
  let match;

  while ((match = filePattern.exec(rawText)) !== null) {
    let fileName = match[1].trim();
    const content = match[2].trim();

    if (!path.extname(fileName)) {
      fileName = fileName + defaultExt;
    }

    if (content && content.length > 50) {
      files.push({ fileName, content });
    }
  }

  // 回退：没有匹配到 FILE_START/FILE_END 格式时当单文件处理
  if (files.length === 0) {
    const cleanCode = rawText
      .replace(/^```(?:vue|tsx|html|typescript|ts|javascript|js)?\s*\n?/i, '')
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

// ─── 工具：生成 UI 组件库（多 AI 自动适配）─────────────────
server.tool(
  'generate_component',
  '根据 UI 截图自动生成一整套高复用的前端组件库代码（Vue 3 或 React），包含 Button、Input、Card、Badge、Avatar 等多个组件，每个写入独立文件。自动使用当前环境中已配置的 AI 服务。',
  {
    image_base64: z.string().describe('UI 截图的 Base64 编码字符串'),
    image_mime_type: z.string().optional().default('image/png').describe('图片 MIME 类型，如 image/png, image/jpeg'),
    framework: z.enum(['vue', 'react']).describe('目标框架：vue (Vue 3) 或 react (React)'),
    output_dir: z.string().optional().default('./src/components/generated').describe('输出目录路径'),
  },
  async ({ image_base64, image_mime_type, framework, output_dir }) => {
    const startTime = Date.now();
    const isVue = framework === 'vue';
    const fileExt = isVue ? '.vue' : '.tsx';
    const frameworkLabel = isVue ? 'Vue 3' : 'React';

    try {
      // 1. 检测并初始化 AI Provider
      const { name: providerName, displayName, client: aiProvider } = await detectProvider();

      // 2. 根据框架获取对应的提示词
      const systemPrompt = getSystemPrompt(framework);

      // 3. 调用 AI 生成整套组件库
      const rawText = await aiProvider.generate({
        systemPrompt,
        imageBase64: image_base64,
        imageMimeType: image_mime_type,
        userMessage: `请根据以上系统提示词要求，分析这张 UI 截图，输出完整的 ${frameworkLabel} 组件库。必须使用 <!-- FILE_START: 文件名 --> 和 <!-- FILE_END: 文件名 --> 格式包裹每个组件，至少生成 6 个以上组件。直接输出代码即可，不要任何解释。`,
      });

      if (!rawText || !rawText.trim()) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ ${displayName} 返回了空内容，请检查 API Key 是否有效或稍后重试`,
            },
          ],
          isError: true,
        };
      }

      // 4. 解析多个组件文件
      const componentFiles = parseComponentFiles(rawText, fileExt);

      if (componentFiles.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '⚠️ 未能从返回结果中解析出有效组件代码，请尝试重新生成。',
            },
          ],
          isError: true,
        };
      }

      // 5. 创建输出目录并逐个写入文件
      const resolvedOutputDir = path.resolve(output_dir);

      if (!fs.existsSync(resolvedOutputDir)) {
        fs.mkdirSync(resolvedOutputDir, { recursive: true });
      }

      const writtenFiles = [];

      for (const file of componentFiles) {
        const outputPath = path.join(resolvedOutputDir, file.fileName);
        fs.writeFileSync(outputPath, file.content, 'utf-8');
        writtenFiles.push(file.fileName);
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      const fileList = writtenFiles.map((f) => `   📄 ${f}`).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: [
              `✅ ${frameworkLabel} 组件库已成功生成！`,
              ``,
              `🤖 使用模型: ${displayName} (${providerName})`,
              `📦 共 ${writtenFiles.length} 个组件：`,
              fileList,
              ``,
              `📁 输出目录: ${resolvedOutputDir}/`,
              `⏱️  耗时: ${elapsed}s`,
              ``,
              `💡 使用方式：`,
              writtenFiles.map((f) => {
                const compName = f.replace(fileExt, '');
                return `   import ${compName} from '${output_dir}/${f}'`;
              }).join('\n'),
            ].join('\n'),
          },
        ],
      };
    } catch (error) {
      let reason = error.message;

      if (error.message?.includes('API_KEY') || error.message?.includes('401') || error.message?.includes('authentication')) {
        reason = 'API Key 无效或未配置';
      } else if (error.message?.includes('quota') || error.message?.includes('429') || error.message?.includes('rate_limit')) {
        reason = 'API 配额超限或请求过于频繁';
      } else if (error.message?.includes('SAFETY') || error.message?.includes('content_filter')) {
        reason = '内容被安全策略拦截';
      }

      return {
        content: [
          {
            type: 'text',
            text: `❌ 组件库生成失败！原因: ${reason}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── 启动 MCP Server ───────────────────────────────────────
async function main() {
  // 启动时预检测一次 AI Provider（提前暴露配置问题）
  const { displayName } = await detectProvider();
  console.log(`🤖 UI Agent 已启动 | 模型: ${displayName}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP Server 启动失败:', error.message);
  process.exit(1);
});
