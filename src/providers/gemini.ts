import type { ZodTypeAny } from 'zod';
import { config, requireEnv } from '../core/config.js';
import { fetchWithRetry } from '../core/http.js';
import { extractJsonFromText, parseWithSchema } from '../core/json.js';

export type GeminiJsonRequest<S extends ZodTypeAny> = {
  schema: S;
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  label: string;
};

export type GeminiImageResult = {
  mimeType: string;
  base64Data: string;
};

export async function generateGeminiJson<S extends ZodTypeAny>(
  req: GeminiJsonRequest<S>
): Promise<S['_output']> {
  const apiKey = requireEnv('GEMINI_API_KEY');
  const model = req.model ?? config.GEMINI_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetchWithRetry(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: req.temperature ?? 0.2,
          responseMimeType: 'application/json'
        },
        systemInstruction: {
          role: 'system',
          parts: [{ text: req.system }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: req.user }]
          }
        ]
      })
    },
    {
      timeoutMs: config.GEMINI_TIMEOUT_MS,
      maxRetries: config.LLM_MAX_RETRIES,
      label: `gemini:${req.label}`
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned empty content.');
  }

  const rawJson = extractJsonFromText(text);
  return parseWithSchema(req.schema, rawJson, req.label);
}

export async function generateGeminiImage(prompt: string, label: string): Promise<GeminiImageResult> {
  const apiKey = requireEnv('GEMINI_API_KEY');
  const model = config.GEMINI_IMAGE_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetchWithRetry(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        }
      })
    },
    {
      timeoutMs: config.GEMINI_TIMEOUT_MS,
      maxRetries: config.LLM_MAX_RETRIES,
      label: `gemini-image:${label}`
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini image request failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
          inline_data?: { mime_type?: string; data?: string };
        }>;
      };
    }>;
  };

  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data ?? part.inline_data?.data;
    const mimeType = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? 'image/png';
    if (data) {
      return { mimeType, base64Data: data };
    }
  }

  throw new Error('Gemini image model returned no image bytes.');
}
