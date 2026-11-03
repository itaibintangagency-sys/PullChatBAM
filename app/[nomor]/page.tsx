'use client';

import { useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Nomor } from '@/lib/types';
import { SkeletonCard } from '@/components/Skeleton';
import { RefreshBar } from '@/components/RefreshBar';
import { usePageRefresh } from '@/lib/usePageRefresh';

interface Counts {
  escalationsTotal: number;
  escalationsOpen: number;
  escalationsResolved: number;
  dormantPending: number;
  blacklistTotal: number;
  phonebookTotal: number;
}

interface StaffLoad {
  name: string;
  open: number;
  resolved: number;
}

interface EscalationRow {
  assigned_to: string | null;
  priority: string | null;
  status: string | null;
}

const FETCH_PAGE = 1000; // batas baris per permintaan di API Supabase

// Ambil semua tiket per 1000 baris -- tanpa ini hasil terpotong diam-diam di 1000 baris
async function fetchAllEscalations(nomor: Nomor): Promise<EscalationRow[] | null> {
  const out: EscalationRow[] = [];
  for (let from = 0; ; from += FETCH_PAGE) {
    const { data, error } = await supabase
      .from('escalations')
      .select('assigned_to, priority, status')
      .eq('bot_source', nomor)
      .order('id')
      .range(from, from + FETCH_PAGE - 1);
    if (error) return null;
    const rows = (data as EscalationRow[] | null) ?? [];
    out.push(...rows);
    if (rows.length < FETCH_PAGE) break;
  }
  return out;
}

interface PriorityBreakdown {
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  other: number;
}

interface DormantBreakdown {
  HANDOFF: number;
  BUNTU_9X: number;
  other: number;
}

// Sama seperti di halaman Eskalasi -- pencocokan PERSIS per-kata,
// bukan "mengandung teks", supaya "RINTAN" tidak kecantol "RINTAN2".
function isAssignedToAlias(assignedTo: string | null, alias: string | null): boolean {
  if (!alias || !assignedTo) return false;
  const tokens = assignedTo.split(',').map((t) => t.trim());
  return tokens.includes(alias);
}

function CountCard({ href, label, value, tone }: { href: string; label: string; value: number; tone: string }) {
  return (
    <Link href={href} className={`block rounded-xl border p-5 transition hover:shadow-sm ${tone}`}>
      <p className="text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm opacity-80">{label}</p>
    </Link>
  );
}

function DashboardContent({ nomor }: { nomor: Nomor }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const myAlias = profile?.escalation_alias || null;

  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Counts>({
    escalationsTotal: 0,
    escalationsOpen: 0,
    escalationsResolved: 0,
    dormantPending: 0,
    blacklistTotal: 0,
    phonebookTotal: 0,
  });
  const [myCounts, setMyCounts] = useState({ total: 0, open: 0, resolved: 0 });
  const [staffLoad, setStaffLoad] = useState<StaffLoad[]>([]);
  const [priority, setPriority] = useState<PriorityBreakdown>({ HIGH: 0, MEDIUM: 0, LOW: 0, other: 0 });
  const [dormantSrc, setDormantSrc] = useState<DormantBreakdown>({ HANDOFF: 0, BUNTU_9X: 0, other: 0 });

  const loadedFor = useRef<string | null>(null);

  const { refreshNow, barProps } = usePageRefresh(load, { storageKey: 'dashboard', runOnMount: false });

  useEffect(() => {
    void refreshNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomor, myAlias]);

  async function load(): Promise<boolean> {
    // Skeleton hanya saat pertama kali / ganti bot / ganti alias -- bukan tiap auto-refresh
    const key = `${nomor}|${myAlias}`;
    if (loadedFor.current !== key) setLoading(true);

    const [escRows, dormantCount, blacklistCount, phonebookCount, dormantRows] = await Promise.all([
      fetchAllEscalations(nomor),
      supabase.from('dormant_tracking').select('*', { count: 'exact', head: true }).eq('bot_source', nomor).eq('status', 'PENDING'),
      supabase.from('blacklist').select('*', { count: 'exact', head: true }).eq('bot_source', nomor).eq('status', 'CONFIRMED'),
      supabase.from('phonebook').select('*', { count: 'exact', head: true }).eq('bot_source', nomor),
      supabase.from('dormant_tracking').select('source').eq('bot_source', nomor).eq('status', 'PENDING'),
    ]);

    // Query gagal -> jangan timpa angka lama dengan 0 (auto-refresh tidak boleh "mengosongkan" dashboard)
    if (!escRows || [dormantCount, blacklistCount, phonebookCount, dormantRows].some((r) => r.error)) {
      setLoading(false);
      return false;
    }

    // Total, terbuka, dan selesai dihitung dari satu daftar tiket yang sama -- angkanya pasti saling cocok
    const loadMap: Record<string, StaffLoad> = {};
    const prio: PriorityBreakdown = { HIGH: 0, MEDIUM: 0, LOW: 0, other: 0 };
    let open = 0;
    let resolved = 0;
    const mine = { total: 0, open: 0, resolved: 0 };
    escRows.forEach((r) => {
      const isResolved = r.status === 'RESOLVE';
      const isOpen = r.status === 'OPEN';
      if (isResolved) resolved++;
      if (isOpen) open++;

      const staff = r.assigned_to || 'Belum ditugaskan';
      const load = (loadMap[staff] ||= { name: staff, open: 0, resolved: 0 });
      if (isResolved) load.resolved++;
      if (isOpen) load.open++;

      const isMine = isAssignedToAlias(r.assigned_to, myAlias);
      if (isMine) {
        mine.total++;
        if (isResolved) mine.resolved++;
        if (isOpen) mine.open++;
      }

      // Admin lihat breakdown prioritas GLOBAL (semua tiket terbuka).
      // Staff lihat breakdown prioritas cuma dari tiket MILIKNYA sendiri --
      // biar konsisten sama kartu "Tiket kamu terbuka" di atas, bukan
      // angka perusahaan yang tidak nyambung ke miliknya.
      if (isOpen && (isAdmin || isMine)) {
        const p = r.priority;
        if (p === 'HIGH' || p === 'MEDIUM' || p === 'LOW') prio[p]++;
        else prio.other++;
      }
    });

    setCounts({
      escalationsTotal: escRows.length,
      escalationsOpen: open,
      escalationsResolved: resolved,
      dormantPending: dormantCount.count || 0,
      blacklistTotal: blacklistCount.count || 0,
      phonebookTotal: phonebookCount.count || 0,
    });
    // Urut dari yang paling banyak belum selesai; yang sama-sama 0 diurut dari total terbanyak
    setStaffLoad(
      Object.values(loadMap)
        .filter((s) => s.open + s.resolved > 0)
        .sort((a, b) => b.open - a.open || b.open + b.resolved - (a.open + a.resolved))
    );
    setPriority(prio);
    setMyCounts(mine);

    const dorm: DormantBreakdown = { HANDOFF: 0, BUNTU_9X: 0, other: 0 };
    (dormantRows.data || []).forEach((r: { source: string | null }) => {
      const s = r.source;
      if (s === 'HANDOFF' || s === 'BUNTU_9X') dorm[s]++;
      else dorm.other++;
    });
    setDormantSrc(dorm);

    loadedFor.current = key;
    setLoading(false);
    return true;
  }

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mb-1 text-lg font-medium text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500">Ringkasan cepat bot {nomor}.</p>
          </div>
          <RefreshBar {...barProps} />
        </div>

        {!isAdmin && !myAlias && (
          <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Akun kamu belum punya alias eskalasi -- minta Super Admin isi lewat halaman
            Kelola Staff supaya jumlah tiket kamu bisa ditampilkan di sini.
          </div>
        )}

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in space-y-6 duration-300">
            {/* Kartu utama */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <CountCard
                href={`/${nomor}/escalations`}
                label={isAdmin ? 'Total eskalasi' : 'Total tiket kamu'}
                value={isAdmin ? counts.escalationsTotal : myCounts.total}
                tone="border-indigo-200 bg-indigo-50 text-indigo-800"
              />
              <CountCard
                href={`/${nomor}/escalations`}
                label={isAdmin ? 'Eskalasi terbuka' : 'Tiket kamu terbuka'}
                value={isAdmin ? counts.escalationsOpen : myCounts.open}
                tone="border-red-200 bg-red-50 text-red-800"
              />
              <CountCard
                href={`/${nomor}/escalations`}
                label={isAdmin ? 'Sudah resolve' : 'Tiket kamu sudah resolve'}
                value={isAdmin ? counts.escalationsResolved : myCounts.resolved}
                tone="border-green-200 bg-green-50 text-green-800"
              />
              <CountCard
                href={`/${nomor}/dormant`}
                label="Dormant menunggu"
                value={counts.dormantPending}
                tone="border-orange-200 bg-orange-50 text-orange-800"
              />
              <CountCard
                href={`/${nomor}/blacklist`}
                label="Nomor di-blacklist"
                value={counts.blacklistTotal}
                tone="border-gray-200 bg-gray-50 text-gray-800"
              />
              <CountCard
                href={`/${nomor}/chats`}
                label="Customer terdaftar"
                value={counts.phonebookTotal}
                tone="border-blue-200 bg-blue-50 text-blue-800"
              />
            </div>

            {/* Beban kerja per staff -- cuma buat admin, staff tidak perlu
                lihat perbandingan beban kerja kolega lain */}
            {isAdmin && (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">Beban kerja staff</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-900" />Belum resolve</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />Sudah resolve</span>
                  </div>
                </div>
                {staffLoad.length === 0 ? (
                  <p className="text-sm text-gray-400">Belum ada eskalasi.</p>
                ) : (
                  <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-3">
                    {staffLoad.map((s) => {
                      const max = Math.max(...staffLoad.map((x) => x.open + x.resolved));
                      return (
                        <div key={s.name} className="flex items-center gap-3">
                          <span className="w-32 shrink-0 truncate text-sm text-gray-700" title={s.name}>{s.name}</span>
                          <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full bg-gray-900" style={{ width: `${(s.open / max) * 100}%` }} />
                            <div className="h-full bg-green-500" style={{ width: `${(s.resolved / max) * 100}%` }} />
                          </div>
                          <span className="w-36 shrink-0 text-right text-xs text-gray-500">
                            <span className="font-medium text-gray-900">{s.open}</span> belum ·{' '}
                            <span className="font-medium text-green-700">{s.resolved}</span> sudah
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 2 kolom breakdown -- tetap tampil buat semua role, ini
                gambaran umum sistem, bukan data personal per-staff */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-gray-900">
                  {isAdmin ? 'Prioritas eskalasi terbuka' : 'Prioritas tiket kamu'}
                </p>
                <div className="space-y-1 rounded-xl border border-gray-200 bg-white p-3 text-sm">
                  <div className="flex justify-between"><span className="text-red-600">HIGH</span><span>{priority.HIGH}</span></div>
                  <div className="flex justify-between"><span className="text-amber-600">MEDIUM</span><span>{priority.MEDIUM}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">LOW</span><span>{priority.LOW}</span></div>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-gray-900">Jalur dormant</p>
                <div className="space-y-1 rounded-xl border border-gray-200 bg-white p-3 text-sm">
                  <div className="flex justify-between"><span className="text-blue-600">Handoff staff</span><span>{dormantSrc.HANDOFF}</span></div>
                  <div className="flex justify-between"><span className="text-orange-600">9× salah pilih</span><span>{dormantSrc.BUNTU_9X}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  return (
    <RequireNomor>
      <DashboardContent nomor={nomor as Nomor} />
    </RequireNomor>
  );
}
