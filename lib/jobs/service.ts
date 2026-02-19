import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { isPipelineStep, type PipelineStep } from '../pipeline/types';

const ENQUEUE_TIMEOUT_MS = 8000;
const DISPATCH_MODE = String(process.env.JOB_DISPATCH_MODE ?? 'bullmq').toLowerCase();

function nowLog(message: string): Prisma.JsonObject {
  return {
    at: new Date().toISOString(),
    message
  };
}

function toQueueJobId(id: bigint): string {
  return `db-${id.toString()}`;
}

async function enqueueWithTimeout(
  payload: {
    dbJobId: string;
    seriesId: number;
    episodeId: number;
    step: PipelineStep;
    panelCount?: number;
  },
  queueJobId: string
): Promise<void> {
  const { comicQueue } = await import('../queue/queues');
  const queueAny = comicQueue as any;
  await Promise.race([
    queueAny.add('pipeline_step', payload, { jobId: queueJobId }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Queue enqueue timeout after ${ENQUEUE_TIMEOUT_MS}ms`)), ENQUEUE_TIMEOUT_MS)
    )
  ]);
}

export async function createJobAndEnqueue(input: {
  seriesId?: bigint;
  episodeId?: bigint;
  step: PipelineStep;
  panelCount?: number;
  nextJobId?: bigint;
  status?: string;
}): Promise<{ jobId: string }> {
  const created = await prisma.job.create({
    data: {
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      step: input.step,
      status: input.status ?? 'queued',
      progress: 0,
      logs: {
        events: [
          {
            at: new Date().toISOString(),
            message: input.status === 'pending' ? 'job prepared in chain' : 'job queued'
          }
        ],
        panelCount: input.panelCount ?? null,
        nextJobId: input.nextJobId ? input.nextJobId.toString() : null
      }
    }
  });

  if ((input.status ?? 'queued') === 'queued') {
    if (!created.seriesId || !created.episodeId) {
      throw new Error('seriesId and episodeId are required to enqueue comic job');
    }

    if (DISPATCH_MODE !== 'db_poll') {
      try {
        await enqueueWithTimeout(
          {
            dbJobId: created.id.toString(),
            seriesId: Number(created.seriesId),
            episodeId: Number(created.episodeId),
            step: created.step as PipelineStep,
            panelCount: input.panelCount
          },
          toQueueJobId(created.id)
        );
      } catch (error) {
        await prisma.job.update({
          where: { id: created.id },
          data: {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Failed to enqueue job'
          }
        });
        throw error;
      }
    }
  }

  return { jobId: created.id.toString() };
}

export async function linkAndStartChain(jobIds: bigint[]): Promise<void> {
  if (jobIds.length === 0) return;

  for (let i = 0; i < jobIds.length; i++) {
    const current = jobIds[i];
    const next = i < jobIds.length - 1 ? jobIds[i + 1] : null;
    const currentJob = await prisma.job.findUnique({ where: { id: current } });
    if (!currentJob) continue;
    const currentLogs = ((currentJob.logs as Prisma.JsonObject | null) ?? {}) as Prisma.JsonObject;
    const events = (currentLogs.events as Prisma.JsonArray | undefined) ?? [];

    await prisma.job.update({
      where: { id: current },
      data: {
        logs: {
          ...currentLogs,
          events,
          nextJobId: next ? next.toString() : null
        }
      }
    });
  }

  const first = await prisma.job.findUnique({ where: { id: jobIds[0] } });
  if (!first || !first.seriesId || !first.episodeId) return;

  if (DISPATCH_MODE !== 'db_poll') {
    await enqueueWithTimeout(
      {
        dbJobId: first.id.toString(),
        seriesId: Number(first.seriesId),
        episodeId: Number(first.episodeId),
        step: first.step as PipelineStep,
        panelCount:
          typeof (first.logs as Prisma.JsonObject | null)?.panelCount === 'number'
            ? Number((first.logs as Prisma.JsonObject).panelCount)
            : undefined
      },
      toQueueJobId(first.id)
    );
  }
}

export async function createEpisodeStepChain(input: {
  seriesId: bigint;
  episodeId: bigint;
  steps: string[];
  panelCount?: number;
}): Promise<{ jobIds: string[] }> {
  const invalid = input.steps.find((step) => !isPipelineStep(step));
  if (invalid) {
    throw new Error(`Invalid step: ${invalid}`);
  }

  const jobIds: bigint[] = [];
  for (let i = 0; i < input.steps.length; i++) {
    const step = input.steps[i] as PipelineStep;
    const created = await prisma.job.create({
      data: {
        seriesId: input.seriesId,
        episodeId: input.episodeId,
        step,
        status: i === 0 ? 'queued' : 'pending',
        progress: 0,
        logs: {
          events: [nowLog(i === 0 ? 'job queued as chain head' : 'job pending chain dependency')],
          panelCount: input.panelCount ?? null,
          chainIndex: i,
          chainTotal: input.steps.length,
          nextJobId: null
        }
      }
    });
    jobIds.push(created.id);
  }

  await linkAndStartChain(jobIds);
  return { jobIds: jobIds.map((id) => id.toString()) };
}

export async function getJobStatus(jobId: bigint): Promise<{
  status: string;
  progress: number;
  step: string;
  error: string | null;
  logs: unknown;
} | null> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return null;
  return {
    status: job.status,
    progress: job.progress,
    step: job.step,
    error: job.error,
    logs: job.logs
  };
}
