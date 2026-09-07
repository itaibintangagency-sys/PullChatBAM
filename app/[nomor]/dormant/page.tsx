'use client';

import { useEffect, useState, use } from 'react';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { supabase } from '@/lib/supabase';
import { Nomor, DormantEntry } from '@/lib/types';

function timeSince(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 1) return 'baru saja';
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

function sourceBadge(source: string) {
  if (source === 'HANDOFF') return { label: 'Handoff staff', cls: 'bg-blue-100 text-blue-700' };
  if (source === 'BUNTU_9X') return { label: '9× salah pilih', cls: 'bg-orange-100 text-orange-700' };
  return { label: source, cls: 'bg-gray-100 text-gray-600' };
}

function DormantContent({ nomor }: { nomor: Nomor }) {
  const [items, setItems] = useState<DormantEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    load();

    const channel = supabase
      .channel('dormant_realtime_' + nomor)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dormant_tracking', filter: `bot_source=eq.${nomor}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [nomor]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('dormant_tracking')
      .select('*')
      .eq('bot_source', nomor)
      .order('logged_at', { ascending: true }); // paling lama nunggu di atas
    setItems((data as DormantEntry[]) || []);
    setLoading(false);
  }

  async function handleResolve(item: DormantEntry) {
    setResolvingId(item.id);
    setError('');

    const { error: rpcError } = await supabase.rpc('resolve_dormant', {
      p_dormant_id: item.id,
      p_nomor_wa: item.nomor_wa,
      p_bot_source: item.bot_source,
    });

    setResolvingId(null);
    if (rpcError) {
      setError(`Gagal resolve ${item.nomor_wa}: ${rpcError.message}`);
      return;
    }
    load();
  }

  const filtered = items.filter((i) => (showResolved ? true : i.status === 'PENDING'));
  const pendingCount = items.filter((i) => i.status === 'PENDING').length;

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4">
          <h1 className="text-lg font-medium text-gray-900">Dormant</h1>
          <p className="text-sm text-gray-500">
            {pendingCount > 0
              ? `${pendingCount} customer sedang didiamkan bot, menunggu ditangani`
              : 'Tidak ada customer yang didiamkan bot saat ini ✅'}
          </p>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => setShowResolved(false)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              !showResolved ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Belum ditangani
          </button>
          <button
            onClick={() => setShowResolved(true)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              showResolved ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Semua (termasuk sudah selesai)
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada data.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {filtered.map((item) => {
              const badge = sourceBadge(item.source);
              const resolving = resolvingId === item.id;

              return (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{item.nomor_wa}</p>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                      {item.status === 'RESOLVED' && (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">Selesai</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {item.ticket_id ? `Tiket ${item.ticket_id} · ` : ''}
                      Sejak {timeSince(item.logged_at)}
                      {item.fu_count > 0 ? ` · ${item.fu_count}× diingatkan` : ''}
                    </p>
                  </div>

                  {item.status === 'PENDING' && (
                    <button
                      onClick={() => handleResolve(item)}
                      disabled={resolving}
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {resolving ? 'Memproses...' : 'Resolve'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function DormantPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  return (
    <RequireNomor>
      <DormantContent nomor={nomor as Nomor} />
    </RequireNomor>
  );
}
