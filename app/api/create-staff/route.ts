import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: NextRequest) {
  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  // 1. Ambil token dari staff yang lagi request -- buat verifikasi dia beneran admin
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
    return NextResponse.json({ error: 'Cuma admin yang boleh menambah staff' }, { status: 403 });
  }

  // 2. Validasi input (escalationAlias opsional -- boleh kosong)
  const { email, password, displayName, escalationAlias } = await request.json();
  if (!email || !password || !displayName) {
    return NextResponse.json({ error: 'Email, password, dan nama wajib diisi' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 });
  }

  // 3. Bikin akun baru pakai service role (hak akses tinggi, cuma di server)
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !newUser.user) {
    return NextResponse.json({ error: createError?.message || 'Gagal membuat akun' }, { status: 400 });
  }

  // 4. Trigger otomatis sudah bikin baris staff_profiles (role default 'staff') --
  // tinggal isi display_name & escalation_alias-nya
  const { error: updateError } = await adminClient
    .from('staff_profiles')
    .update({
      display_name: displayName,
      escalation_alias: escalationAlias?.trim() || null,
    })
    .eq('id', newUser.user.id);

  if (updateError) {
    return NextResponse.json({ error: 'Akun dibuat, tapi gagal set nama: ' + updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: newUser.user.id });
}
