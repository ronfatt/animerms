import { Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { COMIC_QUEUE_NAME, type ComicJobData, comicQueue } from '../lib/queue/queues';
import { redisConnection } from '../lib/queue/redis';
import { runPipelineStep } from '../lib/pipeline/runStep';

const concurrency = Number(process.env.COMIC_WORKER_CONCURRENCY ?? 2);
const queueAny = comicQueue as any;

function appendEvent(logs: Prisma.JsonObject | null, message: string): Prisma.JsonObject {
  const current = (logs ?? {}) as Prisma.JsonObject;
  const events = (Array.isArray(current.events) ? current.events : []) as Prisma.JsonArray;
  events.push({ at: new Date().toISOString(), message });
  return { ...current, events };
}

async function queueNextIfAny(currentJobId: bigint): Promise<void> {
  const current = await prisma.job.findUnique({ where: { id: currentJobId } });
  if (!current) return;

  const nextJobIdRaw = ((current.logs as Prisma.JsonObject | null)?.nextJobId ?? null) as string | null;
  if (!nextJobIdRaw) return;

  const nextJobId = BigInt(nextJobIdRaw);
  const next = await prisma.job.findUnique({ where: { id: nextJobId } });
  if (!next || !next.seriesId || !next.episodeId) return;

  const nextLogs = appendEvent(next.logs as Prisma.JsonObject | null, `released by previous step ${current.step}`);

  await prisma.job.update({
    where: { id: next.id },
    data: {
      status: 'queued',
      logs: nextLogs
    }
  });

  await queueAny.add(
    'pipeline_step',
    {
      dbJobId: next.id.toString(),
      seriesId: Number(next.seriesId),
      episodeId: Number(next.episodeId),
      step: next.step as ComicJobData['step'],
      panelCount:
        typeof (nextLogs.panelCount as number | undefined) === 'number' ? Number(nextLogs.panelCount) : undefined
    },
    {
      jobId: `db-${next.id.toString()}`
    }
  );
}

new Worker<ComicJobData>(
  COMIC_QUEUE_NAME,
  async (queueJob) => {
    const dbJobId = BigInt(queueJob.data.dbJobId);
    const dbJob = await prisma.job.findUnique({ where: { id: dbJobId } });
    if (!dbJob) throw new Error(`Job ${dbJobId.toString()} not found in DB`);

    const runningLogs = appendEvent(dbJob.logs as Prisma.JsonObject | null, `start step ${dbJob.step}`);

    await prisma.job.update({
      where: { id: dbJobId },
      data: {
        status: 'running',
        progress: 10,
        error: null,
        logs: runningLogs
      }
    });

    try {
      const result = await runPipelineStep(dbJob.step as ComicJobData['step'], {
        seriesId: BigInt(queueJob.data.seriesId),
        episodeId: BigInt(queueJob.data.episodeId),
        panelCount: queueJob.data.panelCount
      });

      const doneLogs = appendEvent(runningLogs, result.message);
      await prisma.job.update({
        where: { id: dbJobId },
        data: {
          status: 'done',
          progress: result.progress,
          error: null,
          logs: doneLogs
        }
      });

      await queueNextIfAny(dbJobId);
      return result;
    } catch (error) {
      const attempts = queueJob.attemptsMade + 1;
      const maxAttempts = queueJob.opts.attempts ?? 1;
      const willRetry = attempts < maxAttempts;
      const message = error instanceof Error ? error.message : String(error);

      const failedLogs = appendEvent(runningLogs, `error: ${message}`);
      await prisma.job.update({
        where: { id: dbJobId },
        data: {
          status: willRetry ? 'queued' : 'failed',
          progress: 0,
          error: message,
          retryCount: attempts,
          logs: failedLogs
        }
      });

      throw error;
    }
  },
  {
    connection: redisConnection as any,
    concurrency
  }
);

console.log(`[comic-worker] queue=${COMIC_QUEUE_NAME} concurrency=${concurrency}`);
