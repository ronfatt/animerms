import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const seriesId = BigInt(body?.seriesId);
    const epNumber = Number(body?.epNumber);

    if (!Number.isInteger(epNumber) || epNumber <= 0) {
      return NextResponse.json({ error: 'epNumber must be positive integer' }, { status: 400 });
    }

    const episode = await prisma.episode.upsert({
      where: {
        seriesId_epNumber: {
          seriesId,
          epNumber
        }
      },
      create: {
        seriesId,
        epNumber,
        title: String(body?.title ?? `Episode ${String(epNumber).padStart(2, '0')}`),
        status: 'pending',
        outline: body?.outline ?? null
      },
      update: {
        title: body?.title != null ? String(body.title) : undefined,
        outline: body?.outline ?? undefined
      }
    });

    return NextResponse.json({
      episodeId: episode.id.toString(),
      epNumber: episode.epNumber
    });
  } catch {
    return NextResponse.json({ error: 'Invalid seriesId/episode payload' }, { status: 400 });
  }
}
