import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const episodeId = (url.searchParams.get('episodeId') || '').trim();
    if (!episodeId || !/^\d+$/.test(episodeId)) {
      return NextResponse.json({ error: 'episodeId is required' }, { status: 400 });
    }

    const parsedEpisodeId = BigInt(episodeId);
    const jobs = await prisma.job.findMany({
      where: { episodeId: parsedEpisodeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        step: true,
        status: true,
        progress: true,
        error: true,
        logs: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      episodeId: parsedEpisodeId.toString(),
      jobs: jobs.map((job) => ({
        id: job.id.toString(),
        step: job.step,
        status: job.status,
        progress: job.progress,
        error: job.error,
        logs: job.logs,
        updatedAt: job.updatedAt
      }))
    });
  } catch {
    return NextResponse.json({ error: 'Invalid episode id' }, { status: 400 });
  }
}
