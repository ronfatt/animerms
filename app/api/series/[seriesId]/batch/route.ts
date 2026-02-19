import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { createEpisodeStepChain } from '../../../../../lib/jobs/service';

export async function POST(req: Request, context: { params: Promise<{ seriesId: string }> }) {
  try {
    const { seriesId } = await context.params;
    const parsedSeriesId = BigInt(seriesId);
    const body = await req.json();
    const fromEp = Number(body?.fromEp);
    const toEp = Number(body?.toEp);
    const steps = Array.isArray(body?.steps) ? body.steps.map((s: unknown) => String(s)) : [];

    if (!Number.isInteger(fromEp) || !Number.isInteger(toEp) || fromEp <= 0 || toEp < fromEp) {
      return NextResponse.json({ error: 'Invalid fromEp/toEp' }, { status: 400 });
    }
    if (steps.length === 0) {
      return NextResponse.json({ error: 'steps is required' }, { status: 400 });
    }

    const series = await prisma.series.findUnique({
      where: { id: parsedSeriesId },
      select: { totalEpisodes: true }
    });
    if (!series) {
      return NextResponse.json({ error: 'Series not found' }, { status: 404 });
    }

    const end = Math.min(toEp, series.totalEpisodes, 30);
    const created: Array<{ epNumber: number; jobIds: string[] }> = [];

    for (let ep = fromEp; ep <= end; ep++) {
      const episode = await prisma.episode.upsert({
        where: {
          seriesId_epNumber: {
            seriesId: parsedSeriesId,
            epNumber: ep
          }
        },
        create: {
          seriesId: parsedSeriesId,
          epNumber: ep,
          status: 'pending',
          title: `Episode ${String(ep).padStart(2, '0')}`
        },
        update: {}
      });

      const chain = await createEpisodeStepChain({
        seriesId: parsedSeriesId,
        episodeId: episode.id,
        steps,
        panelCount: Number.isInteger(body?.panelCount) ? Number(body.panelCount) : undefined
      });

      created.push({ epNumber: ep, jobIds: chain.jobIds });
    }

    return NextResponse.json({
      seriesId: parsedSeriesId.toString(),
      fromEp,
      toEp: end,
      created
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create batch' },
      { status: 500 }
    );
  }
}
