import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const NOTIFY_WEBHOOK_URL = process.env.BLACKLIST_NOTIFY_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.BLACKLIST_NOTIFY_SECRET;
// Boleh diisi sendiri; kalau kosong dipakai alamat webhook notify dengan jalur diganti
const CLEARED_WEBHOOK_URL =
  process.env.BLACKLIST_CLEARED_WEBHOOK_URL ||
  (NOTIFY_WEBHOOK_URL ? NOTIFY_WEBHOOK_URL.replace(/blacklist-notify\/?$/, 'blacklist-cleared') : undefined);

// Selisih waktu maksimum antara keputusan CLEARED dan pemanggilan ini. Workflow n8n punya batas yang sama.
const MAX_AGE_MS = 15 * 60 * 1000;

// POST { nomor_wa, bot_source }
// Dipanggil Monitor SESUDAH staf menyatakan kandidat blacklist BUKAN spam (CLEARED). Meneruskan ke webhook n8n, yang
// mengirim sambutan Kirana ke nomor itu dan mereset stage-nya. n8n yang memastikan sambutan hanya terkirim sekali.
export async function POST(request: NextRequest) {
  if (!CLEARED_WEBHOOK_URL || !WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Server not configured (BLACKLIST_NOTIFY_WEBHOOK_URL/SECRET)' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.replace('Bearer ', '');

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await callerClient
    .from('staff_profiles')
    .select('display_name')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: 'Hanya staf yang boleh memicu sambutan' }, { status: 403 });
  }

  let body: { nomor_wa?: string; bot_source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body bukan JSON' }, { status: 400 });
  }
  let nomor = String(body.nomor_wa || '').replace(/[^0-9]/g, '');
  if (nomor.startsWith('0')) nomor = '62' + nomor.slice(1);
  const botSource = String(body.bot_source || '');
  if (!/^62[0-9]{8,13}$/.test(nomor)) {
    return NextResponse.json({ error: 'nomor_wa tidak valid' }, { status: 400 });
  }
  if (botSource !== '1052' && botSource !== '7484') {
    return NextResponse.json({ error: 'bot_source tidak valid' }, { status: 400 });
  }

  // Hanya nomor yang BENAR-BENAR baru dinyatakan CLEARED (dicek lewat RLS staf) yang boleh disapa,
  // supaya endpoint ini tidak bisa dipakai mengirim WA ke nomor sembarang.
  const { data: row } = await callerClient
    .from('blacklist')
    .select('id, reviewed_at')
    .eq('nomor_wa', nomor)
    .eq('bot_source', botSource)
    .eq('status', 'CLEARED')
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: 'Nomor itu belum berstatus CLEARED' }, { status: 404 });
  }
  const reviewedAt = row.reviewed_at ? new Date(row.reviewed_at).getTime() : 0;
  if (!reviewedAt || Date.now() - reviewedAt > MAX_AGE_MS) {
    return NextResponse.json({ error: 'Keputusan CLEARED sudah terlalu lama' }, { status: 409 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(CLEARED_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({ nomor_wa: nomor, bot_source: botSource }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Webhook n8n menolak (' + res.status + ')' }, { status: 502 });
    }
    const result = (await res.json().catch(() => ({}))) as { sent?: boolean };
    return NextResponse.json({ success: true, sent: result.sent === true });
  } catch {
    return NextResponse.json({ error: 'Gagal menghubungi n8n' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
