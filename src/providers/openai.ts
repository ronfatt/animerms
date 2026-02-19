import type { ZodTypeAny } from 'zod';
import { requireEnv, config } from '../core/config.js';
import { fetchWithRetry } from '../core/http.js';
import { extractJsonFromText, parseWithSchema } from '../core/json.js';

export type OpenAiJsonRequest<S extends ZodTypeAny> = {
  schema: S;
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  label: string;
};

export async function generateOpenAiJson<S extends ZodTypeAny>(
  req: OpenAiJsonRequest<S>
): Promise<S['_output']> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const model = req.model ?? config.OPENAI_MODEL;

  const response = await fetchWithRetry(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: req.temperature ?? 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user }
        ]
      })
    },
    {
      timeoutMs: config.OPENAI_TIMEOUT_MS,
      maxRetries: config.LLM_MAX_RETRIES,
      label: `openai:${req.label}`
    }
  );

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty content.');
  }

  const rawJson = extractJsonFromText(content);
  return parseWithSchema(req.schema, rawJson, req.label);
}
