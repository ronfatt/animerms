import { prisma } from '../../prisma';
import type { StepInput } from '../types';

export async function motionPlanStep(input: StepInput): Promise<{ progress: number; message: string }> {
  const payload = {
    generated_at: new Date().toISOString(),
    camera_language: 'anime cinematic + sabah local flavor',
    movement_rules: ['push_in', 'tilt', 'handheld']
  };

  await prisma.episode.update({
    where: { id: input.episodeId },
    data: { motionPlan: payload }
  });

  return { progress: 100, message: 'motion_plan written' };
}
