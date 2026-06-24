#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai'; // 或者用 openai 库
import { SYSTEM_PROMPT } from '../src/prompt.js';

// 1. 获取用户在命令行输入的图片路径 (例如: npx vue-ui-agent ./btn.png)
const imagePath = process.argv[2];
if (!imagePath) {
  console.error('❌ 请提供一张 UI 截图路径！例如: npx vue-ui-agent ./screenshot.png');
  process.exit(1);
}

// 2. 初始化大模型（让用户在自己电脑配置 API_KEY，你不需要出钱）
const aiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
if (!aiKey) {
  console.error('❌ 未检测到 API Key，请先配置环境变量，例如: export GEMINI_API_KEY="xxx"');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: aiKey });

async function run() {
  try {
    console.log('⏳ 正在分析 UI 截图并生成 Vue 3 组件...');
    
    // 将图片转为 Base64
    const imageBase64 = fs.readFileSync(path.resolve(imagePath), { encoding: 'base64' });

    // 3. 调用多模态模型进行视觉识别与代码生成
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // 或者 gemini-2.5-pro, 具备强大的视觉和代码能力
      contents: [
        SYSTEM_PROMPT,
        {
          inlineData: {
            mimeType: 'image/png',
            data: imageBase64
          }
        },
        '请根据这张截图，为我生成一个封装完美、高复用性的 Vue 3 组件。'
      ],
    });

    const code = response.text;

    // 4. 自动写入到用户当前执行命令的项目目录中
    const outputDir = path.join(process.cwd(), 'src/components/ui-agent');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 提取大模型代码块中的纯文本（简单正则过滤掉 ```vue）
    const cleanCode = code.replace(/```vue/g, '').replace(/```/g, '').trim();
    
    // 假设默认叫 GeneratedComponent.vue，也可以让大模型自己输出文件名
    const outputPath = path.join(outputDir, 'GeneratedComponent.vue');
    fs.writeFileSync(outputPath, cleanCode, 'utf-8');

    console.log(`\n✅ 成功！组件已生成至: ./src/components/ui-agent/GeneratedComponent.vue`);
  } catch (error) {
    console.error('❌ 发生错误:', error.message);
  }
}

run();
