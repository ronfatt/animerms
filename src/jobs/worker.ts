import { Worker } from 'bullmq';
import { config } from '../core/config.js';
import { getDbPool } from '../core/db.js';
import { logger } from '../core/logger.js';
import { getContinuityContextForEpisode } from './service.js';
import { runEpisodeGeneration } from '../pipeline/runEpisode.js';
import { SeriesInputSchema } from '../schemas/series.schema.js';

if (!config.REDIS_URL) {
  throw new Error('REDIS_URL is required to run workers.');
}

const connection = { url: config.REDIS_URL };
const db = getDbPool();

new Worker(
  'season-jobs',
  async (job) => {
    const { jobId } = job.data as { jobId: number };
    await db.query(`UPDATE jobs SET status = 'running', started_at = NOW(), error_message = NULL WHERE id = $1`, [
      jobId
    ]);
    logger.info(`[worker] season job ${jobId} running`);
  },
  { connection }
);

new Worker(
  'episode-jobs',
  async (job) => {
    const { jobId, seriesId, episodeNo } = job.data as {
      jobId: number;
      seriesId: number;
      episodeNo: number;
    };

    await db.query(
      `UPDATE episodes
       SET status = 'running', started_at = NOW(), attempts = attempts + 1, error_message = NULL
       WHERE series_id = $1 AND episode_no = $2`,
      [seriesId, episodeNo]
    );

    await db.query(
      `UPDATE job_steps
       SET status = 'running', started_at = NOW(), attempts = attempts + 1
       WHERE job_id = $1 AND episode_no = $2 AND step_key = 'GenerateEpisodeScript'`,
      [jobId, episodeNo]
    );

    try {
      const seriesRes = await db.query<{ series_input: unknown }>(
        `SELECT series_input FROM series WHERE id = $1 LIMIT 1`,
        [seriesId]
      );
      if (seriesRes.rowCount === 0) {
        throw new Error(`Series not found for id=${seriesId}`);
      }

      const series = SeriesInputSchema.parse(seriesRes.rows[0].series_input);
      const continuityMemory = await getContinuityContextForEpisode(seriesId, episodeNo);
      const result = await runEpisodeGeneration({
        series,
        episodeNo,
        renderImages: false,
        continuityMemory
      });

      await db.query(
        `UPDATE episodes
         SET status = 'done', finished_at = NOW(), output_json = $3::jsonb, score_json = $4::jsonb
         WHERE series_id = $1 AND episode_no = $2`,
        [seriesId, episodeNo, JSON.stringify(result.output), JSON.stringify(result.output.qc_scores)]
      );

      await db.query(
        `UPDATE job_steps
         SET status = 'done', finished_at = NOW()
         WHERE job_id = $1 AND episode_no = $2`,
        [jobId, episodeNo]
      );

      await db.query(
        `UPDATE series_state
         SET last_episode_no = GREATEST(last_episode_no, $2),
             updated_at = NOW(),
             state_json = jsonb_build_object(
               'last_title', $3,
               'last_logline', $4,
               'last_episode_no', $2
             )
         WHERE series_id = $1`,
        [seriesId, episodeNo, result.output.title, result.output.logline]
      );

      const pending = await db.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM episodes
         WHERE series_id = $1 AND status IN ('queued','running','pending')`,
        [seriesId]
      );

      if (Number(pending.rows[0].c) === 0) {
        await db.query(`UPDATE jobs SET status = 'done', finished_at = NOW() WHERE id = $1`, [jobId]);
      }

      logger.info(`[worker] episode job done: series=${seriesId} ep=${episodeNo}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.query(
        `UPDATE episodes
         SET status = 'failed', finished_at = NOW(), error_message = $3
         WHERE series_id = $1 AND episode_no = $2`,
        [seriesId, episodeNo, message]
      );
      await db.query(`UPDATE jobs SET status = 'failed', error_message = $2 WHERE id = $1`, [jobId, message]);
      await db.query(
        `UPDATE job_steps
         SET status = 'failed', finished_at = NOW(), error_message = $3
         WHERE job_id = $1 AND episode_no = $2`,
        [jobId, episodeNo, message]
      );
      logger.error(`[worker] episode job failed: series=${seriesId} ep=${episodeNo} err=${message}`);
      throw error;
    }
  },
  { connection }
);

logger.info('Workers started: season-jobs, episode-jobs');
