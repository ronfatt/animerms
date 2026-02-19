import { Queue } from 'bullmq';
import { redisConnection } from './redis';
import type { PipelineStep } from '../pipeline/types';

export const COMIC_QUEUE_NAME = 'comic-pipeline';

export type ComicJobData = {
  dbJobId: string;
  seriesId: number;
  episodeId: number;
  step: PipelineStep;
  panelCount?: number;
};

export const comicQueue = new Queue<ComicJobData, unknown, string>(COMIC_QUEUE_NAME, {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 500,
    removeOnFail: false
  }
});
