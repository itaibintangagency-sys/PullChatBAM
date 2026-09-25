'use client';

import { useEffect, useState, useMemo } from 'react';
import { RequireAuth } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { BotToggleLog } from '@/lib/types';

type StatusFilter = 'all' | 'success' | 'failed';
type PerPage = 50 | 100 | 'all';
type SortKey = 'action' | 'status' | 'created_at';
type SortDir = 'asc' | 'desc';

interface ConnectedSystem {
  id: string;
  name: string;
  description: string;
  n8nUrl: string;
}

// Daftar manual -- update di sini kalau ada workflow baru yang terhubung ke
// Kirana Monitor. TODO: Patrik, tolong isi name & description masing-masing
// (n8n editor perlu login, jadi ga bisa dibaca otomatis dari sini).
const CONNECTED_SYSTEMS: ConnectedSystem[] = [
  {
    id: '1',
    name: 'TODO: isi nama workflow',
    description: 'TODO: isi fungsi singkat',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/k7R1YsdYmxMvZkkJ',
  },
  {
    id: '2',
    name: 'TODO: isi nama workflow',
    description: 'TODO: isi fungsi singkat',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/MdoDzcH0D3r8XsWb',
  },
  {
    id: '3',
    name: 'TODO: isi nama workflow',
    description: 'TODO: isi fungsi singkat',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/xaLrH3EDMDq9kHO7',
  },
  {
    id: '4',
    name: 'TODO: isi nama workflow',
    description: 'TODO: isi fungsi singkat',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/UlL1qwZ3mhx07NDV',
  },
  {
    id: '5',
    name: 'TODO: isi nama workflow',
    description: 'TODO: isi fungsi singkat',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/oQ9G8xozbzZp64yE',
  },
  {
    id: '6',
    name: 'TODO: isi nama workflow',
    description: 'TODO: isi fungsi singkat',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/HrGbVvIA5RiDzHvq',
  },
  {
    id: '7',
    name: 'TODO: isi nama workflow',
    description: 'TODO: isi fungsi singkat',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/w1BS525iVEp6Ch3R',
  },
  {
    id: '8',
    name: 'TODO: isi nama workflow',
    description: 'TODO: isi fungsi singkat',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/Xg34nPNQ5a1exVML',
  },
  {
    id: '9',
    name: 'TODO: isi nama workflow',
    description: 'TODO: isi fungsi singkat',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/L27QQJxlaC2xwH1f',
  },
  {
    id: '10',
    name: 'TODO: isi nama workflow',
    description: 'TODO: isi fungsi singkat',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/vzBgNkpxyUPErtlo',
  },
  {
    id: '11',
    name: 'TODO: isi nama workflow',
    description: 'TODO: isi fungsi singkat',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/w0GOG5laec87G84T',
  },
];

function BotStatusContent() {
  const { nomor } = useAuth();
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

  const currentStatus = logs[0];

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

  // Ringkasan cepat: berapa kali ON/OFF gagal dalam 24 jam terakhir -- sinyal kesehatan
  const last24hFailed = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return logs.filter((l) => l.status === 'failed' && new Date(l.created_at).getTime() > cutoff).length;
  }, [logs]);

  function exportCsv() {
    const header = 'Aksi,Status,Waktu,Triggered_By\n';
    const rows = filtered
      .map((l) => [l.action, l.status, l.created_at, l.triggered_by || ''].map((v) => `"${v}"`).join(','))
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot_status_log.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const SortArrow = ({ col }: { col: SortKey }) =>
    sortKey === col ? <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span> : null;

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Status Bot</h1>
        <p className="mb-6 text-sm text-gray-500">
          Berlaku untuk kedua nomor bot (7484 &amp; 1052) — kill-switch-nya sudah disatukan.
        </p>

        {/* Kartu status utama */}
        {!loading && (
          <div
            className={`mb-4 flex items-center justify-between rounded-2xl border p-6 ${
              currentStatus?.action === 'ON'
                ? 'border-green-200 bg-green-50'
                : 'border-red-200 bg-red-50'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${currentStatus?.action === 'ON' ? 'bg-green-500' : 'bg-red-500'}`} />
                <p className={`text-base font-semibold ${currentStatus?.action === 'ON' ? 'text-green-800' : 'text-red-800'}`}>
                  {currentStatus?.action === 'ON' ? 'Bot sedang AKTIF' : 'Bot sedang NONAKTIF'}
                </p>
              </div>
              {currentStatus && (
                <p className="mt-1 text-xs text-gray-500">
                  Terakhir diubah {new Date(currentStatus.created_at).toLocaleString('id-ID')}
                  {currentStatus.triggered_by ? ` oleh ${currentStatus.triggered_by}` : ''}
                </p>
              )}
            </div>
            {last24hFailed > 0 && (
              <div className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800">
                ⚠️ {last24hFailed} percobaan gagal dalam 24 jam terakhir
              </div>
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
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2">{log.action === 'ON' ? '🟢 ON' : '🔴 OFF'}</td>
                    <td className="px-4 py-2">{log.status === 'success' ? '✅ Sukses' : '❌ Gagal'}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(log.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{log.triggered_by || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sistem Terhubung -- daftar workflow n8n yang menopang Kirana Monitor */}
        <h2 className="mb-1 mt-10 text-base font-medium text-gray-900">Sistem Terhubung (n8n)</h2>
        <p className="mb-4 text-sm text-gray-500">
          Daftar workflow n8n yang terhubung ke Kirana Monitor. Daftar ini dikelola manual — update langsung di kode kalau ada workflow baru atau ada yang berubah fungsi.
        </p>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {CONNECTED_SYSTEMS.map((sys) => (
            <div key={sys.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{sys.name}</p>
                <p className="truncate text-sm text-gray-500">{sys.description}</p>
              </div>
              <a
                href={sys.n8nUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm text-gray-400 hover:text-gray-700"
              >
                Buka di n8n ↗
              </a>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function BotStatusPage() {
  return (
    <RequireAuth>
      <BotStatusContent />
    </RequireAuth>
  );
}
