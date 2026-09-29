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
  const ids: string[] = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids kosong' }, { status: 400 });
  }

  const results: Record<string, { active: boolean } | { error: string }> = {};

  await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${id}`, {
          headers: { 'X-N8N-API-KEY': apiKey },
          cache: 'no-store',
        });
        if (!res.ok) {
          results[id] = { error: `HTTP ${res.status}` };
          return;
        }
        const data = await res.json();
        results[id] = { active: Boolean(data.active) };
      } catch {
        results[id] = { error: 'Gagal konek ke n8n' };
      }
    })
  );

  return NextResponse.json({ results });
}
