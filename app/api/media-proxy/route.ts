import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOST = 'waha-oyoe5q2z3fct.coklat.sumopod.my.id';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Cegah SSRF -- cuma boleh proxy ke host WAHA yang dikenal, bukan URL bebas
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }
  if (parsed.hostname !== ALLOWED_HOST) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  const apiKey = process.env.WAHA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const wahaRes = await fetch(url, {
    headers: { 'X-Api-Key': apiKey },
  });

  if (!wahaRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch media' }, { status: wahaRes.status });
  }

  const contentType = wahaRes.headers.get('content-type') || 'application/octet-stream';
  const buffer = await wahaRes.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
