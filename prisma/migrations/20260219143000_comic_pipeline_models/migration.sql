-- Comic Pipeline MVP production models
-- Fresh-database safe migration (Railway / Neon / Supabase)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_type') THEN
    CREATE TYPE asset_type AS ENUM ('image_raw', 'image_typeset', 'video');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS series (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  total_episodes INTEGER NOT NULL DEFAULT 30,
  language_mode TEXT NOT NULL DEFAULT 'BM_SABAH',
  style_preset TEXT NOT NULL DEFAULT 'LOCAL_X_ANIME',
  ratio TEXT NOT NULL DEFAULT '9:16',
  series_bible JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS episodes (
  id BIGSERIAL PRIMARY KEY,
  series_id BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  ep_number INTEGER NOT NULL,
  title TEXT,
  outline JSONB,
  script_45s JSONB,
  storyboard JSONB,
  motion_plan JSONB,
  audio_plan JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT episodes_series_id_ep_number_key UNIQUE (series_id, ep_number)
);

CREATE TABLE IF NOT EXISTS panels (
  id BIGSERIAL PRIMARY KEY,
  episode_id BIGINT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  panel_number INTEGER NOT NULL,
  prompt TEXT,
  negative_prompt TEXT,
  dialogue TEXT,
  narration TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT panels_episode_id_panel_number_key UNIQUE (episode_id, panel_number)
);

CREATE TABLE IF NOT EXISTS assets (
  id BIGSERIAL PRIMARY KEY,
  panel_id BIGINT REFERENCES panels(id) ON DELETE CASCADE,
  type asset_type,
  url TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  seed INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  series_id BIGINT NULL REFERENCES series(id) ON DELETE SET NULL,
  episode_id BIGINT NULL REFERENCES episodes(id) ON DELETE SET NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  logs JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS episodes_series_id_idx ON episodes(series_id);
CREATE INDEX IF NOT EXISTS episodes_status_idx ON episodes(status);

CREATE INDEX IF NOT EXISTS panels_episode_id_idx ON panels(episode_id);
CREATE INDEX IF NOT EXISTS panels_status_idx ON panels(status);

CREATE INDEX IF NOT EXISTS assets_panel_id_idx ON assets(panel_id);
CREATE INDEX IF NOT EXISTS assets_type_idx ON assets(type);

CREATE INDEX IF NOT EXISTS jobs_series_id_idx ON jobs(series_id);
CREATE INDEX IF NOT EXISTS jobs_episode_id_idx ON jobs(episode_id);
CREATE INDEX IF NOT EXISTS jobs_step_idx ON jobs(step);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
