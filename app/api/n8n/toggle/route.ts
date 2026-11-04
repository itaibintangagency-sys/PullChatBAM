import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateStaff } from '@/lib/apiAuth';

const N8N_BASE_URL = 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Catat setiap percobaan ON/OFF ke bot_toggle_logs supaya muncul di riwayat workflow. Gagal mencatat tidak membatalkan toggle.
async function logToggle(entry: {
  action: 'ON' | 'OFF';
  status: 'success' | 'failed';
  triggeredBy: string;
  workflowId: string;
  workflowName: string | null;
  apiResponse: string;
}) {
  if (!SERVICE_ROLE_KEY) return;
  try {
    await createClient(SUPABASE_URL, SERVICE_ROLE_KEY).from('bot_toggle_logs').insert({
      action: entry.action,
      status: entry.status,
      triggered_by: entry.triggeredBy,
      workflow_id: entry.workflowId,
      workflow_name: entry.workflowName,
      api_response: entry.apiResponse.slice(0, 500),
    });
  } catch {
    // riwayat tidak boleh menghalangi toggle
  }
}

export async function POST(req: NextRequest) {
  const caller = await authenticateStaff(req);
  if (caller instanceof NextResponse) return caller;
  if (caller.role !== 'admin') {
    return NextResponse.json({ error: 'Hanya Super Admin yang boleh menyalakan atau mematikan workflow' }, { status: 403 });
  }

  const apiKey = process.env.N8N_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'N8N_API_KEY belum diset di environment Vercel' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const id: string = body?.id;
  const action: string = body?.action;
  const name: string | null = typeof body?.name === 'string' ? body.name.slice(0, 120) : null;

  if (!/^[A-Za-z0-9]{8,32}$/.test(String(id || '')) || (action !== 'activate' && action !== 'deactivate')) {
    return NextResponse.json({ error: 'Parameter tidak valid' }, { status: 400 });
  }
  const logAction = action === 'activate' ? 'ON' : 'OFF';
  const triggeredBy = `WEB:${caller.displayName}`;

  try {
    const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${id}/${action}`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': apiKey },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      await logToggle({ action: logAction, status: 'failed', triggeredBy, workflowId: id, workflowName: name, apiResponse: `HTTP ${res.status}: ${text}` });
      return NextResponse.json(
        { error: `n8n menolak (HTTP ${res.status}): ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    await logToggle({ action: logAction, status: 'success', triggeredBy, workflowId: id, workflowName: name, apiResponse: `active=${Boolean(data.active)}` });
    return NextResponse.json({ active: Boolean(data.active) });
  } catch {
    await logToggle({ action: logAction, status: 'failed', triggeredBy, workflowId: id, workflowName: name, apiResponse: 'Gagal konek ke n8n' });
    return NextResponse.json({ error: 'Gagal konek ke n8n' }, { status: 502 });
  }
}
