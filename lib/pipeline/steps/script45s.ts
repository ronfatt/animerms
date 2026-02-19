import { prisma } from '../../prisma';
import type { StepInput } from '../types';

export async function script45sStep(input: StepInput): Promise<{ progress: number; message: string }> {
  const payload = {
    generated_at: new Date().toISOString(),
    duration_sec: 45,
    beats: [
      { t: [0, 10], purpose: 'hook' },
      { t: [10, 25], purpose: 'conflict setup' },
      { t: [25, 45], purpose: 'turning point' }
    ]
  };

  await prisma.episode.update({
    where: { id: input.episodeId },
    data: {
      script45s: payload,
      status: 'running'
    }
  });

  return { progress: 100, message: 'script_45s written' };
}
