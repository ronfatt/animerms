-- Season-scale orchestration schema

CREATE TABLE IF NOT EXISTS series (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT NOT NULL,
  max_episodes INT NOT NULL DEFAULT 30,
  ratio_default TEXT NOT NULL DEFAULT '9:16',
  primary_language TEXT NOT NULL DEFAULT 'BM_SABAH',
  language_mode TEXT NOT NULL DEFAULT 'BM_SABAH',
  style_mode TEXT NOT NULL DEFAULT 'LOCAL_X_ANIME',
  platform_default TEXT NULL,
  ratio TEXT NOT NULL,
  platform TEXT NULL,
  series_input JSONB NOT NULL
);

ALTER TABLE series ADD COLUMN IF NOT EXISTS max_episodes INT NOT NULL DEFAULT 30;
ALTER TABLE series ADD COLUMN IF NOT EXISTS ratio_default TEXT NOT NULL DEFAULT '9:16';
ALTER TABLE series ADD COLUMN IF NOT EXISTS primary_language TEXT NOT NULL DEFAULT 'BM_SABAH';
ALTER TABLE series ADD COLUMN IF NOT EXISTS language_mode TEXT NOT NULL DEFAULT 'BM_SABAH';
ALTER TABLE series ADD COLUMN IF NOT EXISTS style_mode TEXT NOT NULL DEFAULT 'LOCAL_X_ANIME';
ALTER TABLE series ADD COLUMN IF NOT EXISTS platform_default TEXT NULL;

CREATE TABLE IF NOT EXISTS series_bible (
  id BIGSERIAL PRIMARY KEY,
  series_id BIGINT NOT NULL UNIQUE REFERENCES series(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bible_json JSONB NOT NULL
);

ALTER TABLE series_bible ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE series_bible ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE series_bible ADD COLUMN IF NOT EXISTS content_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE series_bible DROP CONSTRAINT IF EXISTS series_bible_series_id_key;

CREATE TABLE IF NOT EXISTS series_state (
  id BIGSERIAL PRIMARY KEY,
  series_id BIGINT NOT NULL UNIQUE REFERENCES series(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_episode_no INT NOT NULL DEFAULT 0,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS episodes (
  id BIGSERIAL PRIMARY KEY,
  series_id BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  episode_no INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  output_json JSONB NULL,
  score_json JSONB NULL,
  error_message TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(series_id, episode_no)
);

CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  series_id BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  requested_episodes INT[] NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS job_steps (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  episode_no INT NULL,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id BIGSERIAL PRIMARY KEY,
  series_id BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  episode_no INT NOT NULL,
  asset_type TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS continuity_issues (
  id BIGSERIAL PRIMARY KEY,
  series_id BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  episode_no INT NOT NULL,
  severity TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  field_path TEXT NULL,
  message TEXT NOT NULL,
  fix_instruction TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodes_series_status ON episodes(series_id, status);
CREATE INDEX IF NOT EXISTS idx_job_steps_job_status ON job_steps(job_id, status);
