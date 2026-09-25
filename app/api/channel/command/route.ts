import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const N8N_WEBHOOK_URL = process.env.CHANNEL_WEBHOOK_URL;
const N8N_WEBHOOK_SECRET = process.env.CHANNEL_WEBHOOK_SECRET;

const VALID_ACTIONS = ['STOP', 'START', 'SEND_NOW', 'OK', 'GANTI'] as const;
type Action = (typeof VALID_ACTIONS)[number];

export async function POST(request: NextRequest) {
  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server not configured (SERVICE_ROLE_KEY)' }, { status: 500 });
  }
  if (!N8N_WEBHOOK_URL || !N8N_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Server not configured (CHANNEL_WEBHOOK_URL/SECRET)' }, { status: 500 });
  }

  // 1. Verifikasi caller benar-benar admin (pola sama seperti create-staff)
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
    return NextResponse.json({ error: 'Cuma admin yang boleh mengontrol Channel broadcast' }, { status: 403 });
  }

  // 2. Validasi action
  const { action } = (await request.json()) as { action?: string };
  if (!action || !VALID_ACTIONS.includes(action as Action)) {
    return NextResponse.json({ error: 'Action tidak valid' }, { status: 400 });
  }

  // 3. STOP/START -- tulis langsung ke Supabase, tidak perlu lewat n8n
  if (action === 'STOP' || action === 'START') {
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error } = await adminClient
      .from('channel_broadcast_control')
      .update({
        is_active: action === 'START',
        updated_at: new Date().toISOString(),
        updated_by: `WEB_ADMIN:${userData.user.email || userData.user.id}`,
      })
      .eq('id', 1);

    if (error) {
      return NextResponse.json({ error: 'Gagal update status: ' + error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, action });
  }

  // 4. SEND_NOW / OK / GANTI -- forward ke webhook n8n (WF_Web_Command)
  try {
    const n8nRes = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Web-Command-Secret': N8N_WEBHOOK_SECRET,
      },
      body: JSON.stringify({ action }),
    });

    if (!n8nRes.ok) {
      return NextResponse.json({ error: 'n8n menolak perintah (status ' + n8nRes.status + ')' }, { status: 502 });
    }

    return NextResponse.json({ success: true, action });
  } catch (e) {
    return NextResponse.json({ error: 'Gagal menghubungi n8n: ' + (e as Error).message }, { status: 502 });
  }
}
