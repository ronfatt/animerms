import { prisma } from '../../prisma';
import type { StepInput } from '../types';

type GeminiImageResult = {
  mimeType: string;
  base64Data: string;
};

const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 30000);
const GEMINI_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 2);
const DEFAULT_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-2.0-flash-preview-image-generation'
];

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function generateGeminiImage(prompt: string, label: string): Promise<GeminiImageResult> {
  const apiKey = getEnv('GEMINI_API_KEY');
  const configuredModel = process.env.GEMINI_IMAGE_MODEL?.trim();
  const models = configuredModel
    ? [configuredModel, ...DEFAULT_IMAGE_MODELS.filter((m) => m !== configuredModel)]
    : DEFAULT_IMAGE_MODELS;

  let lastError: Error | null = null;

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt <= GEMINI_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const body = await response.text();
          if (response.status === 404) {
            throw new Error(`Gemini model not found (${model})`);
          }
          throw new Error(`Gemini image request failed (${response.status}, ${model}): ${body}`);
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

        throw new Error(`Gemini image model returned no image bytes (${label}, ${model})`);
      } catch (error) {
        clearTimeout(timeout);
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt >= GEMINI_RETRIES) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error(`Gemini image generation failed (${label})`);
}

function buildPanelImagePrompt(input: {
  seriesTitle: string;
  ratio: string;
  panelNumber: number;
  prompt: string | null;
  negativePrompt: string | null;
  dialogue: string | null;
  narration: string | null;
}): string {
  const ratioCue =
    input.ratio === '9:16'
      ? 'Vertical 9:16 frame. Character-focused composition, strong vertical depth.'
      : 'Cinematic 16:9 frame. Balanced environment + character storytelling.';

  return [
    `Create one storyboard panel image for "${input.seriesTitle}".`,
    ratioCue,
    `Panel #${input.panelNumber}: ${input.prompt ?? 'Sabah coastal action scene'}.`,
    `Dialogue tone: ${input.dialogue ?? 'short comic-like line'}.`,
    `Narration hint: ${input.narration ?? 'none'}.`,
    'Style: LOCAL_X_ANIME, semi-real anime cinematic lighting, Sabah coastal local flavor.',
    `Negative constraints: ${input.negativePrompt ?? 'deformed face, extra limbs, unreadable text'}.`,
    'Avoid distorted anatomy and random costume changes.'
  ].join(' ');
}

export async function geminiStoryboardStep(input: StepInput): Promise<{ progress: number; message: string }> {
  // Reconcile historical state drift: if image exists, panel must be done.
  const reconciled = await prisma.panel.updateMany({
    where: {
      episodeId: input.episodeId,
      imageUrl: { not: null },
      NOT: { status: 'done' }
    },
    data: { status: 'done' }
  });

  const panels = await prisma.panel.findMany({
    where: {
      episodeId: input.episodeId,
      OR: [{ imageUrl: null }, { status: 'failed' }]
    },
    orderBy: { panelNumber: 'asc' }
  });

  if (panels.length === 0) {
    return {
      progress: 100,
      message: `gemini_storyboard skipped (all panels already rendered, reconciled=${reconciled.count})`
    };
  }

  const failedPanelNumbers: number[] = [];
  const failedReasons: Array<{ panel: number; reason: string }> = [];
  let doneCount = 0;
  const episode = await prisma.episode.findUnique({
    where: { id: input.episodeId },
    include: { series: true }
  });
  if (!episode) {
    throw new Error(`Episode ${input.episodeId.toString()} not found`);
  }

  for (const panel of panels) {
    try {
      const prompt = buildPanelImagePrompt({
        seriesTitle: episode.series.title,
        ratio: episode.series.ratio,
        panelNumber: panel.panelNumber,
        prompt: panel.prompt,
        negativePrompt: panel.negativePrompt,
        dialogue: panel.dialogue,
        narration: panel.narration
      });
      const image = await generateGeminiImage(prompt, `ep${input.episodeId.toString()}-p${panel.panelNumber}`);

      const previousCount = await prisma.asset.count({
        where: { panelId: panel.id, type: 'image_raw' }
      });
      const asset = await prisma.asset.create({
        data: {
          panelId: panel.id,
          type: 'image_raw',
          url: `data:${image.mimeType};base64,${image.base64Data}`,
          version: previousCount + 1
        }
      });

      const url = `/api/assets/raw?assetId=${asset.id.toString()}`;
      await prisma.panel.update({
        where: { id: panel.id },
        data: {
          imageUrl: url,
          status: 'done'
        }
      });
      doneCount += 1;
    } catch (error) {
      failedPanelNumbers.push(panel.panelNumber);
      const reason = error instanceof Error ? error.message : String(error);
      failedReasons.push({
        panel: panel.panelNumber,
        reason: reason.slice(0, 280)
      });
      await prisma.panel.update({ where: { id: panel.id }, data: { status: 'failed' } });
    }
  }

  if (failedPanelNumbers.length > 0) {
    const reasonPreview = failedReasons
      .slice(0, 3)
      .map((x) => `P${x.panel}: ${x.reason}`)
      .join(' | ');
    throw new Error(
      `gemini_storyboard failed panels: ${failedPanelNumbers.join(', ')}; reasons: ${reasonPreview}`
    );
  }

  return {
    progress: 100,
    message: `gemini_storyboard rendered ${doneCount} panels (reconciled=${reconciled.count})`
  };
}
