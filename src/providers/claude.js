import Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic Claude Provider
 * 环境变量：ANTHROPIC_API_KEY（必填）
 * 可选：CLAUDE_MODEL（默认 claude-sonnet-4-20250514）
 */
export async function createProvider() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY 未配置');
  }

  const client = new Anthropic({ apiKey });

  return {
    modelName: `Claude (${model})`,
    async generate({ systemPrompt, imageBase64, imageMimeType, userMessage }) {
      const response = await client.messages.create({
        model,
        max_tokens: 16384,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: userMessage },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imageMimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
      });

      // Claude 返回 content blocks 数组，取第一个 text block
      const textBlock = response.content.find((block) => block.type === 'text');
      return textBlock?.text || '';
    },
  };
}
