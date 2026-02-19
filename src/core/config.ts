import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-4.1-mini'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-1.5-pro'),
  GEMINI_IMAGE_MODEL: z.string().min(1).default('gemini-2.0-flash-preview-image-generation'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  JOB_MAX_EPISODES: z.coerce.number().int().positive().default(30),
  RATIO_OVERRIDE: z.enum(['16:9', '9:16']).optional(),
  OUT_DIR: z.string().min(1).default('out'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment config: ${parsed.error.message}`);
}

export const config = parsed.data;

export function requireEnv(name: 'OPENAI_API_KEY' | 'GEMINI_API_KEY'): string {
  const value = config[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}
