import { prisma } from '../../prisma';
import type { StepInput } from '../types';

function placeholderImage(episodeId: bigint, panelNumber: number): string {
  return `https://placehold.co/1080x1920/png?text=EP${episodeId.toString()}-P${panelNumber}`;
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
  let doneCount = 0;

  for (const panel of panels) {
    try {
      const url = placeholderImage(input.episodeId, panel.panelNumber);
      await prisma.panel.update({
        where: { id: panel.id },
        data: {
          imageUrl: url,
          status: 'done'
        }
      });

      await prisma.asset.create({
        data: {
          panelId: panel.id,
          type: 'image_raw',
          url,
          version: 1
        }
      });
      doneCount += 1;
    } catch {
      failedPanelNumbers.push(panel.panelNumber);
      await prisma.panel.update({ where: { id: panel.id }, data: { status: 'failed' } });
    }
  }

  if (failedPanelNumbers.length > 0) {
    throw new Error(`gemini_storyboard failed panels: ${failedPanelNumbers.join(', ')}`);
  }

  return {
    progress: 100,
    message: `gemini_storyboard rendered ${doneCount} panels (reconciled=${reconciled.count})`
  };
}
