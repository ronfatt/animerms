import { prisma } from '../../prisma';
import type { StepInput } from '../types';

function buildPrompt(n: number): { prompt: string; negativePrompt: string; dialogue: string; narration: string } {
  return {
    prompt: `Panel ${n}: Sabah coastal action beat, semi-real anime cinematic lighting`,
    negativePrompt: 'deformed face, extra limbs, random outfit changes, unreadable text',
    dialogue: `Dialog panel ${n}`,
    narration: `Narration panel ${n}`
  };
}

export async function panelPromptsStep(input: StepInput): Promise<{ progress: number; message: string }> {
  const episode = await prisma.episode.findUnique({ where: { id: input.episodeId }, select: { outline: true } });
  const fromOutline =
    typeof episode?.outline === 'object' && episode?.outline && 'panelCount' in episode.outline
      ? Number((episode.outline as { panelCount?: number }).panelCount)
      : undefined;

  const panelCount = Number.isInteger(input.panelCount) && input.panelCount ? input.panelCount : Number.isInteger(fromOutline) && fromOutline ? fromOutline : 9;

  for (let i = 1; i <= panelCount; i++) {
    const p = buildPrompt(i);
    await prisma.panel.upsert({
      where: {
        episodeId_panelNumber: {
          episodeId: input.episodeId,
          panelNumber: i
        }
      },
      create: {
        episodeId: input.episodeId,
        panelNumber: i,
        prompt: p.prompt,
        negativePrompt: p.negativePrompt,
        dialogue: p.dialogue,
        narration: p.narration,
        status: 'queued'
      },
      update: {
        prompt: p.prompt,
        negativePrompt: p.negativePrompt,
        dialogue: p.dialogue,
        narration: p.narration,
        status: 'queued'
      }
    });
  }

  return { progress: 100, message: `panel_prompts upserted ${panelCount} panels` };
}
