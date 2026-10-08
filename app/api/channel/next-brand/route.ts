import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// POST { action: 'SKIP' | 'UNSKIP', nama_toko: string }
// SKIP   = "Next Brand": lewati brand yang SEDANG BERJALAN sampai dibatalkan
// UNSKIP = batalkan lewati
export async function POST(request: NextRequest) {
  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server not configured (SERVICE_ROLE_KEY)' }, { status: 500 });
  }

  // Verifikasi caller benar-benar admin (pola sama seperti /api/channel/reset)
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

  const { data: callerProfile } = await callerClient
    .from('staff_profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (callerProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Cuma admin yang boleh mengubah antrean brand' }, { status: 403 });
  }

  // Validasi body
  let body: { action?: unknown; nama_toko?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const action = body.action;
  const namaToko = typeof body.nama_toko === 'string' ? body.nama_toko.trim() : '';
  if ((action !== 'SKIP' && action !== 'UNSKIP') || !namaToko) {
    return NextResponse.json({ error: 'Permintaan tidak valid (action & nama_toko wajib)' }, { status: 400 });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // "Next Brand" hanya boleh untuk brand yang SEDANG BERJALAN, yaitu brand dari link
  // yang paling terakhir terkirim. Cegah salah-skip kalau tampilan sudah usang
  // (mis. slot baru saja jalan dan brand-nya berganti).
  if (action === 'SKIP') {
    const { data: terakhir, error: terakhirError } = await adminClient
      .from('campaign_links')
      .select('nama_toko')
      .not('last_sent_at', 'is', null)
      .order('last_sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (terakhirError) {
      return NextResponse.json({ error: 'Gagal membaca brand aktif: ' + terakhirError.message }, { status: 500 });
    }
    if (!terakhir || terakhir.nama_toko !== namaToko) {
      return NextResponse.json(
        { error: 'Brand yang sedang berjalan sudah berubah. Muat ulang halaman lalu coba lagi.' },
        { status: 409 }
      );
    }
  }

  const { data: diubah, error: rpcError } = await adminClient.rpc('set_brand_skip', {
    p_nama_toko: namaToko,
    p_skip: action === 'SKIP',
  });

  if (rpcError) {
    return NextResponse.json({ error: 'Gagal mengubah status brand: ' + rpcError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, action, nama_toko: namaToko, links_updated: diubah ?? 0 });
}
