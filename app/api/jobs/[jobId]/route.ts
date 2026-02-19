import { NextResponse } from 'next/server';
import { getJobStatus } from '../../../../lib/jobs/service';

export async function GET(_req: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const id = BigInt(jobId);
    const status = await getJobStatus(id);
    if (!status) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }
}
