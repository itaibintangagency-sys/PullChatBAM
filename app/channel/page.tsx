'use client';

import { useEffect, useState, useCallback } from 'react';
import { RequireAdmin } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

// ============================================================
// Tipe data -- khusus halaman ini (belum ditambah ke lib/types.ts
// supaya perubahan tetap terfokus di 1 file dulu)
// ============================================================
interface ChannelControl {
  id: number;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
}

interface VerificationItem {
  id: number;
  slot_time: string;
  trigger_source: string;
  attempt_number: number;
  link_ids: string[];
  status: string;
  created_at: string;
}

interface CampaignLinkMini {
  id_produk: string;
  nama_produk: string;
  nama_toko: string;
  harga_produk: string | null;
  komisi_affiliate: number | null;
}

interface BroadcastLogItem {
  id: number;
  broadcast_at: string;
  generated_text: string;
  link_ids: string[];
  brand_list: string[];
  sent_via: string;
  view_count: number | null;
  reactions: Record<string, number> | null;
}

interface BrandStalenessItem {
  nama_toko: string;
  last_sent_at: string | null;
  total_produk: number;
  belum_pernah_terkirim: number;
}

type CommandAction = 'STOP' | 'START' | 'SEND_NOW' | 'OK' | 'GANTI';

function ChannelContent() {
  const { nomor, session } = useAuth();

  const [control, setControl] = useState<ChannelControl | null>(null);
  const [pending, setPending] = useState<VerificationItem | null>(null);
  const [pendingProducts, setPendingProducts] = useState<CampaignLinkMini[]>([]);
  const [logs, setLogs] = useState<BroadcastLogItem[]>([]);
  const [brandList, setBrandList] = useState<BrandStalenessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<CommandAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadAll = useCallback(async () => {
    const [controlRes, pendingRes, logsRes, brandRes] = await Promise.all([
      supabase.from('channel_broadcast_control').select('*').eq('id', 1).single(),
      supabase
        .from('broadcast_verification')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('channel_broadcast_log')
        .select('*')
        .order('broadcast_at', { ascending: false })
        .limit(30),
      supabase
        .from('brand_staleness')
        .select('*')
        .order('last_sent_at', { ascending: true, nullsFirst: true })
        .limit(15),
    ]);

    if (controlRes.data) setControl(controlRes.data as ChannelControl);
    setLogs((logsRes.data as BroadcastLogItem[]) || []);
    setBrandList((brandRes.data as BrandStalenessItem[]) || []);

    if (pendingRes.data) {
      const verif = pendingRes.data as VerificationItem;
      setPending(verif);
      const { data: prodData } = await supabase
        .from('campaign_links')
        .select('id_produk, nama_produk, nama_toko, harga_produk, komisi_affiliate')
        .in('id_produk', verif.link_ids || []);
      setPendingProducts((prodData as CampaignLinkMini[]) || []);
    } else {
      setPending(null);
      setPendingProducts([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();

    const ch = supabase
      .channel('channel_dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_broadcast_control' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcast_verification' }, () => loadAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_broadcast_log' }, () => loadAll())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadAll]);

  async function runCommand(action: CommandAction) {
    if (!session) return;
    setActionLoading(action);
    setActionError(null);
    try {
      const res = await fetch('/api/channel/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || 'Gagal menjalankan perintah');
      } else {
        // Beri jeda sebentar sebelum refresh -- proses background di n8n
        // butuh waktu utk mulai menulis ke Supabase
        setTimeout(loadAll, 1500);
      }
    } catch (e) {
      setActionError('Gagal menghubungi server: ' + (e as Error).message);
    } finally {
      setActionLoading(null);
    }
      async function clearHistory() {
    if (!session) return;
    if (!confirm('Hapus SEMUA history broadcast? Tindakan ini tidak bisa dibatalkan.')) return;
    setClearing(true);
    setActionError(null);
    try {
      const res = await fetch('/api/channel/clear-history', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || 'Gagal menghapus history');
      } else {
        setLogs([]);
      }
    } catch (e) {
      setActionError('Gagal menghubungi server: ' + (e as Error).message);
    } finally {
      setClearing(false);
    }
  }
  }

  function formatReactions(r: Record<string, number> | null) {
    if (!r) return '';
    return Object.entries(r).map(([emoji, count]) => `${emoji}${count}`).join(' ');
  }

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Channel WA — Bintang Agency</h1>
        <p className="mb-6 text-sm text-gray-500">Link Cuan MCN — kontrol broadcast otomatis</p>

        {actionError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : (
          <>
            {/* ===== Bagian 1: Status ===== */}
            <div
              className={`mb-4 flex items-center justify-between rounded-2xl border p-6 ${
                control?.is_active ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${control?.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                  <p className={`text-base font-semibold ${control?.is_active ? 'text-green-800' : 'text-red-800'}`}>
                    {control?.is_active ? 'Broadcast otomatis AKTIF' : 'Broadcast otomatis DIHENTIKAN'}
                  </p>
                </div>
                {control?.updated_at && (
                  <p className="mt-1 text-xs text-gray-500">
                    Terakhir diubah {new Date(control.updated_at).toLocaleString('id-ID')}
                    {control.updated_by ? ` oleh ${control.updated_by}` : ''}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => runCommand('STOP')}
                  disabled={!control?.is_active || actionLoading !== null}
                  className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  {actionLoading === 'STOP' ? '...' : 'STOP'}
                </button>
                <button
                  onClick={() => runCommand('START')}
                  disabled={control?.is_active !== false || actionLoading !== null}
                  className="rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-40"
                >
                  {actionLoading === 'START' ? '...' : 'START'}
                </button>
                <button
                  onClick={() => runCommand('SEND_NOW')}
                  disabled={control?.is_active === false || actionLoading !== null}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
                >
                  {actionLoading === 'SEND_NOW' ? 'Memproses...' : '🚀 SEND NOW'}
                </button>
              </div>
            </div>

            {/* ===== Bagian 2: Verifikasi Pending ===== */}
            {pending && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="mb-3 text-sm font-semibold text-amber-800">
                  📋 Menunggu verifikasi — {pendingProducts.length} link
                  {pending.attempt_number > 1 ? ` (percobaan ke-${pending.attempt_number})` : ''}
                </p>
                <div className="mb-3 space-y-2">
                  {pendingProducts.map((p, i) => (
                    <div key={p.id_produk} className="rounded-lg bg-white px-3 py-2 text-xs">
                      <span className="font-medium text-gray-800">
                        {i + 1}. [{p.nama_toko}] {p.nama_produk}
                      </span>
                      <span className="ml-2 text-gray-500">
                        {p.harga_produk} · Komisi {p.komisi_affiliate ?? '-'}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => runCommand('OK')}
                    disabled={actionLoading !== null}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
                  >
                    {actionLoading === 'OK' ? 'Memproses...' : '✅ OK — Kirim Sekarang'}
                  </button>
                  <button
                    onClick={() => runCommand('GANTI')}
                    disabled={actionLoading !== null}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    {actionLoading === 'GANTI' ? 'Memproses...' : '🔁 GANTI — Ambil Link Lain'}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              {/* ===== Bagian 3: Feed Histori Broadcast ===== */}
              <div className="col-span-2">                
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700">Histori Broadcast</h2>
                  {logs.length > 0 && (
                    <button
                      onClick={clearHistory}
                      disabled={clearing}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                    >
                      {clearing ? 'Menghapus...' : '🗑️ Hapus History'}
                    </button>
                  )}
                </div>
                {logs.length === 0 ? (
                  <p className="text-sm text-gray-400">Belum ada broadcast tercatat.</p>
                ) : (
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <div key={log.id} className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500">
                            {new Date(log.broadcast_at).toLocaleString('id-ID')}
                          </span>
                          {log.sent_via === 'TIMEOUT_AUTO_SENT' && (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                              ⚠️ auto-kirim (timeout)
                            </span>
                          )}
                        </div>
                        <p className="mb-2 text-xs text-gray-600">
                          Brand: {log.brand_list?.join(', ')} · {log.link_ids?.length || 0} link
                        </p>
                        <p className="mb-2 line-clamp-3 whitespace-pre-line text-xs text-gray-800">
                          {log.generated_text}
                        </p>
                        <p className="text-xs text-gray-500">
                          👁 {log.view_count ?? '-'} views
                          {log.reactions && Object.keys(log.reactions).length > 0
                            ? ` · ${formatReactions(log.reactions)}`
                            : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ===== Bagian 4: Rotasi Brand ===== */}
              <div>
                <h2 className="mb-2 text-sm font-semibold text-gray-700">Rotasi Brand</h2>
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <p className="mb-2 text-[11px] text-gray-400">Paling lama belum di-BC duluan</p>
                  <div className="space-y-1.5">
                    {brandList.map((b) => (
                      <div key={b.nama_toko} className="flex items-center justify-between text-xs">
                        <span className="truncate text-gray-700" title={b.nama_toko}>
                          {b.nama_toko}
                        </span>
                        <span className="ml-2 shrink-0 text-gray-400">
                          {b.last_sent_at ? new Date(b.last_sent_at).toLocaleDateString('id-ID') : 'belum pernah'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function ChannelPage() {
  return (
    <RequireAdmin>
      <ChannelContent />
    </RequireAdmin>
  );
}
