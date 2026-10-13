import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const WEBHOOK_URL = process.env.BLACKLIST_NOTIFY_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.BLACKLIST_NOTIFY_SECRET;

// POST { nomor_wa, bot_source, reason? }
// Dipanggil Monitor SESUDAH staf menambah nomor blacklist MANUAL. Meneruskan ke webhook n8n, yang mengirim WA ke
// seluruh anggota aktif pool ALERT. Baris blacklist-nya sendiri sudah tersimpan lebih dulu oleh halaman Blacklist.
export async function POST(request: NextRequest) {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Server not configured (BLACKLIST_NOTIFY_WEBHOOK_URL/SECRET)' }, { status: 500 });
  }

  // 1. Pemanggil harus staf yang sedang login (halaman Blacklist memang terbuka untuk semua staf)
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
    return NextResponse.json({ error: 'Hanya staf yang boleh memicu notifikasi blacklist' }, { status: 403 });
  }

  // 2. Validasi input
  let body: { nomor_wa?: string; bot_source?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body bukan JSON' }, { status: 400 });
  }
  let nomor = String(body.nomor_wa || '').replace(/[^0-9]/g, '');
  if (nomor.startsWith('0')) nomor = '62' + nomor.slice(1); // sama seperti normalizeNomor di halaman Blacklist
  const botSource = String(body.bot_source || '');
  const reason = String(body.reason || '').trim().slice(0, 300);
  if (!/^62[0-9]{8,13}$/.test(nomor)) {
    return NextResponse.json({ error: 'nomor_wa tidak valid' }, { status: 400 });
  }
  if (botSource !== '1052' && botSource !== '7484') {
    return NextResponse.json({ error: 'bot_source tidak valid' }, { status: 400 });
  }

  // 3. Hanya nomor yang BENAR-BENAR sudah berstatus CONFIRMED di blacklist (dicek lewat RLS staf) yang boleh dinotifikasi,
  //    supaya endpoint ini tidak bisa dipakai mengirim WA untuk nomor sembarang.
  const { data: row } = await callerClient
    .from('blacklist')
    .select('id')
    .eq('nomor_wa', nomor)
    .eq('bot_source', botSource)
    .eq('status', 'CONFIRMED')
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: 'Nomor itu belum ada di blacklist (CONFIRMED)' }, { status: 404 });
  }

  // 4. Teruskan ke n8n
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({ nomor_wa: nomor, bot_source: botSource, reason, added_by: profile.display_name || '' }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Webhook n8n menolak (' + res.status + ')' }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Gagal menghubungi n8n' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
