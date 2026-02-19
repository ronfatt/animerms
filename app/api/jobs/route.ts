import { NextResponse } from 'next/server';
import { createJobAndEnqueue } from '../../../lib/jobs/service';
import { isPipelineStep } from '../../../lib/pipeline/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const step = String(body?.step ?? '');

    if (!isPipelineStep(step)) {
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
    }

    const seriesId = body?.seriesId != null ? BigInt(body.seriesId) : undefined;
    const episodeId = body?.episodeId != null ? BigInt(body.episodeId) : undefined;

    const created = await createJobAndEnqueue({
      seriesId,
      episodeId,
      step,
      panelCount: Number.isInteger(body?.panelCount) ? Number(body.panelCount) : undefined
    });

    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create job' },
      { status: 500 }
    );
  }
}
