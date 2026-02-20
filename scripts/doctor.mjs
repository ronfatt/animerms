import { PrismaClient } from '@prisma/client';

function safePart(value) {
  if (!value) return '-';
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function getDbFingerprint() {
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

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`[doctor] ${getDbFingerprint()}`);
    const jobsRows = await prisma.$queryRawUnsafe(
      "SELECT to_regclass('public.jobs')::text AS jobs_table"
    );
    const enumRows = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'AssetType' AND n.nspname = 'public'
      ) AS exists
    `);

    const jobsTable = jobsRows?.[0]?.jobs_table ?? null;
    const assetTypeExists = Boolean(enumRows?.[0]?.exists);

    console.log('[doctor] jobs_table:', jobsTable ?? 'missing');
    console.log('[doctor] asset_type:', assetTypeExists ? 'ok' : 'missing');

    if (!jobsTable || !assetTypeExists) {
      process.exitCode = 1;
      return;
    }

    console.log('[doctor] db health: ok');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[doctor] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
