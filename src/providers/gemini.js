import { GoogleGenAI } from '@google/genai';

/**
 * Google Gemini Provider
 * 环境变量：GEMINI_API_KEY（必填）
 * 可选：GEMINI_MODEL（默认 gemini-2.5-flash）
 */
export async function createProvider() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 未配置');
  }

  const ai = new GoogleGenAI({ apiKey });

  return {
    modelName: model,
    async generate({ systemPrompt, imageBase64, imageMimeType, userMessage }) {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              {
                inlineData: {
                  mimeType: imageMimeType,
                  data: imageBase64,
                },
              },
              { text: userMessage },
            ],
          },
        ],
        config: {
          temperature: 0.4,
          maxOutputTokens: 16384,
        },
      });

      return response.text;
    },
  };
}
