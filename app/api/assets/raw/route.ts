import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

function decodeDataUrl(dataUrl: string): { mimeType: string; data: Buffer } | null {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma <= 5) return null;
  const header = dataUrl.slice(5, comma);
  const base64Part = dataUrl.slice(comma + 1);
  if (!header.includes(';base64')) return null;
  const mimeType = header.replace(';base64', '') || 'image/png';
  if (!base64Part) return null;
  return {
    mimeType,
    data: Buffer.from(base64Part, 'base64')
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const assetId = (url.searchParams.get('assetId') || '').trim();
    if (!assetId || !/^\d+$/.test(assetId)) {
      return NextResponse.json({ error: 'assetId is required' }, { status: 400 });
    }

    const asset = await prisma.asset.findUnique({
      where: { id: BigInt(assetId) },
      select: { url: true, type: true }
    });
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const decoded = decodeDataUrl(asset.url);
    if (!decoded) {
      return NextResponse.redirect(asset.url, { status: 302 });
    }

    const bytes = new Uint8Array(decoded.data);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': decoded.mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read asset' }, { status: 500 });
  }
}
