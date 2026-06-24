#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { SYSTEM_PROMPT } from '../src/prompt.js';

// ─── 参数校验 ─────────────────────────────────────────────
const imagePath = process.argv[2];

if (!imagePath) {
  console.error('❌ 请提供 UI 截图路径！');
  console.error('   用法: npx vue-ui-agent <图片路径>');
  console.error('   示例: npx vue-ui-agent ./screenshot.png');
  process.exit(1);
}

const resolvedImagePath = path.resolve(imagePath);

if (!fs.existsSync(resolvedImagePath)) {
  console.error(`❌ 图片文件不存在: ${resolvedImagePath}`);
  process.exit(1);
}

// ─── API Key 校验 ──────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ 未检测到 GEMINI_API_KEY 环境变量');
  console.error('   请先配置: export GEMINI_API_KEY="your-api-key"');
  process.exit(1);
}

// ─── 初始化 Gemini Client ──────────────────────────────────
const ai = new GoogleGenAI({ apiKey });

// ─── 图片 MIME 类型推断 ────────────────────────────────────
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return mimeMap[ext] || 'image/png';
}

// ─── 清理代码块包裹标签 ────────────────────────────────────
function stripCodeFence(raw) {
  return raw
    .replace(/^```(?:vue|html|typescript|ts|javascript|js)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

// ─── 根据图片名推导组件名 ──────────────────────────────────
function deriveComponentName(filePath) {
  const baseName = path.basename(filePath, path.extname(filePath));
  // 转为 PascalCase: my-button -> MyButton
  return baseName
    .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ─── 主流程 ────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  console.log('');
  console.log('🎨 UI Agent - 截图转 Vue 3 组件');
  console.log(''.padEnd(40, '='));
  console.log(`   📷 输入图片: ${resolvedImagePath}`);
  console.log(`   🤖 模型: gemini-2.5-flash`);
  console.log('');

  // 1. 读取图片并转 Base64
  console.log('⏳ 正在读取图片...');
  const imageBuffer = fs.readFileSync(resolvedImagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = getMimeType(resolvedImagePath);
  console.log(`   ✅ 图片已读取 (${(imageBuffer.length / 1024).toFixed(1)} KB, ${mimeType})`);

  // 2. 调用 Gemini 生成组件代码
  console.log('⏳ 正在调用 Gemini 分析截图并生成组件...');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT },
            {
              inlineData: {
                mimeType,
                data: imageBase64,
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
      throw new Error('Gemini 返回了空内容，请检查 API Key 是否有效或稍后重试');
    }

    // 3. 清理输出（去掉 markdown 代码块标记）
    const cleanCode = stripCodeFence(rawText);

    // 验证清理后的内容是否像 Vue 组件
    if (!cleanCode.includes('<script') && !cleanCode.includes('<template')) {
      console.warn('   ⚠️ 警告：返回的内容可能不是有效的 Vue 组件代码');
      console.warn('   原始输出预览:');
      console.warn('   ' + '-'.repeat(50));
      console.warn('   ' + rawText.slice(0, 300));
      console.warn('   ' + '-'.repeat(50));
    }

    // 4. 确定输出路径
    const componentName = deriveComponentName(resolvedImagePath);
    const outputDir = path.join(process.cwd(), 'src', 'components', 'ui-agent');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`   📁 已创建目录: ${outputDir}`);
    }

    const outputFileName = `${componentName}.vue`;
    const outputPath = path.join(outputDir, outputFileName);

    // 5. 写入文件
    fs.writeFileSync(outputPath, cleanCode, 'utf-8');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('✅ 组件生成完成！');
    console.log(''.padEnd(40, '='));
    console.log(`   📄 文件: ${outputPath}`);
    console.log(`   ⏱️  耗时: ${elapsed}s`);
    console.log(`   🧩 组件名: ${componentName}`);
    console.log('');
    console.log('💡 使用方式:');
    console.log(`   import ${componentName} from './components/ui-agent/${outputFileName}'`);
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ 生成失败!');
    console.error(''.padEnd(40, '='));

    if (error.message?.includes('API_KEY')) {
      console.error('   原因: API Key 无效或未配置');
    } else if (error.message?.includes('quota') || error.message?.includes('429')) {
      console.error('   原因: API 配额超限或请求过于频繁');
    } else if (error.message?.includes('SAFETY')) {
      console.error('   原因: 内容被安全策略拦截');
    } else {
      console.error(`   原因: ${error.message}`);
    }

    console.error('');
    console.error('   完整错误信息:');
    console.error(error.stack || error.message);
    console.error('');

    process.exit(1);
  }
}

main();
