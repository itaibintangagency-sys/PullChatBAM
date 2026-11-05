import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateStaff } from '@/lib/apiAuth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// POST { id, dryRun?, hapusRiwayat?, konfirmasi?, konfirmasiRiwayat? }
// Khusus Super Admin. dryRun hanya menghitung apa yang akan terhapus. Penghapusan sungguhan permanen.
export async function POST(req: NextRequest) {
  const caller = await authenticateStaff(req);
  if (caller instanceof NextResponse) return caller;
  if (caller.role !== 'admin') return NextResponse.json({ error: 'Hanya Super Admin yang boleh menghapus data eskalasi' }, { status: 403 });
  if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Server belum dikonfigurasi (SERVICE_ROLE_KEY)' }, { status: 500 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });
  const dryRun = body?.dryRun === true;
  const hapusRiwayat = body?.hapusRiwayat === true;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: esc } = await db
    .from('escalations')
    .select('id, ticket_id, bot_source, nomor_wa, platform_user_id, nama')
    .eq('id', id)
    .maybeSingle();
  if (!esc) return NextResponse.json({ error: 'Tiket tidak ditemukan (mungkin sudah dihapus)' }, { status: 404 });

  // Identitas pelanggan untuk mencari riwayat: nomor WA dan/atau ID akun IG/FB (hanya karakter aman)
  const ids = Array.from(
    new Set([esc.nomor_wa, esc.platform_user_id].map((v) => String(v ?? '').trim()).filter((v) => /^[0-9A-Za-z_.:-]{3,64}$/.test(v)))
  );
  const daftar = ids.join(',');
  const orLog = `nomor_wa.in.(${daftar}),platform_user_id.in.(${daftar})`;

  if (dryRun) {
    const [chat, keputusan, lain] = await Promise.all([
      ids.length ? db.from('chat_logs').select('id', { count: 'exact', head: true }).in('nomor_wa', ids) : Promise.resolve({ count: 0 }),
      ids.length ? db.from('bot_decision_log').select('id', { count: 'exact', head: true }).or(orLog) : Promise.resolve({ count: 0 }),
      ids.length ? db.from('escalations').select('id', { count: 'exact', head: true }).neq('id', id).or(orLog) : Promise.resolve({ count: 0 }),
    ]);
    return NextResponse.json({
      ticket_id: esc.ticket_id,
      nama: esc.nama,
      pesanChat: chat.count ?? 0,
      logKeputusanBot: keputusan.count ?? 0,
      tiketLainPelanggan: lain.count ?? 0,
    });
  }

  if (body?.konfirmasi !== true) return NextResponse.json({ error: 'Konfirmasi diperlukan' }, { status: 400 });
  if (hapusRiwayat && body?.konfirmasiRiwayat !== true) {
    return NextResponse.json({ error: 'Konfirmasi kedua untuk hapus riwayat diperlukan' }, { status: 400 });
  }

  // Tabel yang menunjuk ke tiket (feedback, dormant_tracking) dihapus dulu, baru tiketnya.
  const f = await db.from('feedback').delete().eq('ticket_id', esc.ticket_id);
  const d = await db.from('dormant_tracking').delete().eq('ticket_id', esc.ticket_id);
  if (f.error || d.error) return NextResponse.json({ error: 'Gagal menghapus data terkait tiket' }, { status: 500 });
  const e = await db.from('escalations').delete().eq('id', id);
  if (e.error) return NextResponse.json({ error: 'Gagal menghapus tiket' }, { status: 500 });

  // Status percakapan bot tersimpan di phonebook, bukan di tiket: kembalikan ke MAIN_MENU supaya pelanggan
  // tidak tertahan di STANDBY setelah tiketnya dihapus.
  let sesiDireset = 0;
  if (ids.length) {
    let q = db
      .from('phonebook')
      .update({ stage: 'MAIN_MENU', stage_updated_at: new Date().toISOString(), category: null, sub_category: null, context_json: {} }, { count: 'exact' })
      .or(`nomor_wa.in.(${daftar}),platform_user_id.in.(${daftar})`);
    if (esc.bot_source) q = q.eq('bot_source', esc.bot_source);
    const s = await q;
    if (!s.error) sesiDireset = s.count ?? 0;
  }

  let pesanChat = 0;
  let logKeputusanBot = 0;
  if (hapusRiwayat && ids.length) {
    const c = await db.from('chat_logs').delete({ count: 'exact' }).in('nomor_wa', ids);
    const k = await db.from('bot_decision_log').delete({ count: 'exact' }).or(orLog);
    if (c.error || k.error) {
      return NextResponse.json({ error: 'Tiket terhapus, tetapi riwayat percakapan gagal dihapus sebagian. Coba lagi.' }, { status: 500 });
    }
    pesanChat = c.count ?? 0;
    logKeputusanBot = k.count ?? 0;
  }

  console.log(`[eskalasi-hapus] ${caller.displayName} menghapus ${esc.ticket_id}; riwayat=${hapusRiwayat} chat=${pesanChat} log=${logKeputusanBot}`);
  return NextResponse.json({ ok: true, ticket_id: esc.ticket_id, pesanChat, logKeputusanBot, sesiDireset });
}
