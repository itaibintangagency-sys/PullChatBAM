import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: NextRequest) {
  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server not configured (SERVICE_ROLE_KEY)' }, { status: 500 });
  }

  // Verifikasi caller benar-benar admin (pola sama seperti /api/channel/command)
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
    return NextResponse.json({ error: 'Cuma admin yang boleh reset Channel broadcast' }, { status: 403 });
  }

  // Reset total -- persis 4 langkah yg sudah disepakati sebelumnya:
  // 1. Reset rotasi produk (last_sent_at, send_count)
  // 2. Hapus histori broadcast
  // 3. Hapus histori verifikasi
  // 4. Pastikan status kembali aktif (jaga-jaga kalau sempat di-STOP)
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { error: err1 } = await adminClient
    .from('campaign_links')
    .update({ last_sent_at: null, send_count: 0 })
    .not('id_produk', 'is', null);
  if (err1) {
    return NextResponse.json({ error: 'Gagal reset rotasi produk: ' + err1.message }, { status: 500 });
  }

  const { error: err2 } = await adminClient
    .from('channel_broadcast_log')
    .delete()
    .not('id', 'is', null);
  if (err2) {
    return NextResponse.json({ error: 'Gagal hapus histori broadcast: ' + err2.message }, { status: 500 });
  }

  const { error: err3 } = await adminClient
    .from('broadcast_verification')
    .delete()
    .not('id', 'is', null);
  if (err3) {
    return NextResponse.json({ error: 'Gagal hapus histori verifikasi: ' + err3.message }, { status: 500 });
  }

  const { error: err4 } = await adminClient
    .from('channel_broadcast_control')
    .update({ is_active: true, updated_by: null })
    .eq('id', 1);
  if (err4) {
    return NextResponse.json({ error: 'Gagal reset status aktif: ' + err4.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
