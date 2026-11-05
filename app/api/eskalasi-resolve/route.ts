import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateStaff } from '@/lib/apiAuth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAKS_ADMIN = 500;

// POST { ids: uuid[], catatan: string }  -> menandai tiket RESOLVE langsung.
// Super Admin: tiket mana pun, sampai 500 sekaligus (checklist). Staf: hanya SATU tiket miliknya sendiri per permintaan;
// penyelesaian massal oleh staf harus lewat persetujuan (RESOLVE ALL).
export async function POST(req: NextRequest) {
  const caller = await authenticateStaff(req);
  if (caller instanceof NextResponse) return caller;
  if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Server belum dikonfigurasi (SERVICE_ROLE_KEY)' }, { status: 500 });

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  const catatan = String(body?.catatan || '').trim().slice(0, 500);
  if (ids.length === 0 || ids.some((i) => !/^[0-9a-f-]{36}$/i.test(i))) {
    return NextResponse.json({ error: 'Daftar tiket tidak valid' }, { status: 400 });
  }
  if (!catatan) return NextResponse.json({ error: 'Isi catatan penyelesaian dulu.' }, { status: 400 });

  const isAdmin = caller.role === 'admin';
  if (!isAdmin && ids.length !== 1) {
    return NextResponse.json({ error: 'Staf hanya bisa menyelesaikan satu tiket sekaligus. Untuk banyak tiket, ajukan RESOLVE ALL.' }, { status: 403 });
  }
  if (ids.length > MAKS_ADMIN) return NextResponse.json({ error: `Maksimal ${MAKS_ADMIN} tiket sekaligus` }, { status: 400 });

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // Alias staf pemanggil (untuk memastikan tiket itu miliknya)
  let alias = '';
  if (!isAdmin) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('authorization') || '' } } });
    const { data: me } = await userClient.auth.getUser();
    const { data: prof } = await db.from('staff_profiles').select('escalation_alias').eq('id', me.user?.id || '').maybeSingle();
    alias = String(prof?.escalation_alias || '').trim().toUpperCase();
    if (!alias) return NextResponse.json({ error: 'Akunmu belum punya alias eskalasi.' }, { status: 403 });
  }

  const { data: rows, error } = await db.from('escalations').select('id, ticket_id, created_at, status, assigned_to').in('id', ids);
  if (error) return NextResponse.json({ error: 'Gagal membaca tiket' }, { status: 500 });

  const layak = (rows || []).filter((r) => {
    if (String(r.status || '').toUpperCase() === 'RESOLVE') return false;
    if (isAdmin) return true;
    return String(r.assigned_to || '').split(',').map((t) => t.trim().toUpperCase()).includes(alias);
  });
  if (layak.length === 0) return NextResponse.json({ error: 'Tidak ada tiket yang bisa diselesaikan (sudah selesai atau bukan milikmu).' }, { status: 409 });

  const sekarang = new Date();
  let selesai = 0;
  for (let i = 0; i < layak.length; i += 20) {
    const hasil = await Promise.all(
      layak.slice(i, i + 20).map(async (r) => {
        const jam = Math.round((sekarang.getTime() - new Date(r.created_at).getTime()) / 3600000);
        const { error: e } = await db
          .from('escalations')
          .update({ status: 'RESOLVE', resolution: catatan, resolved_at: sekarang.toISOString(), resolution_time: `${jam} hours` })
          .eq('id', r.id)
          .neq('status', 'RESOLVE');
        return !e;
      })
    );
    selesai += hasil.filter(Boolean).length;
  }

  console.log(`[eskalasi-resolve] ${caller.displayName} menyelesaikan ${selesai}/${ids.length} tiket`);
  return NextResponse.json({ ok: true, diminta: ids.length, selesai, dilewati: ids.length - layak.length });
}
