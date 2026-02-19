import { Queue } from 'bullmq';
import { config } from './config.js';

let seasonQueue: Queue | null = null;
let episodeQueue: Queue | null = null;

function getConnection() {
  if (!config.REDIS_URL) {
    throw new Error('REDIS_URL is required for queue features.');
  }
  return { url: config.REDIS_URL };
}

export function getSeasonQueue(): Queue {
  if (!seasonQueue) {
    seasonQueue = new Queue('season-jobs', { connection: getConnection() });
  }
  return seasonQueue;
}

export function getEpisodeQueue(): Queue {
  if (!episodeQueue) {
    episodeQueue = new Queue('episode-jobs', { connection: getConnection() });
  }
  return episodeQueue;
}
