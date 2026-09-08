'use client';

import { useEffect, useState, useMemo, use } from 'react';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Nomor, Escalation } from '@/lib/types';
import { SkeletonRow } from '@/components/Skeleton';

type StatusFilter = 'OPEN' | 'RESOLVED' | 'all';
type PriorityFilter = 'all' | 'HIGH' | 'MEDIUM' | 'LOW';

function timeSince(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 1) return 'baru saja';
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

function priorityBadge(p: string | null) {
  const map: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-700',
    MEDIUM: 'bg-amber-100 text-amber-700',
    LOW: 'bg-gray-100 text-gray-600',
  };
  return map[p || ''] || 'bg-gray-100 text-gray-500';
}

// assigned_to bisa berisi 1 nama ("RIZKI") atau beberapa dipisah koma
// ("RINTAN, RINTAN2") untuk tiket dual-staff. Pencocokan PERSIS per-kata,
// bukan "mengandung teks" -- supaya alias "RINTAN" tidak ikut kecantol
// tiket yang assigned_to-nya "RINTAN2" (beda orang).
function isAssignedToAlias(assignedTo: string | null, alias: string | null): boolean {
  if (!alias || !assignedTo) return false;
  const tokens = assignedTo.split(',').map((t) => t.trim());
  return tokens.includes(alias);
}

function EscalationsContent({ nomor }: { nomor: Nomor }) {
  const { profile } = useAuth();
  const [items, setItems] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<'mine' | 'all'>('mine');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const hasAlias = !!profile?.escalation_alias;

  useEffect(() => {
    load();

    const channel = supabase
      .channel('escalations_realtime_' + nomor)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'escalations', filter: `bot_source=eq.${nomor}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomor]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('escalations')
      .select('*')
      .eq('bot_source', nomor)
      .order('created_at', { ascending: false });
    setItems((data as Escalation[]) || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = items;

    // Filter cakupan: staff (non-admin) defaultnya cuma lihat tiket miliknya
    // sendiri, kecuali sengaja pilih "Semua". Admin selalu lihat semua,
    // tombol toggle ini tidak muncul buat admin.
    if (!isAdmin && scopeFilter === 'mine') {
      list = list.filter((i) => isAssignedToAlias(i.assigned_to, profile?.escalation_alias || null));
    }

    if (statusFilter !== 'all') list = list.filter((i) => i.status === statusFilter);
    if (priorityFilter !== 'all') list = list.filter((i) => i.priority === priorityFilter);

    const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return [...list].sort((a, b) => {
      const pa = priorityOrder[a.priority || ''] ?? 3;
      const pb = priorityOrder[b.priority || ''] ?? 3;
      if (pa !== pb) return pa - pb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [items, statusFilter, priorityFilter, scopeFilter, isAdmin, profile?.escalation_alias]);

  const myOpenCount = useMemo(
    () =>
      items.filter(
        (i) => i.status === 'OPEN' && isAssignedToAlias(i.assigned_to, profile?.escalation_alias || null)
      ).length,
    [items, profile?.escalation_alias]
  );
  const openCount = items.filter((i) => i.status === 'OPEN').length;

  function startResolve(id: string) {
    setResolvingId(id);
    setResolutionText('');
    setError('');
  }

  async function submitResolve(item: Escalation) {
    if (!resolutionText.trim()) {
      setError('Isi catatan penyelesaian dulu.');
      return;
    }
    setSaving(true);
    setError('');

    const resolvedAt = new Date();
    const createdAt = new Date(item.created_at);
    const diffHours = Math.round((resolvedAt.getTime() - createdAt.getTime()) / 3600000);

    const { error: updateError } = await supabase
      .from('escalations')
      .update({
        status: 'RESOLVED',
        resolution: resolutionText.trim(),
        resolved_at: resolvedAt.toISOString(),
        resolution_time: `${diffHours} hours`,
      })
      .eq('id', item.id);

    setSaving(false);
    if (updateError) {
      setError('Gagal menyimpan. Coba lagi.');
      return;
    }
    setResolvingId(null);
    load();
  }

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium text-gray-900">Eskalasi</h1>
            <p className="text-sm text-gray-500">
              {!isAdmin && scopeFilter === 'mine'
                ? myOpenCount > 0
                  ? `${myOpenCount} tiket kamu masih terbuka`
                  : 'Semua tiket kamu sudah ditangani ✅'
                : openCount > 0
                ? `${openCount} tiket masih terbuka`
                : 'Semua tiket sudah ditangani ✅'}
            </p>
          </div>
        </div>

        {!isAdmin && !hasAlias && (
          <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Akun kamu belum punya alias eskalasi -- minta Super Admin isi lewat halaman
            Kelola Staff supaya tiket kamu bisa terfilter otomatis di sini.
          </div>
        )}

        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {!isAdmin && (
            <>
              <button
                onClick={() => setScopeFilter('mine')}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  scopeFilter === 'mine' ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Tiket Saya
              </button>
              <button
                onClick={() => setScopeFilter('all')}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  scopeFilter === 'all' ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Semua
              </button>
              <span className="mx-1 text-gray-300">|</span>
            </>
          )}
          {(['OPEN', 'RESOLVED', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                statusFilter === s ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'OPEN' ? 'Terbuka' : s === 'RESOLVED' ? 'Selesai' : 'Semua'}
            </button>
          ))}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
            className="ml-auto rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            <option value="all">Semua prioritas</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            <div className="rounded-xl border border-gray-200 bg-white"><SkeletonRow /></div>
            <div className="rounded-xl border border-gray-200 bg-white"><SkeletonRow /></div>
            <div className="rounded-xl border border-gray-200 bg-white"><SkeletonRow /></div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada tiket di filter ini.</p>
        ) : (
          <div className="animate-in fade-in space-y-2 duration-300">
            {filtered.map((item) => {
              const expanded = expandedId === item.id;
              const resolving = resolvingId === item.id;

              return (
                <div key={item.id} className="rounded-xl border border-gray-200 bg-white">
                  <button
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${priorityBadge(item.priority)}`}>
                        {item.priority || '-'}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.nama || item.nomor_wa}</p>
                        <p className="text-xs text-gray-400">
                          {item.category} {item.sub_category ? `· ${item.sub_category}` : ''} · {timeSince(item.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>{item.assigned_to || 'Belum ditugaskan'}</span>
                      {item.status === 'RESOLVED' && (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">Selesai</span>
                      )}
                    </div>
                  </button>

                  {expanded && (
                    <div className="animate-in fade-in border-t border-gray-100 px-4 py-3 text-sm duration-200">
                      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-gray-400">Tiket</dt>
                          <dd className="text-gray-700">{item.ticket_id}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-400">Nomor WA</dt>
                          <dd className="text-gray-700">{item.nomor_wa}</dd>
                        </div>
                        {item.store_link && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-gray-400">Screenshot</dt>
                            <dd>
                              <a href={item.store_link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                                Buka link
                              </a>
                            </dd>
                          </div>
                        )}
                        {(item.customer_issue || item.data_notes) && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-gray-400">Catatan</dt>
                            <dd className="text-gray-700">{item.customer_issue || item.data_notes}</dd>
                          </div>
                        )}
                        {item.status === 'RESOLVED' && (
                          <div className="sm:col-span-2 rounded-lg bg-green-50 p-2">
                            <dt className="text-xs text-green-700">Penyelesaian ({item.resolution_time})</dt>
                            <dd className="text-green-800">{item.resolution}</dd>
                          </div>
                        )}
                      </dl>

                      {item.status === 'OPEN' && (
                        <div className="mt-3">
                          {!resolving ? (
                            <button
                              onClick={() => startResolve(item.id)}
                              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                            >
                              Tandai selesai
                            </button>
                          ) : (
                            <div className="animate-in fade-in space-y-2 duration-200">
                              <textarea
                                value={resolutionText}
                                onChange={(e) => setResolutionText(e.target.value)}
                                placeholder="Apa yang dilakukan untuk menyelesaikan tiket ini?"
                                rows={2}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                              />
                              {error && <p className="text-sm text-red-600">{error}</p>}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => submitResolve(item)}
                                  disabled={saving}
                                  className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                                >
                                  {saving ? 'Menyimpan...' : 'Simpan'}
                                </button>
                                <button
                                  onClick={() => setResolvingId(null)}
                                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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

export default function EscalationsPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  return (
    <RequireNomor>
      <EscalationsContent nomor={nomor as Nomor} />
    </RequireNomor>
  );
}
