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
  category: string;
  description: string;
  relations?: string[];
  n8nUrl: string;
  n8nId: string;
  toggleable: boolean;
  lockedReason?: string;
}

type SysSortKey = 'category' | 'name';
type WfStatus = { active: boolean } | { error: string };

// Urutan default kategori (dipakai saat sort by Kategori, dan sebagai
// tie-break) -- tambah nama kategori baru di sini kalau ada kategori baru
// ke depannya, urutan tetap terkontrol (bukan alfabetis acak).
const CATEGORY_ORDER = ['Global', 'BOT Channel WA', 'Chatbot WA', 'Chatbot Meta (IG)'];

// Daftar manual -- update di sini kalau ada workflow baru yang terhubung ke
// Kirana Monitor, atau ada workflow existing yang berubah fungsi.
// toggleable:false dipakai utk (a) jaring pengaman yg sengaja dikunci
// (ErrorNotifier), dan (b) sub-workflow yg cuma dipanggil via Execute
// Workflow -- toggle "active"-nya di n8n TIDAK menghentikan dia dipanggil,
// jadi tombolnya akan menyesatkan kalau ditampilkan.
const CONNECTED_SYSTEMS: ConnectedSystem[] = [
  {
    id: 'error-notifier',
    name: 'WF_ErrorNotifier',
    category: 'Global',
    description:
      'Jaring pengaman global — otomatis terpicu kalau workflow lain gagal, kirim notif error (nama workflow, node gagal, pesan error, link eksekusi) ke WA Patrik.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/UlL1qwZ3mhx07NDV',
    n8nId: 'UlL1qwZ3mhx07NDV',
    toggleable: false,
    lockedReason: 'Jaring pengaman — terkunci',
  },
  {
    id: 'sync-sheet',
    name: 'WF_Sync_Sheet_ke_Supabase',
    category: 'BOT Channel WA',
    description:
      "Sinkronisasi bulanan (tgl 5, jam 5 pagi): tarik data dari Google Sheet 'LINK CAMPAIGN CHANNEL WA', bersihkan & upsert massal ke tabel campaign_links.",
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/w1BS525iVEp6Ch3R',
    n8nId: 'w1BS525iVEp6Ch3R',
    toggleable: true,
  },
  {
    id: 'broadcast-watcher',
    name: 'WF_Broadcast_Watcher',
    category: 'BOT Channel WA',
    description:
      'Penjadwal otomatis tiap 5 menit — cek verifikasi timeout & 8 slot jadwal per hari, memicu pemilihan link baru kalau waktunya tiba.',
    relations: ['Memanggil: WF_Select_and_Verify, WF_Generate_and_Send'],
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/Xg34nPNQ5a1exVML',
    n8nId: 'Xg34nPNQ5a1exVML',
    toggleable: true,
  },
  {
    id: 'select-verify',
    name: 'WF_Select_and_Verify',
    category: 'BOT Channel WA',
    description:
      'Algoritma pemilihan 10 link produk per slot (rotasi brand & kategori L1–L3 biar variatif), kirim ke WA untuk diverifikasi (balas OK/GANTI).',
    relations: ['Dipanggil oleh: WF_Broadcast_Watcher, WF_Web_Command, WF_Command_Listener'],
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/vzBgNkpxyUPErtlo',
    n8nId: 'vzBgNkpxyUPErtlo',
    toggleable: false,
    lockedReason: 'Sub-workflow',
  },
  {
    id: 'web-command',
    name: 'WF_Web_Command',
    category: 'BOT Channel WA',
    description:
      'Endpoint kontrol broadcast dari halaman Channel WA di Kirana Monitor (action STOP/START/SEND_NOW/OK/GANTI, via shared secret).',
    relations: ['Memanggil: WF_Select_and_Verify, WF_Generate_and_Send'],
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/HrGbVvIA5RiDzHvq',
    n8nId: 'HrGbVvIA5RiDzHvq',
    toggleable: true,
  },
  {
    id: 'command-listener',
    name: 'WF_Command_Listener',
    category: 'BOT Channel WA',
    description:
      'Versi WA dari kontrol broadcast (khusus nomor Patrik) — 6 keyword: OK, GANTI, SEND NOW, STOP, START, STATUS.',
    relations: ['Memanggil: WF_Select_and_Verify, WF_Generate_and_Send'],
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/L27QQJxlaC2xwH1f',
    n8nId: 'L27QQJxlaC2xwH1f',
    toggleable: true,
  },
  {
    id: 'generate-send',
    name: 'WF_Generate_and_Send',
    category: 'BOT Channel WA',
    description:
      'Setelah link di-ACC: generate teks broadcast via AI (Sumopod), kirim ke WA Channel, update last_sent_at & channel_broadcast_log.',
    relations: ['Dipanggil oleh: WF_Broadcast_Watcher, WF_Web_Command, WF_Command_Listener'],
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/w0GOG5laec87G84T',
    n8nId: 'w0GOG5laec87G84T',
    toggleable: false,
    lockedReason: 'Sub-workflow',
  },
  {
    id: 'commandbot-wa',
    name: 'WF_CommandBot_WA_Unified',
    category: 'Chatbot WA',
    description:
      'Otak utama bot WhatsApp untuk nomor 1052 & 7484 — deteksi spam, mesin stage percakapan, eskalasi & routing staff, simpan semua log/session.',
    relations: ['Dikontrol juga oleh: WF_BotToggle_v2.0 via WA (independen dari tombol ini)'],
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/k7R1YsdYmxMvZkkJ',
    n8nId: 'k7R1YsdYmxMvZkkJ',
    toggleable: true,
  },
  {
    id: 'staffreply-handler',
    name: 'WF_StaffReply_Handler_Unified',
    category: 'Chatbot WA',
    description:
      'Interface command WA untuk staff kelola eskalasi (ketik MENU, resolve tiket) tanpa perlu buka Kirana Monitor.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/MdoDzcH0D3r8XsWb',
    n8nId: 'MdoDzcH0D3r8XsWb',
    toggleable: true,
  },
  {
    id: 'bottoggle-v2',
    name: 'WF_BotToggle_v2.0',
    category: 'Chatbot WA',
    description:
      'Command BOT_ON/BOT_OFF/BOT_STATUS via WA dari nomor authorized — aktif/nonaktifkan bot lewat n8n API, catat ke bot_toggle_logs.',
    relations: ['Mengontrol: WF_CommandBot_WA_Unified (via n8n API)'],
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/xaLrH3EDMDq9kHO7',
    n8nId: 'xaLrH3EDMDq9kHO7',
    toggleable: true,
  },
  {
    id: 'meta-bot-handler',
    name: 'Meta Bot Handler (IG+FB) v8',
    category: 'Chatbot Meta (IG)',
    description:
      'Bot Instagram DM & Facebook Messenger — versi Meta dari CommandBot, termasuk fitur follow-gate campaign di Reels (bagian deteksi komentar belum dibangun).',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/oQ9G8xozbzZp64yE',
    n8nId: 'oQ9G8xozbzZp64yE',
    toggleable: true,
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

  const [sysSortKey, setSysSortKey] = useState<SysSortKey>('category');
  const [sysSortDir, setSysSortDir] = useState<SortDir>('asc');

  // Status live per workflow n8n (id -> {active} | {error}), dan id yg lagi
  // proses toggle (buat disable tombolnya sementara).
  const [wfStatus, setWfStatus] = useState<Record<string, WfStatus>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);

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

  // Fetch status live n8n sekali saat halaman dibuka, cuma utk workflow yg toggleable
  useEffect(() => {
    const ids = CONNECTED_SYSTEMS.filter((s) => s.toggleable).map((s) => s.n8nId);
    fetch('/api/n8n/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.results) setWfStatus(data.results);
      })
      .catch(() => {
        // biarin -- badge akan nunjukin "Gagal cek" per baris
      });
  }, []);

  async function handleToggle(sys: ConnectedSystem) {
    const current = wfStatus[sys.n8nId];
    const isActive = current && 'active' in current ? current.active : false;
    const nextAction: 'activate' | 'deactivate' = isActive ? 'deactivate' : 'activate';

    if (nextAction === 'deactivate') {
      const ok = window.confirm(`Matikan ${sys.name}? Workflow ini akan berhenti jalan di n8n.`);
      if (!ok) return;
    }

    setTogglingId(sys.id);
    try {
      const res = await fetch('/api/n8n/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sys.n8nId, action: nextAction }),
      });
      const data = await res.json();
      if (res.ok) {
        setWfStatus((prev) => ({ ...prev, [sys.n8nId]: { active: data.active } }));
      } else {
        setWfStatus((prev) => ({ ...prev, [sys.n8nId]: { error: data.error || 'Gagal' } }));
      }
    } catch {
      setWfStatus((prev) => ({ ...prev, [sys.n8nId]: { error: 'Gagal konek' } }));
    } finally {
      setTogglingId(null);
    }
  }

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

  function toggleSysSort(key: SysSortKey) {
    if (sysSortKey === key) {
      setSysSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSysSortKey(key);
      setSysSortDir('asc');
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

  const sortedSystems = useMemo(() => {
    const list = [...CONNECTED_SYSTEMS];
    list.sort((a, b) => {
      let cmp = 0;
      if (sysSortKey === 'category') {
        cmp = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
      } else {
        cmp = a.name.localeCompare(b.name);
      }
      return sysSortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [sysSortKey, sysSortDir]);

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

  const SysSortArrow = ({ col }: { col: SysSortKey }) =>
    sysSortKey === col ? <span className="ml-1 text-xs">{sysSortDir === 'asc' ? '↑' : '↓'}</span> : null;

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight text-gray-900">Status Bot</h1>
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
                <p className="mt-1 text-xs italic text-gray-500">
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
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
          >
            <option value="all">Semua Status</option>
            <option value="success">Sukses</option>
            <option value="failed">Gagal</option>
          </select>

          <select
            value={String(perPage)}
            onChange={(e) => setPerPage(e.target.value === 'all' ? 'all' : (Number(e.target.value) as PerPage))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
          >
            <option value="50">50 / halaman</option>
            <option value="100">100 / halaman</option>
            <option value="all">Semua</option>
          </select>

          <button
            onClick={exportCsv}
            className="ml-auto rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ↓ Export CSV ({filtered.length})
          </button>
        </div>

        {/* Table log kill-switch */}
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

        {/* Sistem Terhubung -- tabel sortable, tinggi dibatasi (~3 baris
            kelihatan, header tetap nempel di atas, sisanya discroll).
            Kolom Status nunjukin AKTIF/NONAKTIF live dari n8n + tombol
            toggle, kecuali yg dikunci (jaring pengaman / sub-workflow). */}
        <h2 className="mb-1 mt-10 text-base font-semibold text-gray-900">Sistem Terhubung (n8n)</h2>
        <p className="mb-4 text-sm text-gray-500">
          Daftar workflow n8n yang terhubung ke Kirana Monitor. Status & tombol di bawah memanggil n8n API langsung — perubahan di sini benar-benar mematikan/menyalakan workflow-nya.
        </p>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">
                <tr>
                  <th
                    onClick={() => toggleSysSort('category')}
                    className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700"
                  >
                    Kategori <SysSortArrow col="category" />
                  </th>
                  <th
                    onClick={() => toggleSysSort('name')}
                    className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700"
                  >
                    Workflow <SysSortArrow col="name" />
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Fungsi</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedSystems.map((sys) => {
                  const st = wfStatus[sys.n8nId];
                  const isToggling = togglingId === sys.id;
                  return (
                    <tr key={sys.id}>
                      <td className="px-4 py-2 text-gray-500">{sys.category}</td>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        <a href={sys.n8nUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {sys.name}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {sys.description}
                        {sys.relations && sys.relations.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {sys.relations.map((r, i) => (
                              <p key={i} className="text-xs italic text-gray-400">
                                ↳ {r}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {!sys.toggleable ? (
                          <span className="whitespace-nowrap text-xs font-medium text-gray-400">
                            🔒 {sys.lockedReason}
                          </span>
                        ) : !st ? (
                          <span className="text-xs text-gray-400">Memuat...</span>
                        ) : 'error' in st ? (
                          <span className="text-xs text-red-500" title={st.error}>
                            ⚠️ Gagal cek
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={`whitespace-nowrap text-xs font-medium ${st.active ? 'text-green-700' : 'text-gray-400'}`}>
                              {st.active ? '🟢 Aktif' : '🔴 Nonaktif'}
                            </span>
                            <button
                              onClick={() => handleToggle(sys)}
                              disabled={isToggling}
                              className={`whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                                st.active
                                  ? 'border-red-200 text-red-600 hover:bg-red-50'
                                  : 'border-green-200 text-green-700 hover:bg-green-50'
                              }`}
                            >
                              {isToggling ? '...' : st.active ? 'Matikan' : 'Aktifkan'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
