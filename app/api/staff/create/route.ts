import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: NextRequest) {
  // ============================================================
  // LANGKAH 1: ambil token dari header Authorization (bukan cookie --
  // proyek ini pakai @supabase/supabase-js polos dengan persistSession
  // di browser, bukan @supabase/ssr, jadi tidak ada cookie sesi
  // yang bisa dibaca server. Client (page.tsx) yang kirim token-nya.)
  // ============================================================
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Sesi tidak valid, coba login ulang' }, { status: 401 });
  }

  const { data: callerProfile } = await supabaseAdmin
    .from('staff_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (callerProfile?.role !== 'admin') {
    return NextResponse.json(
      { error: 'Cuma Super Admin yang boleh menambah staff baru' },
      { status: 403 }
    );
  }

  // ============================================================
  // LANGKAH 2: validasi input dasar
  // ============================================================
  const body = await request.json();
  const { email, password, display_name, role, escalation_alias } = body;

  if (!email || !password || !display_name || !role) {
    return NextResponse.json(
      { error: 'Email, password, nama, dan role wajib diisi' },
      { status: 400 }
    );
  }
  if (!['admin', 'staff'].includes(role)) {
    return NextResponse.json({ error: 'Role harus admin atau staff' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 });
  }

  // ============================================================
  // LANGKAH 3: buat akun auth baru
  // ============================================================
  const { data: newUser, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !newUser.user) {
    return NextResponse.json(
      { error: 'Gagal membuat akun: ' + (createError?.message || 'unknown') },
      { status: 500 }
    );
  }

  // ============================================================
  // LANGKAH 4: lengkapi staff_profiles (baris sudah otomatis dibuat trigger)
  // ============================================================
  const { error: updateError } = await supabaseAdmin
    .from('staff_profiles')
    .update({ display_name, role, escalation_alias: escalation_alias || null })
    .eq('id', newUser.user.id);

  if (updateError) {
    return NextResponse.json(
      {
        error: 'Akun berhasil dibuat TAPI gagal isi profil: ' + updateError.message,
        warning: 'user id: ' + newUser.user.id + ' -- perlu dilengkapi manual',
      },
      { status: 207 }
    );
  }

  return NextResponse.json({
    success: true,
    user_id: newUser.user.id,
    message: `Staff "${display_name}" berhasil dibuat.`,
  });
}
