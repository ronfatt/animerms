import { Pool } from 'pg';
import { config } from './config.js';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for job orchestration features.');
  }

  if (!pool) {
    pool = new Pool({ connectionString: config.DATABASE_URL });
  }

  return pool;
}
