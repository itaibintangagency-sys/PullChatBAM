import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateStaff } from '@/lib/apiAuth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAHA_BASE_URL = 'https://waha-oyoe5q2z3fct.coklat.sumopod.my.id';
// Sesi WAHA pengirim pesan tes. Default: sesi bot 7484 ("Customer").
const WAHA_TEST_SESSION = process.env.WAHA_TEST_SESSION || 'Customer';

// POST { id } -> kirim pesan tes ke nomor baris l0_config itu. Nomor dibaca dari DB (bukan dari klien).
export async function POST(req: NextRequest) {
  const caller = await authenticateStaff(req);
  if (caller instanceof NextResponse) return caller;
  if (caller.role !== 'admin') return NextResponse.json({ error: 'Hanya admin' }, { status: 403 });

  const apiKey = process.env.WAHA_API_KEY;
  if (!SERVICE_ROLE_KEY || !apiKey) {
    return NextResponse.json({ error: 'Server belum dikonfigurasi (SERVICE_ROLE_KEY / WAHA_API_KEY)' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: row } = await admin.from('l0_config').select('display_name, nomor_wa, active').eq('id', id).maybeSingle();
  const nomor = String(row?.nomor_wa || '').replace(/\D/g, '');
  if (!row || !/^62[0-9]{8,13}$/.test(nomor)) {
    return NextResponse.json({ error: 'Nomor tidak ditemukan atau tidak valid' }, { status: 404 });
  }

  const text =
    `Tes dari Kirana Monitor (diminta ${caller.displayName}).\n` +
    `Nomor ini terdaftar sebagai penerima notifikasi bot atas nama ${row.display_name}. ` +
    'Pesan ini hanya untuk memastikan nomor aktif; tidak perlu dibalas.';

  try {
    const res = await fetch(`${WAHA_BASE_URL}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ session: WAHA_TEST_SESSION, chatId: `${nomor}@c.us`, text }),
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ error: `WAHA menolak pesan (HTTP ${res.status})` }, { status: 502 });
  } catch {
    return NextResponse.json({ error: 'Gagal terhubung ke WAHA' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
