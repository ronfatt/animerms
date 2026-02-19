import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { createEpisodeStepChain } from '../../../../../lib/jobs/service';

export async function POST(req: Request, context: { params: Promise<{ episodeId: string }> }) {
  try {
    const { episodeId } = await context.params;
    const parsedEpisodeId = BigInt(episodeId);
    const body = await req.json();
    const steps = Array.isArray(body?.steps) ? body.steps.map((s: unknown) => String(s)) : [];

    if (steps.length === 0) {
      return NextResponse.json({ error: 'steps is required' }, { status: 400 });
    }

    const episode = await prisma.episode.findUnique({
      where: { id: parsedEpisodeId },
      select: { id: true, seriesId: true }
    });
    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    const chain = await createEpisodeStepChain({
      seriesId: episode.seriesId,
      episodeId: episode.id,
      steps,
      panelCount: Number.isInteger(body?.panelCount) ? Number(body.panelCount) : undefined
    });

    return NextResponse.json(chain);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run episode steps' },
      { status: 500 }
    );
  }
}
