import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ZodTypeAny } from 'zod';

export function extractJsonFromText(input: string): unknown {
  const trimmed = input.trim();

  // First try full-body JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    // ignore and try fenced block extraction
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (!fenced?.[1]) {
    throw new Error('Provider output is not valid JSON text.');
  }

  return JSON.parse(fenced[1]);
}

export function parseWithSchema<S extends ZodTypeAny>(
  schema: S,
  raw: unknown,
  label: string
): S['_output'] {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid ${label}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function readJsonFile<S extends ZodTypeAny>(
  path: string,
  schema: S,
  label: string
): Promise<S['_output']> {
  const body = await readFile(path, 'utf8');
  const raw = JSON.parse(body);
  return parseWithSchema(schema, raw, label);
}

export async function writeJsonFile(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
}
