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
    return NextResponse.json({ error: 'Cuma admin yang boleh menghapus history' }, { status: 403 });
  }

  // Hapus SEMUA baris channel_broadcast_log -- pakai service role krn
  // browser cuma dikasih policy SELECT, bukan DELETE (sengaja, biar staff
  // biasa tidak bisa hapus lewat cara lain selain tombol admin ini)
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error, count } = await adminClient
    .from('channel_broadcast_log')
    .delete({ count: 'exact' })
    .not('id', 'is', null); // hapus semua baris (perlu WHERE, Supabase tolak DELETE tanpa filter)

  if (error) {
    return NextResponse.json({ error: 'Gagal menghapus history: ' + error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: count ?? 0 });
}
