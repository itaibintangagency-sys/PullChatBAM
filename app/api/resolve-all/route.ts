import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NOTIFY_WEBHOOK_URL = process.env.BLACKLIST_NOTIFY_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.BLACKLIST_NOTIFY_SECRET;
// Boleh diisi sendiri; kalau kosong dipakai alamat webhook notify blacklist dengan jalur diganti
const RESOLVE_NOTIFY_URL =
  process.env.RESOLVE_NOTIFY_WEBHOOK_URL ||
  (NOTIFY_WEBHOOK_URL ? NOTIFY_WEBHOOK_URL.replace(/blacklist-notify\/?$/, 'resolve-request-notify') : undefined);

// Pesan error dari fungsi database -> teks untuk pengguna
function describeRpcError(message: string): { status: number; error: string } {
  if (message.includes('NO_OPEN_TICKETS')) return { status: 409, error: 'Tidak ada tiket OPEN untuk staf itu.' };
  if (message.includes('ALREADY_PENDING')) return { status: 409, error: 'Masih ada permintaan RESOLVE ALL yang menunggu persetujuan untuk staf itu.' };
  if (message.includes('UNKNOWN_ALIAS')) return { status: 400, error: 'Alias staf tidak dikenal.' };
  if (message.includes('NOT_APPROVER')) return { status: 403, error: 'Akun ini bukan penyetuju RESOLVE ALL.' };
  if (message.includes('ALREADY_DECIDED')) return { status: 409, error: 'Permintaan itu sudah diputuskan.' };
  if (message.includes('REQUEST_NOT_FOUND')) return { status: 404, error: 'Permintaan tidak ditemukan.' };
  return { status: 500, error: 'Gagal memproses permintaan.' };
}

interface Caller {
  userId: string;
  displayName: string;
  role: string;
  alias: string | null;
  admin: SupabaseClient;
}

async function authenticate(request: NextRequest): Promise<Caller | NextResponse> {
  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server not configured (SERVICE_ROLE_KEY)' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.replace('Bearer ', '');

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await callerClient
    .from('staff_profiles')
    .select('display_name, role, escalation_alias')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Hanya staf yang boleh memakai fitur ini' }, { status: 403 });

  return {
    userId: userData.user.id,
    displayName: profile.display_name || userData.user.email || 'Staf web',
    role: profile.role,
    alias: profile.escalation_alias ? String(profile.escalation_alias).toUpperCase() : null,
    admin: createClient(SUPABASE_URL, SERVICE_ROLE_KEY),
  };
}

// Nomor penyetuju untuk akun web ini: alias akun harus sama dengan alias baris l0_config yang berflag is_resolve_approver.
async function approverNomorFor(caller: Caller): Promise<string | null> {
  if (!caller.alias) return null;
  const { data } = await caller.admin
    .from('l0_config')
    .select('nomor_wa, escalation_alias, active, is_resolve_approver')
    .eq('is_resolve_approver', true)
    .eq('active', true);
  const row = (data || []).find((r) => String(r.escalation_alias || '').toUpperCase() === caller.alias);
  return row ? String(row.nomor_wa) : null;
}

// GET -> { canApprove } supaya halaman tahu perlu menampilkan tombol Setujui/Tolak atau tidak
export async function GET(request: NextRequest) {
  const caller = await authenticate(request);
  if (caller instanceof NextResponse) return caller;
  return NextResponse.json({ canApprove: (await approverNomorFor(caller)) !== null });
}

// POST { action: 'create', bot_source, alias?, note? }  |  { action: 'decide', request_id, approve, note? }
export async function POST(request: NextRequest) {
  const caller = await authenticate(request);
  if (caller instanceof NextResponse) return caller;

  let body: {
    action?: string;
    bot_source?: string;
    alias?: string;
    note?: string;
    ticket_ids?: string[];
    request_id?: string;
    approve?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body bukan JSON' }, { status: 400 });
  }

  if (body.action === 'create') {
    const botSource = String(body.bot_source || '');
    if (botSource !== '1052' && botSource !== '7484') {
      return NextResponse.json({ error: 'bot_source tidak valid' }, { status: 400 });
    }
    // Staf biasa hanya boleh untuk tiketnya sendiri; admin boleh memilih staf mana pun.
    const alias = (caller.role === 'admin' ? String(body.alias || '') : caller.alias || '').trim().toUpperCase();
    if (!alias) {
      return NextResponse.json(
        { error: caller.role === 'admin' ? 'Pilih alias staf dulu.' : 'Akunmu belum punya alias eskalasi. Minta Super Admin mengisinya.' },
        { status: 400 }
      );
    }
    const note = String(body.note || '').trim().slice(0, 300);
    let ticketIds: string[] | null = null;
    if (Array.isArray(body.ticket_ids)) {
      ticketIds = body.ticket_ids.map(String);
      if (ticketIds.length === 0 || ticketIds.length > 500 || ticketIds.some((i) => !/^[0-9a-f-]{36}$/i.test(i))) {
        return NextResponse.json({ error: 'Daftar tiket tidak valid' }, { status: 400 });
      }
    }

    const { data, error } = await caller.admin.rpc('create_resolve_request', {
      p_bot_source: botSource,
      p_alias: alias,
      p_requested_by_nomor: null,
      p_via: 'WEB',
      p_resolution_text: note || null,
      // Checklist: hanya tiket terpilih (tetap disaring fungsi database: OPEN dan milik alias itu)
      p_ticket_ids: ticketIds,
    });
    if (error) {
      const d = describeRpcError(error.message || '');
      return NextResponse.json({ error: d.error }, { status: d.status });
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { out_request_id: string; out_ticket_count: number; out_expires_at: string }
      | undefined;
    if (!row) return NextResponse.json({ error: 'Gagal membuat permintaan.' }, { status: 500 });

    // Beri tahu penyetuju lewat WhatsApp. Gagal kirim tidak membatalkan permintaan (masih bisa diputuskan dari web).
    let notified = false;
    if (RESOLVE_NOTIFY_URL && WEBHOOK_SECRET) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(RESOLVE_NOTIFY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
          body: JSON.stringify({
            request_id: row.out_request_id,
            bot_source: botSource,
            alias,
            ticket_count: row.out_ticket_count,
            expires_at: row.out_expires_at,
            requested_by: caller.displayName,
            note,
          }),
          signal: controller.signal,
        });
        notified = res.ok;
      } catch {
        notified = false;
      } finally {
        clearTimeout(timer);
      }
    }
    return NextResponse.json({
      success: true,
      request_id: row.out_request_id,
      ticket_count: row.out_ticket_count,
      notified,
    });
  }

  if (body.action === 'decide') {
    const requestId = String(body.request_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(requestId) || typeof body.approve !== 'boolean') {
      return NextResponse.json({ error: 'Data keputusan tidak lengkap' }, { status: 400 });
    }
    const nomor = await approverNomorFor(caller);
    if (!nomor) {
      return NextResponse.json(
        { error: 'Akun web ini belum ditautkan ke penyetuju. Isi alias akun sama dengan alias penyetuju di Staff & Routing.' },
        { status: 403 }
      );
    }
    const { data, error } = await caller.admin.rpc('decide_resolve_request', {
      p_request_id: requestId,
      p_approver_nomor: nomor,
      p_approve: body.approve,
      p_note: String(body.note || '').trim().slice(0, 300) || null,
    });
    if (error) {
      const d = describeRpcError(error.message || '');
      return NextResponse.json({ error: d.error }, { status: d.status });
    }
    const row = (Array.isArray(data) ? data[0] : data) as { out_status: string; out_resolved_count: number } | undefined;
    return NextResponse.json({ success: true, status: row?.out_status, resolved: row?.out_resolved_count ?? 0 });
  }

  return NextResponse.json({ error: 'Action tidak valid' }, { status: 400 });
}
