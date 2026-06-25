import OpenAI from 'openai';

/**
 * OpenAI Provider — 同时兼容所有 OpenAI API 格式的服务：
 *   - OpenAI GPT-4o / GPT-4o-mini
 *   - DeepSeek (deepseek-chat)
 *   - 通义千问 (qwen-plus)
 *   - Ollama 本地模型
 *   - 其他兼容接口
 *
 * 环境变量：
 *   OPENAI_API_KEY      （必填，或 OPENAI_BASE_URL 指向本地服务时可省略）
 *   OPENAI_BASE_URL     （可选，默认 https://api.openai.com/v1）
 *   OPENAI_MODEL        （可选，默认 gpt-4o）
 */
export async function createProvider() {
  const apiKey = process.env.OPENAI_API_KEY || 'sk-no-key';
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  const client = new OpenAI({ apiKey, baseURL });

  // 自动检测模型名用于显示
  let displayName = model;
  if (baseURL.includes('deepseek')) displayName = `DeepSeek (${model})`;
  else if (baseURL.includes('qwen') || baseURL.includes('dashscope')) displayName = `通义千问 (${model})`;
  else if (baseURL.includes('ollama')) displayName = `Ollama (${model})`;
  else if (baseURL.includes('openai')) displayName = `GPT (${model})`;

  return {
    modelName: displayName,
    async generate({ systemPrompt, imageBase64, imageMimeType, userMessage }) {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userMessage },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${imageMimeType};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.4,
        max_tokens: 16384,
      });

      return response.choices[0]?.message?.content || '';
    },
  };
}
