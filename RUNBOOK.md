# Comic Pipeline MVP Runbook

## 1) Local sanity checks

```bash
npm run build
npm run next:build
npm run doctor
```

Expected:
- `build` and `next:build` pass.
- `doctor` prints:
  - `jobs_table: public.jobs`
  - `asset_type: ok`
  - `db health: ok`

## 2) Worker mode (recommended)

Use DB polling mode to avoid Vercel->Redis enqueue issues:

```env
JOB_DISPATCH_MODE=db_poll
DB_POLL_INTERVAL_MS=1500
```

Set this on both:
- Vercel project
- Railway worker service

## 3) Required DB objects

If worker logs mention missing `AssetType`, run:

```bash
npx prisma db execute --file prisma/patch-assettype.sql --schema prisma/schema.prisma
```

Then:

```bash
npx prisma migrate deploy
npx prisma generate
```

## 4) Deploy order

1. Redeploy Railway worker
2. Redeploy Vercel (without cache)
3. Open `/api/health/db` and verify:
   - `ok: true`
   - `objects.jobsTable` exists
   - `objects.assetTypeExists: true`

## 5) Common symptoms

- Step stuck at `queued`:
  - Worker not running, wrong DB URL, or DB objects missing.
- `P1014 model Job does not exist`:
  - Connected DB has no `jobs` table.
- `AssetType does not exist`:
  - Enum missing in DB. Apply `prisma/patch-assettype.sql`.
