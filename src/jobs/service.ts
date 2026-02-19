import { getDbPool } from '../core/db.js';
import { getEpisodeQueue, getSeasonQueue } from '../core/queue.js';
import { config } from '../core/config.js';
import { SeriesInputSchema } from '../schemas/series.schema.js';
import type { AspectRatio, SeriesInput } from '../schemas/series.schema.js';

const STEP_KEYS = [
  'GenerateSeriesBible',
  'GenerateSeasonOutline',
  'GenerateEpisodeScript',
  'GenerateEpisodeStoryboard',
  'GenerateGeminiGridA',
  'GenerateGeminiGridB',
  'GenerateKlingPrompts',
  'ContinuityCheck',
  'PersistEpisode'
] as const;

export type CreateSeasonJobInput = {
  series: SeriesInput;
  startEpisode: number;
  endEpisode: number;
  ratioOverride?: AspectRatio;
};

export type SeasonJobInfo = {
  jobId: number;
  seriesId: number;
  episodes: number[];
  status: string;
};

export type SeriesContainerInfo = {
  seriesId: number;
  maxEpisodes: number;
  currentEpisodeNo: number;
};

function rangeEpisodes(startEpisode: number, endEpisode: number): number[] {
  const out: number[] = [];
  for (let n = startEpisode; n <= endEpisode; n++) out.push(n);
  return out;
}

export async function createSeasonJob(input: CreateSeasonJobInput): Promise<SeasonJobInfo> {
  if (input.startEpisode <= 0 || input.endEpisode < input.startEpisode) {
    throw new Error('Invalid episode range.');
  }

  const episodes = rangeEpisodes(input.startEpisode, input.endEpisode);
  if (episodes.length > config.JOB_MAX_EPISODES) {
    throw new Error(`Episode count exceeds JOB_MAX_EPISODES=${config.JOB_MAX_EPISODES}`);
  }

  const ratio = input.ratioOverride ?? input.series.ratio;
  const series = { ...input.series, ratio };
  const db = getDbPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const seriesRes = await client.query<{
      id: number;
    }>(
      `INSERT INTO series (
         title,
         max_episodes,
         ratio_default,
         primary_language,
         language_mode,
         style_mode,
         platform_default,
         ratio,
         platform,
         series_input
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING id`,
      [
        series.series_title,
        Math.min(config.JOB_MAX_EPISODES, 30),
        series.ratio,
        series.primary_language,
        series.language_mode,
        series.style_mode,
        series.platform ?? null,
        series.ratio,
        series.platform ?? null,
        JSON.stringify(series)
      ]
    );
    const seriesId = seriesRes.rows[0].id;

    const bibleJson = {
      version: 1,
      character_bible: series.characters,
      location_bible: series.world,
      world_rules: {
        core_conflict: series.core_conflict,
        theme: series.theme
      },
      style_lock: {
        ratio: series.ratio,
        style_mode: series.style_mode,
        style_variant: series.style_variant ?? 'semi-real anime cinematic',
        safe_area_defaults:
          series.ratio === '9:16'
            ? ['top 10%', 'bottom 18%']
            : ['bottom 12-15%']
      }
    };

    await client.query(
      `INSERT INTO series_bible (series_id, version, locked, content_json, bible_json)
       VALUES ($1, 1, false, $2::jsonb, $2::jsonb)`,
      [seriesId, JSON.stringify(bibleJson)]
    );

    await client.query(
      `INSERT INTO series_state (series_id, last_episode_no, state_json)
       VALUES ($1, 0, '{}'::jsonb)
       ON CONFLICT (series_id) DO NOTHING`,
      [seriesId]
    );

    const jobRes = await client.query<{ id: number }>(
      `INSERT INTO jobs (series_id, job_type, status, requested_episodes, payload_json)
       VALUES ($1, 'season_generation', 'queued', $2::int[], $3::jsonb)
       RETURNING id`,
      [seriesId, episodes, JSON.stringify({ ratioOverride: input.ratioOverride ?? null })]
    );
    const jobId = jobRes.rows[0].id;

    for (const episodeNo of episodes) {
      await client.query(
        `INSERT INTO episodes (series_id, episode_no, status)
         VALUES ($1, $2, 'queued')
         ON CONFLICT (series_id, episode_no) DO NOTHING`,
        [seriesId, episodeNo]
      );

      for (const key of STEP_KEYS) {
        await client.query(
          `INSERT INTO job_steps (job_id, episode_no, step_key, status)
           VALUES ($1, $2, $3, 'pending')`,
          [jobId, episodeNo, key]
        );
      }
    }

    await client.query('COMMIT');

    const seasonQueue = getSeasonQueue();
    const episodeQueue = getEpisodeQueue();

    await seasonQueue.add(`season-${jobId}`, { jobId, seriesId, episodes });
    for (const episodeNo of episodes) {
      await episodeQueue.add(`episode-${jobId}-${episodeNo}`, {
        jobId,
        seriesId,
        episodeNo
      });
    }

    return { jobId, seriesId, episodes, status: 'queued' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getSeasonJob(jobId: number): Promise<unknown> {
  const db = getDbPool();

  const jobRes = await db.query(
    `SELECT j.id, j.series_id, j.status, j.requested_episodes, j.created_at, j.started_at, j.finished_at, j.error_message
     FROM jobs j
     WHERE j.id = $1`,
    [jobId]
  );
  if (jobRes.rowCount === 0) return null;

  const stepsRes = await db.query(
    `SELECT episode_no, step_key, status, attempts, error_message, started_at, finished_at
     FROM job_steps
     WHERE job_id = $1
     ORDER BY episode_no, id`,
    [jobId]
  );

  const episodesRes = await db.query(
    `SELECT episode_no, status, attempts, error_message, started_at, finished_at
     FROM episodes
     WHERE series_id = $1
       AND episode_no = ANY($2::int[])
     ORDER BY episode_no`,
    [jobRes.rows[0].series_id, jobRes.rows[0].requested_episodes]
  );

  return {
    ...jobRes.rows[0],
    episodes: episodesRes.rows,
    steps: stepsRes.rows
  };
}

export async function retryEpisode(jobId: number, episodeNo: number): Promise<{ queued: boolean }> {
  const db = getDbPool();
  const jobRes = await db.query<{ id: number; series_id: number }>(
    `SELECT id, series_id FROM jobs WHERE id = $1`,
    [jobId]
  );
  if (jobRes.rowCount === 0) {
    throw new Error('Job not found.');
  }

  await db.query(
    `UPDATE episodes
     SET status = 'queued', error_message = NULL
     WHERE series_id = $1 AND episode_no = $2`,
    [jobRes.rows[0].series_id, episodeNo]
  );

  await db.query(
    `UPDATE job_steps
     SET status = 'pending', error_message = NULL
     WHERE job_id = $1 AND episode_no = $2`,
    [jobId, episodeNo]
  );

  const episodeQueue = getEpisodeQueue();
  await episodeQueue.add(`episode-${jobId}-${episodeNo}-retry-${Date.now()}`, {
    jobId,
    seriesId: jobRes.rows[0].series_id,
    episodeNo
  });

  return { queued: true };
}

export async function getContinuityContextForEpisode(
  seriesId: number,
  episodeNo: number
): Promise<{ bible?: string; state?: string; recentEpisodes?: string }> {
  const db = getDbPool();

  const bibleRes = await db.query<{ content_json: unknown }>(
    `SELECT content_json FROM series_bible WHERE series_id = $1 ORDER BY version DESC, id DESC LIMIT 1`,
    [seriesId]
  );
  const stateRes = await db.query<{ state_json: unknown }>(
    `SELECT state_json FROM series_state WHERE series_id = $1 LIMIT 1`,
    [seriesId]
  );
  const recentRes = await db.query<{ episode_no: number; output_json: unknown }>(
    `SELECT episode_no, output_json
     FROM episodes
     WHERE series_id = $1
       AND episode_no < $2
       AND status = 'done'
     ORDER BY episode_no DESC
     LIMIT 3`,
    [seriesId, episodeNo]
  );

  const recentEpisodes = recentRes.rows
    .reverse()
    .map((row) => {
      const out = row.output_json as { title?: string; logline?: string };
      return `EP${String(row.episode_no).padStart(2, '0')}: ${out?.title ?? 'Untitled'} | ${out?.logline ?? ''}`;
    })
    .join('\n');

  return {
    bible: bibleRes.rowCount ? JSON.stringify(bibleRes.rows[0].content_json) : undefined,
    state: stateRes.rowCount ? JSON.stringify(stateRes.rows[0].state_json) : undefined,
    recentEpisodes: recentEpisodes || undefined
  };
}

export async function generateNextEpisode(seriesId: number): Promise<{
  queued: boolean;
  jobId: number;
  nextEpisodeNo: number;
}> {
  const db = getDbPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const seriesRes = await client.query<{
      id: number;
      max_episodes: number;
    }>(`SELECT id, max_episodes FROM series WHERE id = $1 LIMIT 1`, [seriesId]);
    if (seriesRes.rowCount === 0) throw new Error('Series not found.');

    const stateRes = await client.query<{ last_episode_no: number }>(
      `SELECT last_episode_no FROM series_state WHERE series_id = $1 LIMIT 1`,
      [seriesId]
    );
    const current = stateRes.rowCount ? stateRes.rows[0].last_episode_no : 0;
    const nextEpisodeNo = current + 1;

    if (nextEpisodeNo > seriesRes.rows[0].max_episodes) {
      throw new Error('Reached max_episodes. Create a new Series (Season 2).');
    }

    const jobRes = await client.query<{ id: number }>(
      `INSERT INTO jobs (series_id, job_type, status, requested_episodes, payload_json)
       VALUES ($1, 'single_ep', 'queued', $2::int[], '{}'::jsonb)
       RETURNING id`,
      [seriesId, [nextEpisodeNo]]
    );
    const jobId = jobRes.rows[0].id;

    await client.query(
      `INSERT INTO episodes (series_id, episode_no, status)
       VALUES ($1, $2, 'queued')
       ON CONFLICT (series_id, episode_no) DO UPDATE SET status = 'queued', error_message = NULL`,
      [seriesId, nextEpisodeNo]
    );

    for (const key of STEP_KEYS) {
      await client.query(
        `INSERT INTO job_steps (job_id, episode_no, step_key, status)
         VALUES ($1, $2, $3, 'pending')`,
        [jobId, nextEpisodeNo, key]
      );
    }

    await client.query('COMMIT');
    const episodeQueue = getEpisodeQueue();
    await episodeQueue.add(`episode-${jobId}-${nextEpisodeNo}`, { jobId, seriesId, episodeNo: nextEpisodeNo });
    return { queued: true, jobId, nextEpisodeNo };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getSeriesBible(seriesId: number): Promise<unknown> {
  const db = getDbPool();
  const res = await db.query(
    `SELECT sb.series_id, sb.version, sb.locked, sb.content_json, sb.created_at
     FROM series_bible sb
     WHERE sb.series_id = $1
     ORDER BY sb.version DESC
     LIMIT 1`,
    [seriesId]
  );
  return res.rowCount ? res.rows[0] : null;
}

export async function upsertSeriesBible(
  seriesId: number,
  contentJson: unknown,
  locked: boolean
): Promise<unknown> {
  const db = getDbPool();
  const latest = await db.query<{ version: number; locked: boolean }>(
    `SELECT version, locked
     FROM series_bible
     WHERE series_id = $1
     ORDER BY version DESC
     LIMIT 1`,
    [seriesId]
  );

  if (latest.rowCount && latest.rows[0].locked) {
    throw new Error('Series Bible is locked. Unlock or create new Series to edit.');
  }

  const nextVersion = latest.rowCount ? latest.rows[0].version + 1 : 1;
  const inserted = await db.query(
    `INSERT INTO series_bible (series_id, version, locked, content_json, bible_json)
     VALUES ($1, $2, $3, $4::jsonb, $4::jsonb)
     RETURNING series_id, version, locked, content_json, created_at`,
    [seriesId, nextVersion, locked, JSON.stringify(contentJson)]
  );
  return inserted.rows[0];
}

export async function getSeriesOverview(seriesId: number): Promise<unknown> {
  const db = getDbPool();
  const seriesRes = await db.query(
    `SELECT id, title, max_episodes, ratio_default, primary_language, language_mode, style_mode, platform_default, created_at
     FROM series
     WHERE id = $1
     LIMIT 1`,
    [seriesId]
  );
  if (seriesRes.rowCount === 0) return null;

  const stateRes = await db.query(
    `SELECT last_episode_no, state_json, updated_at
     FROM series_state
     WHERE series_id = $1
     LIMIT 1`,
    [seriesId]
  );

  const episodeRes = await db.query(
    `SELECT episode_no, status, attempts, error_message, started_at, finished_at
     FROM episodes
     WHERE series_id = $1
     ORDER BY episode_no`,
    [seriesId]
  );

  const jobsRes = await db.query(
    `SELECT id, job_type, status, requested_episodes, created_at, started_at, finished_at, error_message
     FROM jobs
     WHERE series_id = $1
     ORDER BY id DESC
     LIMIT 20`,
    [seriesId]
  );

  const summaryRes = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'done')::int AS done,
       COUNT(*) FILTER (WHERE status = 'running')::int AS running,
       COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM episodes
     WHERE series_id = $1`,
    [seriesId]
  );

  return {
    series: seriesRes.rows[0],
    state: stateRes.rowCount
      ? {
          current_episode_no: stateRes.rows[0].last_episode_no,
          state_json: stateRes.rows[0].state_json,
          updated_at: stateRes.rows[0].updated_at
        }
      : null,
    summary: summaryRes.rows[0],
    episodes: episodeRes.rows,
    jobs: jobsRes.rows
  };
}

export async function queueBatchForSeries(
  seriesId: number,
  startEpisode: number,
  endEpisode: number
): Promise<SeasonJobInfo> {
  const db = getDbPool();
  const seriesRes = await db.query<{ series_input: unknown }>(
    `SELECT series_input FROM series WHERE id = $1 LIMIT 1`,
    [seriesId]
  );
  if (seriesRes.rowCount === 0) {
    throw new Error('Series not found.');
  }

  const series = SeriesInputSchema.parse(seriesRes.rows[0].series_input);
  return createSeasonJob({
    series,
    startEpisode,
    endEpisode
  });
}
