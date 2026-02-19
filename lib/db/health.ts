import { prisma } from '../prisma';

function safePart(value: string | undefined): string {
  if (!value) return '-';
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

export function getDbFingerprint(): string {
  const raw = process.env.DATABASE_URL ?? '';
  if (!raw) return 'db:url:missing';
  try {
    const u = new URL(raw);
    const host = u.hostname || 'unknown-host';
    const db = (u.pathname || '').replace(/^\//, '') || 'unknown-db';
    const user = u.username || 'unknown-user';
    return `db:host=${host};db=${db};user=${safePart(user)}`;
  } catch {
    return 'db:url:invalid';
  }
}

export async function checkDbObjects(): Promise<{
  jobsTable: string | null;
  assetTypeExists: boolean;
}> {
  const jobsRows = await prisma.$queryRawUnsafe<Array<{ jobs_table: string | null }>>(
    "SELECT to_regclass('public.jobs') AS jobs_table"
  );
  const enumRows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'AssetType' AND n.nspname = 'public'
      ) AS exists
    `
  );

  return {
    jobsTable: jobsRows[0]?.jobs_table ?? null,
    assetTypeExists: Boolean(enumRows[0]?.exists)
  };
}
