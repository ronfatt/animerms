import { NextResponse } from 'next/server';
import { checkDbObjects, getDbFingerprint } from '../../../../lib/db/health';

export async function GET() {
  try {
    const fingerprint = getDbFingerprint();
    const objects = await checkDbObjects();
    return NextResponse.json({
      ok: Boolean(objects.jobsTable) && objects.assetTypeExists,
      fingerprint,
      objects
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        fingerprint: getDbFingerprint(),
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
