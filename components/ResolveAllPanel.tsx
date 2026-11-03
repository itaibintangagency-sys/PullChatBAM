'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Nomor, ResolveRequest } from '@/lib/types';

// Staf biasa: panel untuk alias miliknya sendiri. Admin: bisa memilih alias staf mana pun yang masih punya tiket terbuka.
// Tiket tidak langsung di-resolve: permintaan harus disetujui penyetuju (l0_config.is_resolve_approver), lewat WA atau lewat web
// bila akun web ini ditautkan ke penyetuju (alias akun sama dengan alias penyetuju).
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Menunggu persetujuan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  EXPIRED: 'Kedaluwarsa',
};
const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
};

export function ResolveAllPanel({ nomor, onChanged }: { nomor: Nomor; onChanged?: () => void }) {
  const { profile, session } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const ownAlias = profile?.escalation_alias ? profile.escalation_alias.toUpperCase() : null;

  const [requests, setRequests] = useState<ResolveRequest[]>([]);
  const [openByAlias, setOpenByAlias] = useState<Record<string, number>>({});
  const [canApprove, setCanApprove] = useState(false);
  const [now, setNow] = useState(0);
  const [alias, setAlias] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const token = session?.access_token;

  const load = useCallback(async () => {
    const [reqRes, escRes] = await Promise.all([
      supabase
        .from('resolve_requests')
        .select('*')
        .eq('bot_source', nomor)
        .order('requested_at', { ascending: false })
        .limit(10),
      supabase.from('escalations').select('assigned_to').eq('bot_source', nomor).eq('status', 'OPEN'),
    ]);
    setNow(Date.now());
    setRequests((reqRes.data as ResolveRequest[]) || []);
    const counts: Record<string, number> = {};
    (escRes.data || []).forEach((r: { assigned_to: string | null }) => {
      String(r.assigned_to || '')
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
        .forEach((t) => {
          counts[t] = (counts[t] || 0) + 1;
        });
    });
    setOpenByAlias(counts);
  }, [nomor]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/resolve-all', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { canApprove: false }))
      .then((j) => setCanApprove(!!j.canApprove))
      .catch(() => setCanApprove(false));
  }, [token]);

  const aliasOptions = useMemo(
    () => Object.keys(openByAlias).sort((a, b) => openByAlias[b] - openByAlias[a] || a.localeCompare(b)),
    [openByAlias]
  );
  const targetAlias = isAdmin ? alias || aliasOptions[0] || '' : ownAlias || '';
  const targetOpen = targetAlias ? openByAlias[targetAlias] || 0 : 0;
  const pendingForTarget = requests.some((r) => r.status === 'PENDING' && r.requested_by_alias === targetAlias);

  async function call(body: Record<string, unknown>) {
    if (!token) return null;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/resolve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ tone: 'err', text: json.error || 'Gagal memproses.' });
        return null;
      }
      return json as Record<string, unknown>;
    } catch {
      setMessage({ tone: 'err', text: 'Gagal menghubungi server.' });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitRequest() {
    if (!targetAlias) return;
    if (!window.confirm(`Ajukan RESOLVE ALL untuk ${targetOpen} tiket OPEN milik ${targetAlias}? Tiket baru berubah setelah disetujui penyetuju.`)) return;
    const json = await call({ action: 'create', bot_source: nomor, alias: targetAlias, note });
    if (!json) return;
    setNote('');
    setMessage({
      tone: 'ok',
      text: json.notified
        ? `Permintaan diajukan (${json.ticket_count} tiket). Penyetuju sudah diberi tahu lewat WhatsApp.`
        : `Permintaan diajukan (${json.ticket_count} tiket), tetapi pemberitahuan WhatsApp ke penyetuju gagal terkirim. Minta penyetuju cek di sini.`,
    });
    await load();
    onChanged?.();
  }

  async function decide(r: ResolveRequest, approve: boolean) {
    const verb = approve ? 'SETUJUI' : 'TOLAK';
    if (!window.confirm(`${verb} RESOLVE ALL milik ${r.requested_by_alias} (${r.ticket_count} tiket)?`)) return;
    const json = await call({ action: 'decide', request_id: r.id, approve });
    if (!json) return;
    setMessage({
      tone: 'ok',
      text: approve ? `Disetujui: ${json.resolved} tiket sekarang RESOLVE.` : 'Permintaan ditolak. Tiket tetap OPEN.',
    });
    await load();
    onChanged?.();
  }

  const visible = requests.filter((r) => r.status === 'PENDING' || now - new Date(r.requested_at).getTime() < 7 * 86400000);
  const canRequest = isAdmin ? aliasOptions.length > 0 : !!ownAlias && targetOpen > 0;

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">RESOLVE ALL (perlu persetujuan)</p>
        <span className="text-xs text-gray-400">Berlaku 24 jam. Tiket baru RESOLVE setelah disetujui.</span>
      </div>

      {canRequest ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <select
              aria-label="Pilih staf"
              value={targetAlias}
              onChange={(e) => setAlias(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            >
              {aliasOptions.map((a) => (
                <option key={a} value={a}>
                  {a} ({openByAlias[a]} terbuka)
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-600">{targetOpen} tiket kamu terbuka</span>
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Catatan penyelesaian (opsional)"
            className="min-w-48 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={submitRequest}
            disabled={busy || pendingForTarget}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
            title={pendingForTarget ? 'Masih ada permintaan yang menunggu' : undefined}
          >
            {busy ? 'Memproses...' : 'Ajukan RESOLVE ALL'}
          </button>
        </div>
      ) : (
        <p className="mb-3 text-sm text-gray-400">
          {!isAdmin && !ownAlias ? 'Akunmu belum punya alias eskalasi.' : 'Tidak ada tiket terbuka untuk diajukan.'}
        </p>
      )}

      {message && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}

      {visible.length > 0 && (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {visible.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="font-medium text-gray-800">{r.requested_by_alias}</span>
              <span className="text-gray-500">
                {r.status === 'APPROVED' ? `${r.resolved_count ?? 0} tiket` : `${r.ticket_count} tiket`}
              </span>
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[r.status] || 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABEL[r.status] || r.status}
              </span>
              <span className="text-xs text-gray-400">
                {format(new Date(r.requested_at), 'dd/MM HH:mm')} · {r.requested_via === 'WEB' ? 'web' : 'WA'} · kode {r.id.slice(0, 8)}
              </span>
              {r.status === 'PENDING' && canApprove && new Date(r.expires_at).getTime() > now && (
                <span className="ml-auto flex gap-2">
                  <button
                    onClick={() => decide(r, true)}
                    disabled={busy}
                    className="rounded-lg bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Setujui
                  </button>
                  <button
                    onClick={() => decide(r, false)}
                    disabled={busy}
                    className="rounded-lg border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Tolak
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
