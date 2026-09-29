import { NextRequest, NextResponse } from 'next/server';

const N8N_BASE_URL = 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id';

export async function POST(req: NextRequest) {
  const apiKey = process.env.N8N_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'N8N_API_KEY belum diset di environment Vercel' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const id: string = body?.id;
  const action: string = body?.action;

  if (!id || (action !== 'activate' && action !== 'deactivate')) {
    return NextResponse.json({ error: 'Parameter tidak valid' }, { status: 400 });
  }

  try {
    const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${id}/${action}`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': apiKey },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `n8n menolak (HTTP ${res.status}): ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ active: Boolean(data.active) });
  } catch {
    return NextResponse.json({ error: 'Gagal konek ke n8n' }, { status: 502 });
  }
}
