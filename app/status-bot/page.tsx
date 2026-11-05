'use client';

import { Fragment, useEffect, useState, useMemo } from 'react';
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
const CATEGORY_ORDER = ['Global', 'BOT Channel WA', 'Chatbot WA', 'Chatbot Meta (IG/FB)', 'Pendukung Chat Log', 'Pelaporan'];

// Daftar manual -- update di sini kalau ada workflow baru yang terhubung ke
// Kirana Monitor, atau ada workflow existing yang berubah fungsi.
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
      "Menarik data Google Sheet 'LINK CAMPAIGN CHANNEL WA' (hasil filter), membersihkan & upsert massal ke tabel campaign_links. Berjalan setelah verifikator membalas TRUE; ringkasannya dikirim ke semua verifikator Channel.",
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
      'Memilih produk untuk slot broadcast (minimal 3 dari 4 kondisi: kadaluarsa, komisi MCN, komisi affiliate, cooldown), mencatat ke broadcast_verification, lalu memanggil WF_Generate_and_Send. Slot kosong diberitahukan ke verifikator Channel.',
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
      'Versi WA dari kontrol broadcast untuk pemegang flag is_channel_verifier di l0_config — keyword OK, GANTI, SEND NOW, STOP, START, STATUS, serta TRUE/FALSE untuk hasil filter sheet.',
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
    name: 'WF Command United updated 13okt',
    category: 'Chatbot WA',
    description:
      'Otak utama bot WhatsApp untuk nomor 1052 & 7484 (workflow "WF_CommandBot_WA_Unified" di dokumentasi lama) — deteksi spam & blacklist, mesin stage percakapan, eskalasi & routing staff, simpan semua log/session.',
    relations: ['Dikontrol dari tombol di halaman ini (hanya Super Admin)', 'Memanggil: BAM - Blacklist Cleared Welcome (saat nomor dinyatakan bukan spam lewat WA)'],
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/k7R1YsdYmxMvZkkJ',
    n8nId: 'k7R1YsdYmxMvZkkJ',
    toggleable: true,
  },
  {
    id: 'staffreply-handler',
    name: 'WF_StaffReply_Handler_Unified',
    category: 'Chatbot WA',
    description:
      'Interface command WA untuk staff kelola eskalasi tanpa perlu buka Kirana Monitor: MENU, RESOLVE, RESOLVE ALL, dan SETUJU/TOLAK dari penyetuju.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/MdoDzcH0D3r8XsWb',
    n8nId: 'MdoDzcH0D3r8XsWb',
    toggleable: true,
  },
  {
    id: 'bottoggle-v2',
    name: 'WF_BotToggle_v2.0',
    category: 'Chatbot WA',
    description:
      'Dinonaktifkan sengaja (5 Nov 2026): perintah BOT_ON/BOT_OFF/BOT_STATUS via WA tidak dipakai lagi. Bot dinyalakan atau dimatikan hanya lewat tombol di halaman ini. Jangan dinyalakan lagi kecuali perlu kembali ke kontrol via WA.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/xaLrH3EDMDq9kHO7',
    n8nId: 'xaLrH3EDMDq9kHO7',
    toggleable: true,
  },
  {
    id: 'meta-bot-handler',
    name: 'Meta Bot Handler (IG+FB) v8',
    category: 'Chatbot Meta (IG/FB)',
    description:
      'Bot Instagram DM & Facebook Messenger — versi Meta dari CommandBot, termasuk fitur follow-gate campaign di Reels (bagian deteksi komentar belum dibangun).',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/oQ9G8xozbzZp64yE',
    n8nId: 'oQ9G8xozbzZp64yE',
    toggleable: true,
  },
  {
    id: 'filter-sheet',
    name: 'WF_Filter_Sheet_UNFILTERED_ke_RESULT_FULL v4',
    category: 'BOT Channel WA',
    description:
      'Terjadwal tiap Selasa 16:00 WIB — menyaring sheet UNFILTERED ke RESULT_FULL dan mengirim proposal ke verifikator Channel. Hasil baru berlaku setelah dibalas TRUE.',
    relations: ['Berlanjut ke: WF_Sync_Sheet_ke_Supabase setelah TRUE'],
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/HwFXxTlbzTZKrDD8',
    n8nId: 'HwFXxTlbzTZKrDD8',
    toggleable: true,
  },
  {
    id: 'blacklist-notify',
    name: 'BAM - Blacklist Notify',
    category: 'Chatbot WA',
    description:
      'Webhook dari Kirana Monitor saat staf menambah blacklist manual — kirim notifikasi WA ke pemegang flag receives_blacklist_alert.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/nhbTeJJ2yLolJemW',
    n8nId: 'nhbTeJJ2yLolJemW',
    toggleable: true,
  },
  {
    id: 'blacklist-cleared',
    name: 'BAM - Blacklist Cleared Welcome',
    category: 'Chatbot WA',
    description:
      'Setelah nomor dinyatakan bukan spam (CLEARED): kirim sambutan Kirana satu kali, catat di chat_logs, dan reset stage ke CONFIRM_NAME. Satu jalur untuk WA dan web.',
    relations: ['Dipanggil oleh: WF Command United (WA), Kirana Monitor (web)'],
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/0XaLHvEAvMGekzLV',
    n8nId: '0XaLHvEAvMGekzLV',
    toggleable: true,
  },
  {
    id: 'resolve-notify',
    name: 'BAM - Resolve Request Notify',
    category: 'Chatbot WA',
    description:
      'Webhook dari Kirana Monitor saat RESOLVE ALL diajukan lewat web — kirim permintaan persetujuan ke semua pemegang flag is_resolve_approver.',
    relations: ['Keputusan SETUJU/TOLAK diproses WF_StaffReply_Handler_Unified'],
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/VpvZzBBtyUhQPI9l',
    n8nId: 'VpvZzBBtyUhQPI9l',
    toggleable: true,
  },
  {
    id: 'fullchatlog-1052',
    name: 'WF_FullChatLog_1052_v1.1',
    category: 'Pendukung Chat Log',
    description:
      'Mencatat setiap pesan nomor 1052 (masuk dan keluar) ke tabel chat_logs secara real-time.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/1QXVl96GYhFYVaYD',
    n8nId: '1QXVl96GYhFYVaYD',
    toggleable: true,
  },
  {
    id: 'fullchatlog-7484',
    name: 'WF_FullChatLog_7484_v1.1',
    category: 'Pendukung Chat Log',
    description:
      'Mencatat setiap pesan nomor 7484 (masuk dan keluar) ke tabel chat_logs secara real-time.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/QYKyOqPQo2XlQDKp',
    n8nId: 'QYKyOqPQo2XlQDKp',
    toggleable: true,
  },
  {
    id: 'pull-room-history',
    name: 'WF_PullRoomHistory_v1.4',
    category: 'Pendukung Chat Log',
    description:
      'Menarik riwayat chat per room dari WAHA untuk melengkapi chat_logs (deskripsi berdasarkan nama workflow).',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/GAiuS4AHwW0ldCXx',
    n8nId: 'GAiuS4AHwW0ldCXx',
    toggleable: true,
  },
  {
    id: 'backfill-1052',
    name: 'WF_BackfillMediaUrl_1052_v1.1',
    category: 'Pendukung Chat Log',
    description:
      'Mengisi media_url yang kosong pada chat_logs nomor 1052 (deskripsi berdasarkan nama workflow).',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/wQwTCNsEqBz5mVh8',
    n8nId: 'wQwTCNsEqBz5mVh8',
    toggleable: true,
  },
  {
    id: 'backfill-7484',
    name: 'WF_BackfillMediaUrl_7484_v1.1',
    category: 'Pendukung Chat Log',
    description:
      'Mengisi media_url yang kosong pada chat_logs nomor 7484 (deskripsi berdasarkan nama workflow). Saat ini nonaktif.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/rb8bAIeoRA4ucwgp',
    n8nId: 'rb8bAIeoRA4ucwgp',
    toggleable: false,
    lockedReason: 'Alat sekali jalan',
  },
  {
    id: 'import-1052',
    name: 'WF_HistoricalImport_1052_v1.1',
    category: 'Pendukung Chat Log',
    description:
      'Impor riwayat chat lama nomor 1052 ke chat_logs (source = historical). Dijalankan manual; saat ini nonaktif.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/vfcujCA1f0iob6Y0',
    n8nId: 'vfcujCA1f0iob6Y0',
    toggleable: false,
    lockedReason: 'Alat sekali jalan',
  },
  {
    id: 'import-7484',
    name: 'WF_HistoricalImport_7484_v1.1',
    category: 'Pendukung Chat Log',
    description:
      'Impor riwayat chat lama nomor 7484 ke chat_logs (source = historical). Dijalankan manual; saat ini nonaktif.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/DH9RiyaUlCl6BXqD',
    n8nId: 'DH9RiyaUlCl6BXqD',
    toggleable: false,
    lockedReason: 'Alat sekali jalan',
  },
  {
    id: 'daily-chat-report',
    name: 'BAM - Daily Chat Report',
    category: 'Pelaporan',
    description:
      'Tiap pagi 09.00 WIB: menganalisa seluruh chat kemarin (WA 1052, WA 7484, IG/FB) — angka dari database plus analisa isi chat oleh AI — lalu mengirim laporan eksekutif ke pemegang flag receives_daily_report dan menyimpannya di daily_chat_reports.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/d5L5ylXcTy9IZTUP',
    n8nId: 'd5L5ylXcTy9IZTUP',
    toggleable: true,
  },
  {
    id: 'workflow-health-monitor',
    name: 'BAM - Workflow Health Monitor',
    category: 'Pelaporan',
    description:
      'Tiap 15 menit memeriksa error eksekusi n8n (dikelompokkan: kredensial, nama node, jaringan, dll; tanpa spam), detak workflow terjadwal, dan sesi WAHA. Pukul 09.00 WIB mengirim ringkasan harian plus pemeriksaan nama node dan kredensial. Penerima: flag receives_system_alert.',
    n8nUrl: 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/workflow/SPfcViOUHtLoIrZF',
    n8nId: 'SPfcViOUHtLoIrZF',
    toggleable: true,
  },
];

// Riwayat ON/OFF lama dicatat dengan id workflow versi sebelumnya (dan sebagian tanpa id). Semuanya milik bot WA utama.
const LEGACY_LOG_IDS: Record<string, string> = {
  '5krrP3WG31LuabOA': 'k7R1YsdYmxMvZkkJ',
  '6XEaeRzNaynPCAD5': 'k7R1YsdYmxMvZkkJ',
};
const MAIN_BOT_ID = 'k7R1YsdYmxMvZkkJ';

function logOwner(log: BotToggleLog): string {
  if (!log.workflow_id) return MAIN_BOT_ID;
  return LEGACY_LOG_IDS[log.workflow_id] || log.workflow_id;
}

function HistoryTable({ sys, logs }: { sys: ConnectedSystem; logs: BotToggleLog[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [perPage, setPerPage] = useState<PerPage>(50);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    let list = statusFilter === 'all' ? logs : logs.filter((l) => l.status === statusFilter);
    list = [...list].sort((a, b) => {
      const cmp =
        sortKey === 'created_at'
          ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          : String(a[sortKey]).localeCompare(String(b[sortKey]));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return perPage === 'all' ? list : list.slice(0, perPage);
  }, [logs, statusFilter, perPage, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function exportCsv() {
    const header = 'Aksi,Status,Waktu,Triggered_By\n';
    const rows = filtered
      .map((l) => [l.action, l.status, l.created_at, l.triggered_by || ''].map((v) => `"${v}"`).join(','))
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riwayat_${sys.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const arrow = (col: SortKey) =>
    sortKey === col ? <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span> : null;

  if (logs.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Belum ada riwayat ON/OFF untuk workflow ini. Riwayat tercatat setiap kali workflow dinyalakan atau dimatikan lewat tombol di tabel ini.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
        >
          <option value="all">Semua Status</option>
          <option value="success">Sukses</option>
          <option value="failed">Gagal</option>
        </select>
        <select
          value={String(perPage)}
          onChange={(e) => setPerPage(e.target.value === 'all' ? 'all' : (Number(e.target.value) as PerPage))}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
        >
          <option value="50">50 / halaman</option>
          <option value="100">100 / halaman</option>
          <option value="all">Semua</option>
        </select>
        <button
          onClick={exportCsv}
          className="ml-auto rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ↓ Export CSV ({filtered.length})
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th onClick={() => toggleSort('action')} className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700">
                Aksi {arrow('action')}
              </th>
              <th onClick={() => toggleSort('status')} className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700">
                Status {arrow('status')}
              </th>
              <th onClick={() => toggleSort('created_at')} className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700">
                Waktu {arrow('created_at')}
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Oleh</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-2">{log.action === 'ON' ? '🟢 ON' : '🔴 OFF'}</td>
                <td className="px-4 py-2">{log.status === 'success' ? '✅ Sukses' : '❌ Gagal'}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(log.created_at).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2 text-gray-500">{log.triggered_by || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BotStatusContent() {
  const { nomor, profile, session } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const token = session?.access_token;
  const [logs, setLogs] = useState<BotToggleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [sysSortKey, setSysSortKey] = useState<SysSortKey>('category');
  const [sysSortDir, setSysSortDir] = useState<SortDir>('asc');

  // Status live per workflow n8n (id -> {active} | {error}), dan id yang sedang di-toggle
  const [wfStatus, setWfStatus] = useState<Record<string, WfStatus>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from('bot_toggle_logs')
      .select('id, action, triggered_by, status, created_at, workflow_id, workflow_name')
      .order('created_at', { ascending: false })
      .limit(1000);
    setLogs((data as BotToggleLog[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    const channel = supabase
      .channel('bot_toggle_logs_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_toggle_logs' }, (payload) => {
        setLogs((prev) => [payload.new as BotToggleLog, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Status live n8n sekali saat halaman dibuka (semua workflow terdaftar)
  useEffect(() => {
    if (!token) return;
    fetch('/api/n8n/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: CONNECTED_SYSTEMS.map((s) => s.n8nId) }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.results) setWfStatus(data.results);
      })
      .catch(() => {
        // biarkan -- badge menampilkan "Gagal cek" per baris
      });
  }, [token]);

  async function handleToggle(sys: ConnectedSystem) {
    if (!token) return;
    const current = wfStatus[sys.n8nId];
    const isActive = current && 'active' in current ? current.active : false;
    const nextAction: 'activate' | 'deactivate' = isActive ? 'deactivate' : 'activate';

    if (nextAction === 'deactivate' && !window.confirm(`Matikan ${sys.name}? Workflow ini akan berhenti jalan di n8n.`)) return;

    setTogglingId(sys.id);
    try {
      const res = await fetch('/api/n8n/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: sys.n8nId, action: nextAction, name: sys.name }),
      });
      const data = await res.json();
      if (res.ok) {
        setWfStatus((prev) => ({ ...prev, [sys.n8nId]: { active: data.active } }));
        setExpanded((prev) => new Set(prev).add(sys.id));
      } else {
        setWfStatus((prev) => ({ ...prev, [sys.n8nId]: { error: data.error || 'Gagal' } }));
      }
    } catch {
      setWfStatus((prev) => ({ ...prev, [sys.n8nId]: { error: 'Gagal konek' } }));
    } finally {
      setTogglingId(null);
    }
  }

  function toggleSysSort(key: SysSortKey) {
    if (sysSortKey === key) setSysSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSysSortKey(key);
      setSysSortDir('asc');
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const currentStatus = logs[0];

  const logsByWorkflow = useMemo(() => {
    const map: Record<string, BotToggleLog[]> = {};
    logs.forEach((l) => {
      const owner = logOwner(l);
      (map[owner] ||= []).push(l);
    });
    return map;
  }, [logs]);

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

  // Ringkasan cepat: berapa kali ON/OFF gagal dalam 24 jam terakhir -- sinyal kesehatan
  const last24hFailed = useMemo(() => {
    const cutoff = new Date().getTime() - 24 * 60 * 60 * 1000;
    return logs.filter((l) => l.status === 'failed' && new Date(l.created_at).getTime() > cutoff).length;
  }, [logs]);

  const sysArrow = (col: SysSortKey) =>
    sysSortKey === col ? <span className="ml-1 text-xs">{sysSortDir === 'asc' ? '↑' : '↓'}</span> : null;

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight text-gray-900">Status Bot</h1>
        <p className="mb-6 text-sm text-gray-500">
          Daftar workflow n8n yang terhubung ke Kirana Monitor. Klik sebuah baris untuk melihat riwayat ON/OFF workflow itu.
        </p>

        {/* Kartu status bot WA utama (ON/OFF terakhir) */}
        {!loading && currentStatus && (
          <div
            className={`mb-4 flex items-center justify-between rounded-2xl border p-6 ${
              currentStatus.action === 'ON' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${currentStatus.action === 'ON' ? 'bg-green-500' : 'bg-red-500'}`} />
                <p className={`text-base font-semibold ${currentStatus.action === 'ON' ? 'text-green-800' : 'text-red-800'}`}>
                  {currentStatus.action === 'ON' ? 'Perubahan terakhir: dinyalakan' : 'Perubahan terakhir: dimatikan'}
                  {currentStatus.workflow_name ? ` (${currentStatus.workflow_name})` : ''}
                </p>
              </div>
              <p className="mt-1 text-xs italic text-gray-500">
                {new Date(currentStatus.created_at).toLocaleString('id-ID')}
                {currentStatus.triggered_by ? ` oleh ${currentStatus.triggered_by}` : ''}
              </p>
            </div>
            {last24hFailed > 0 && (
              <div className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800">
                ⚠️ {last24hFailed} percobaan gagal dalam 24 jam terakhir
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th onClick={() => toggleSysSort('category')} className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700">
                  Kategori {sysArrow("category")}
                </th>
                <th onClick={() => toggleSysSort('name')} className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700">
                  Workflow {sysArrow("name")}
                </th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Fungsi</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedSystems.map((sys) => {
                const open = expanded.has(sys.id);
                const st = wfStatus[sys.n8nId];
                const sysLogs = logsByWorkflow[sys.n8nId] || [];
                return (
                  <Fragment key={sys.id}>
                    <tr onClick={() => toggleExpanded(sys.id)} className="cursor-pointer hover:bg-gray-50" aria-expanded={open}>
                      <td className="px-3 py-2 text-gray-400">{open ? '▾' : '▸'}</td>
                      <td className="px-4 py-2 text-gray-500">{sys.category}</td>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {sys.name}
                        <span className="ml-2 text-xs font-normal text-gray-400">{sysLogs.length} riwayat</span>
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
                      <td className="whitespace-nowrap px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        {!st ? (
                          <span className="text-xs text-gray-400">Memeriksa...</span>
                        ) : 'error' in st ? (
                          <span className="text-xs text-amber-700" title={st.error}>
                            Gagal cek
                          </span>
                        ) : (
                          <span className={`rounded px-2 py-0.5 text-xs ${st.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {st.active ? '🟢 Aktif' : '🔴 Nonaktif'}
                          </span>
                        )}
                        {isAdmin && (
                          <div className="mt-1">
                            {sys.toggleable ? (
                              <button
                                onClick={() => handleToggle(sys)}
                                disabled={togglingId === sys.id || !st || 'error' in st}
                                className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                              >
                                {togglingId === sys.id ? 'Memproses...' : st && 'active' in st && st.active ? 'Matikan' : 'Nyalakan'}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">🔒 {sys.lockedReason}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <a
                          href={sys.n8nUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="whitespace-nowrap text-sm font-medium text-gray-400 hover:text-gray-700"
                        >
                          Buka di n8n ↗
                        </a>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-gray-50/60">
                        <td />
                        <td colSpan={5} className="px-4 py-4">
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Riwayat ON/OFF — {sys.name}</p>
                          {loading ? <p className="text-sm text-gray-400">Memuat...</p> : <HistoryTable sys={sys} logs={sysLogs} />}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Daftar dikelola manual di kode. Riwayat tercatat saat workflow dinyalakan atau dimatikan lewat tombol di sini (hanya Super Admin). Riwayat lama dari perintah BOT_ON/BOT_OFF via WA tetap ditampilkan.
        </p>
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
