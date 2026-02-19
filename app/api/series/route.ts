import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body?.title ?? '').trim();
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const created = await prisma.series.create({
      data: {
        title,
        totalEpisodes: Number.isInteger(body?.totalEpisodes) ? Math.min(Number(body.totalEpisodes), 30) : 10,
        languageMode: String(body?.languageMode ?? 'BM_SABAH'),
        stylePreset: String(body?.stylePreset ?? 'LOCAL_X_ANIME'),
        ratio: String(body?.ratio ?? '9:16'),
        seriesBible: body?.seriesBible ?? null
      }
    });

    return NextResponse.json({ seriesId: created.id.toString() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create series' },
      { status: 500 }
    );
  }
}
