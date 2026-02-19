import { Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { PipelineStep } from '../lib/pipeline/types';
import { runPipelineStep } from '../lib/pipeline/runStep';
import { checkDbObjects, getDbFingerprint } from '../lib/db/health';

const dispatchMode = String(process.env.JOB_DISPATCH_MODE ?? 'bullmq').toLowerCase();
const concurrency = Number(process.env.COMIC_WORKER_CONCURRENCY ?? 2);
const dbPollIntervalMs = Number(process.env.DB_POLL_INTERVAL_MS ?? 1500);
const maxAttempts = Number(process.env.JOB_MAX_RETRIES ?? 3);

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
  if (!next) return;

  const nextLogs = appendEvent(next.logs as Prisma.JsonObject | null, `released by previous step ${current.step}`);
  await prisma.job.update({
    where: { id: next.id },
    data: {
      status: 'queued',
      logs: nextLogs
    }
  });

  if (dispatchMode !== 'db_poll') {
    const { comicQueue } = await import('../lib/queue/queues');
    const queueAny = comicQueue as any;
    await queueAny.add(
      'pipeline_step',
      {
        dbJobId: next.id.toString(),
        seriesId: Number(next.seriesId),
        episodeId: Number(next.episodeId),
        step: next.step as PipelineStep,
        panelCount:
          typeof (nextLogs.panelCount as number | undefined) === 'number' ? Number(nextLogs.panelCount) : undefined
      },
      {
        jobId: `db-${next.id.toString()}`
      }
    );
  }
}

async function runDbJob(dbJobId: bigint, step: PipelineStep, seriesId: bigint, episodeId: bigint, panelCount?: number) {
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
    const result = await runPipelineStep(step, { seriesId, episodeId, panelCount });
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
  } catch (error) {
    const current = await prisma.job.findUnique({ where: { id: dbJobId } });
    const attempts = Number(current?.retryCount ?? 0) + 1;
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

    if (!willRetry) {
      console.error(`[comic-worker] job=${dbJobId.toString()} failed: ${message}`);
    }
  }
}

async function runDbPollLoop() {
  const fp = getDbFingerprint();
  console.log(`[comic-worker] ${fp}`);
  const objects = await checkDbObjects();
  if (!objects.jobsTable) {
    throw new Error(`[comic-worker] missing table public.jobs (${fp})`);
  }
  if (!objects.assetTypeExists) {
    throw new Error(`[comic-worker] missing enum public.AssetType (${fp})`);
  }

  console.log(
    `[comic-worker] mode=db_poll concurrency=${concurrency} intervalMs=${dbPollIntervalMs} retries=${maxAttempts}`
  );

  setInterval(async () => {
    for (let i = 0; i < concurrency; i++) {
      try {
        const candidate = await prisma.job.findFirst({
          where: {
            status: 'queued',
            seriesId: { not: null },
            episodeId: { not: null }
          },
          orderBy: { id: 'asc' }
        });
        if (!candidate || !candidate.seriesId || !candidate.episodeId) {
          break;
        }

        const claimed = await prisma.job.updateMany({
          where: { id: candidate.id, status: 'queued' },
          data: { status: 'running' }
        });
        if (claimed.count === 0) {
          continue;
        }

        const panelCount =
          typeof (candidate.logs as Prisma.JsonObject | null)?.panelCount === 'number'
            ? Number((candidate.logs as Prisma.JsonObject).panelCount)
            : undefined;

        await runDbJob(
          candidate.id,
          candidate.step as PipelineStep,
          BigInt(candidate.seriesId),
          BigInt(candidate.episodeId),
          panelCount
        );
      } catch (error) {
        console.error('[comic-worker] db_poll tick error', error);
      }
    }
  }, dbPollIntervalMs);
}

async function runBullmqWorker() {
  const { COMIC_QUEUE_NAME } = await import('../lib/queue/queues');
  const { redisConnection } = await import('../lib/queue/redis');

  const fp = getDbFingerprint();
  console.log(`[comic-worker] ${fp}`);
  const objects = await checkDbObjects();
  if (!objects.jobsTable) {
    throw new Error(`[comic-worker] missing table public.jobs (${fp})`);
  }
  if (!objects.assetTypeExists) {
    throw new Error(`[comic-worker] missing enum public.AssetType (${fp})`);
  }

  new Worker(
    COMIC_QUEUE_NAME,
    async (queueJob: {
      data: { dbJobId: string; seriesId: number; episodeId: number; step: PipelineStep; panelCount?: number };
      attemptsMade: number;
      opts: { attempts?: number };
    }) => {
      await runDbJob(
        BigInt(queueJob.data.dbJobId),
        queueJob.data.step,
        BigInt(queueJob.data.seriesId),
        BigInt(queueJob.data.episodeId),
        queueJob.data.panelCount
      );
    },
    {
      connection: redisConnection as any,
      concurrency
    }
  );

  console.log(`[comic-worker] mode=bullmq queue=${COMIC_QUEUE_NAME} concurrency=${concurrency}`);
}

if (dispatchMode === 'db_poll') {
  void runDbPollLoop();
} else {
  void runBullmqWorker();
}
