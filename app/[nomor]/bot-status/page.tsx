'use client';

import { useEffect, useState, useMemo, use } from 'react';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { supabase } from '@/lib/supabase';
import { Nomor, BotToggleLog } from '@/lib/types';

type StatusFilter = 'all' | 'success' | 'failed';
type PerPage = 50 | 100 | 'all';
type SortKey = 'action' | 'status' | 'created_at';
type SortDir = 'asc' | 'desc';

function BotStatusContent({ nomor }: { nomor: Nomor }) {
  const [logs, setLogs] = useState<BotToggleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [perPage, setPerPage] = useState<PerPage>(50);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    load();

    const channel = supabase
      .channel('bot_toggle_logs_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bot_toggle_logs' },
        (payload) => {
          setLogs((prev) => [payload.new as BotToggleLog, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function load() {
    const { data } = await supabase
      .from('bot_toggle_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    setLogs((data as BotToggleLog[]) || []);
    setLoading(false);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const currentStatus = logs[0]; // paling baru (sudah default sort created_at desc dari load())

  const filtered = useMemo(() => {
    let list = logs;
    if (statusFilter !== 'all') list = list.filter((l) => l.status === statusFilter);

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'created_at') {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else {
        cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    if (perPage !== 'all') list = list.slice(0, perPage);
    return list;
  }, [logs, statusFilter, perPage, sortKey, sortDir]);

  function exportCsv() {
    const header = 'Aksi,Status,Waktu,Triggered_By\n';
    const rows = filtered
      .map((l) => [l.action, l.status, l.created_at, l.triggered_by || ''].map((v) => `"${v}"`).join(','))
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot_status_log_${nomor}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const SortArrow = ({ col }: { col: SortKey }) =>
    sortKey === col ? <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span> : null;

  return (
    <div>
      <NavHeader nomor={nomor} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-4 text-lg font-medium text-gray-900">Status Bot</h1>

        {/* Status card */}
        {!loading && (
          <div
            className={`mb-6 rounded-xl border p-4 ${
              currentStatus?.action === 'ON'
                ? 'border-green-200 bg-green-50'
                : 'border-red-200 bg-red-50'
            }`}
          >
            <p className={`text-sm font-medium ${currentStatus?.action === 'ON' ? 'text-green-800' : 'text-red-800'}`}>
              {currentStatus?.action === 'ON' ? '🟢 Bot 1052 sedang AKTIF' : '🔴 Bot 1052 sedang NONAKTIF'}
            </p>
            {currentStatus && (
              <p className="mt-1 text-xs text-gray-500">
                Terakhir diubah: {new Date(currentStatus.created_at).toLocaleString('id-ID')}
              </p>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            <option value="all">Semua Status</option>
            <option value="success">Sukses</option>
            <option value="failed">Gagal</option>
          </select>

          <select
            value={String(perPage)}
            onChange={(e) => setPerPage(e.target.value === 'all' ? 'all' : (Number(e.target.value) as PerPage))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            <option value="50">50 / halaman</option>
            <option value="100">100 / halaman</option>
            <option value="all">Semua</option>
          </select>

          <button
            onClick={exportCsv}
            className="ml-auto rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            ↓ Export CSV ({filtered.length})
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada log.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th
                    onClick={() => toggleSort('action')}
                    className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700"
                  >
                    Aksi <SortArrow col="action" />
                  </th>
                  <th
                    onClick={() => toggleSort('status')}
                    className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700"
                  >
                    Status <SortArrow col="status" />
                  </th>
                  <th
                    onClick={() => toggleSort('created_at')}
                    className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700"
                  >
                    Waktu <SortArrow col="created_at" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2">
                      {log.action === 'ON' ? '🟢 ON' : '🔴 OFF'}
                    </td>
                    <td className="px-4 py-2">
                      {log.status === 'success' ? '✅ Sukses' : '❌ Gagal'}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(log.created_at).toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default function BotStatusPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  return (
    <RequireNomor>
      <BotStatusContent nomor={nomor as Nomor} />
    </RequireNomor>
  );
}
