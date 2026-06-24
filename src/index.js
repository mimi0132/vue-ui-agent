#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

import { SYSTEM_PROMPT } from './prompt.js';

// ─── 初始化 MCP Server ─────────────────────────────────────
const server = new McpServer({
  name: 'vue-ui-agent',
  version: '1.0.0',
});

// ─── 初始化 Gemini Client ──────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ 未检测到 GEMINI_API_KEY 环境变量');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

// ─── 工具：生成 Vue 组件 ───────────────────────────────────
server.tool(
  'generate_vue_component',
  '根据 UI 截图（Base64 编码）自动生成高复用性的 Vue 3 组件代码，并写入本地文件系统',
  {
    image_base64: z.string().describe('UI 截图的 Base64 编码字符串'),
    image_mime_type: z.string().optional().default('image/png').describe('图片 MIME 类型，如 image/png, image/jpeg'),
    component_name: z.string().optional().describe('组件文件名（不含 .vue 后缀），如 MyButton。不传则自动推导'),
    output_dir: z.string().optional().default('./src/components/generated').describe('输出目录路径'),
  },
  async ({ image_base64, image_mime_type, component_name, output_dir }) => {
    const startTime = Date.now();

    try {
      // 1. 调用 Gemini 生成组件代码
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: SYSTEM_PROMPT },
              {
                inlineData: {
                  mimeType: image_mime_type,
                  data: image_base64,
                },
              },
              {
                text:
                  '请根据以上系统提示词要求，分析这张 UI 截图，输出完整的高复用性 Vue 3 组件代码。直接输出代码即可，不要任何解释。',
              },
            ],
          },
        ],
        config: {
          temperature: 0.4,
          maxOutputTokens: 8192,
        },
      });

      const rawText = response.text;

      if (!rawText || !rawText.trim()) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ Gemini 返回了空内容，请检查 API Key 是否有效或稍后重试',
            },
          ],
          isError: true,
        };
      }

      // 2. 清理输出（去掉 markdown 代码块标记）
      const cleanCode = rawText
        .replace(/^```(?:vue|html|typescript|ts|javascript|js)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();

      // 3. 确定输出路径和文件名
      const resolvedOutputDir = path.resolve(output_dir);

      if (!fs.existsSync(resolvedOutputDir)) {
        fs.mkdirSync(resolvedOutputDir, { recursive: true });
      }

      const fileName = component_name
        ? `${component_name}.vue`
        : `GeneratedComponent_${Date.now()}.vue`;

      const outputPath = path.join(resolvedOutputDir, fileName);

      // 4. 写入文件
      fs.writeFileSync(outputPath, cleanCode, 'utf-8');

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      return {
        content: [
          {
            type: 'text',
            text: [
              `✅ Vue 3 组件已成功生成！`,
              ``,
              `📄 文件路径: ${outputPath}`,
              `🧩 组件名: ${component_name || fileName.replace('.vue', '')}`,
              `⏱️  耗时: ${elapsed}s`,
              ``,
              `💡 使用方式:`,
              `   import ${fileName.replace('.vue', '').replace(/[-_](\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase())} from '${output_dir}/${fileName}'`,
            ].join('\n'),
          },
        ],
      };
    } catch (error) {
      let reason = error.message;

      if (error.message?.includes('API_KEY')) {
        reason = 'API Key 无效或未配置';
      } else if (error.message?.includes('quota') || error.message?.includes('429')) {
        reason = 'API 配额超限或请求过于频繁';
      } else if (error.message?.includes('SAFETY')) {
        reason = '内容被安全策略拦截';
      }

      return {
        content: [
          {
            type: 'text',
            text: `❌ 组件生成失败！原因: ${reason}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── 启动 MCP Server ───────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP Server 启动失败:', error.message);
  process.exit(1);
});
