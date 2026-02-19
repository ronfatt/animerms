import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const seriesId = (url.searchParams.get('seriesId') || '').trim();
    if (!seriesId) {
      return NextResponse.json({ error: 'seriesId is required' }, { status: 400 });
    }

    const parsedSeriesId = BigInt(seriesId);
    const episodes = await prisma.episode.findMany({
      where: { seriesId: parsedSeriesId },
      select: {
        id: true,
        epNumber: true,
        title: true,
        status: true,
        updatedAt: true
      },
      orderBy: { epNumber: 'asc' }
    });

    return NextResponse.json({
      seriesId: parsedSeriesId.toString(),
      episodes: episodes.map((ep) => ({
        id: ep.id.toString(),
        epNumber: ep.epNumber,
        title: ep.title,
        status: ep.status,
        updatedAt: ep.updatedAt
      }))
    });
  } catch {
    return NextResponse.json({ error: 'Invalid series id' }, { status: 400 });
  }
}
