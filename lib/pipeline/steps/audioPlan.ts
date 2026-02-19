import { prisma } from '../../prisma';
import type { StepInput } from '../types';

export async function audioPlanStep(input: StepInput): Promise<{ progress: number; message: string }> {
  const payload = {
    generated_at: new Date().toISOString(),
    voice_style: 'BM_SABAH short comic lines',
    sfx_layers: ['wind', 'wave spray', 'cloth flutter']
  };

  await prisma.episode.update({
    where: { id: input.episodeId },
    data: {
      audioPlan: payload,
      status: 'done'
    }
  });

  return { progress: 100, message: 'audio_plan written' };
}
