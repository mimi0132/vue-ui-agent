#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { generateComponentLibrary } from './core.js';
import { createPreview } from './preview.js';

const ArgsSchema = z.object({
  imagePath: z.string().refine(p => fs.existsSync(p), '图片文件不存在'),
  framework: z.enum(['vue', 'react']).default('vue'),
  outputDir: z.string().default('./src/components/ui'),
  preview: z.boolean().default(true),
  help: z.boolean().default(false),
});

function showHelp() {
  console.log(`
Vue UI Agent — 从截图生成整套 UI 组件库

用法:
  vue-ui-agent <图片路径> [选项]

选项:
  --framework, -f    目标框架: vue | react   (默认: vue)
  --output, -o       输出目录               (默认: ./src/components/ui)
  --no-preview       生成后不自动打开浏览器预览
  --help, -h         显示帮助

示例:
  vue-ui-agent ./screenshot.png
  vue-ui-agent ./design.png -f react -o ./src/ui
`);
}

function parseArgs(rawArgs) {
  const args = {
    imagePath: rawArgs[0],
    framework: 'vue',
    outputDir: './src/components/ui',
    preview: true,
    help: false,
  };

  for (let i = 1; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if ((arg === '--framework' || arg === '-f') && rawArgs[i + 1]) {
      args.framework = rawArgs[i + 1];
      i++;
    } else if ((arg === '--output' || arg === '-o') && rawArgs[i + 1]) {
      args.outputDir = rawArgs[i + 1];
      i++;
    } else if (arg === '--no-preview') {
      args.preview = false;
    }
  }

  return ArgsSchema.safeParse(args);
}

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    showHelp();
    process.exit(rawArgs.length === 0 ? 1 : 0);
  }

  const parsed = parseArgs(rawArgs);
  if (!parsed.success) {
    console.error(`❌ 参数错误: ${parsed.error.errors.map(e => e.message).join(', ')}`);
    process.exit(1);
  }

  const { imagePath, framework, outputDir, preview } = parsed.data;

  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');

  try {
    const result = await generateComponentLibrary({
      imageBase64,
      imageMimeType: mimeType,
      framework,
      outputDir,
      onProgress: (msg) => console.log(msg),
    });

    const fileList = result.writtenFiles.map((f) => `   📄 ${f}`).join('\n');

    console.log(`
✅ ${result.frameworkLabel} 组件库已成功生成！

🤖 使用模型: ${result.displayName} (${result.providerName})
📦 共 ${result.writtenFiles.length} 个文件：
${fileList}

📁 输出目录: ${result.outputDir}/
⏱️  耗时: ${result.elapsed}s
`);

    if (preview) {
      console.log('🌐 正在启动预览服务...');
      const previewUrl = await createPreview(result.outputDir, framework, result.writtenFiles);
      console.log(`👀 预览已打开: ${previewUrl}`);
    }
  } catch (error) {
    console.error(`❌ 生成失败: ${error.message}`);
    process.exit(1);
  }
}

main();
