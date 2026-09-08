'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Nomor } from '@/lib/types';
import { SkeletonCard } from '@/components/Skeleton';

interface Counts {
  escalationsOpen: number;
  dormantPending: number;
  blacklistTotal: number;
  phonebookTotal: number;
}

interface StaffLoad {
  name: string;
  count: number;
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
    escalationsOpen: 0,
    dormantPending: 0,
    blacklistTotal: 0,
    phonebookTotal: 0,
  });
  const [myOpenCount, setMyOpenCount] = useState(0);
  const [staffLoad, setStaffLoad] = useState<StaffLoad[]>([]);
  const [priority, setPriority] = useState<PriorityBreakdown>({ HIGH: 0, MEDIUM: 0, LOW: 0, other: 0 });
  const [dormantSrc, setDormantSrc] = useState<DormantBreakdown>({ HANDOFF: 0, BUNTU_9X: 0, other: 0 });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomor, myAlias]);

  async function load() {
    setLoading(true);

    const [escOpenCount, dormantCount, blacklistCount, phonebookCount, escOpenRows, dormantRows] = await Promise.all([
      supabase.from('escalations').select('*', { count: 'exact', head: true }).eq('bot_source', nomor).eq('status', 'OPEN'),
      supabase.from('dormant_tracking').select('*', { count: 'exact', head: true }).eq('bot_source', nomor).eq('status', 'PENDING'),
      supabase.from('blacklist').select('*', { count: 'exact', head: true }).eq('bot_source', nomor),
      supabase.from('phonebook').select('*', { count: 'exact', head: true }).eq('bot_source', nomor),
      supabase.from('escalations').select('assigned_to, priority').eq('bot_source', nomor).eq('status', 'OPEN'),
      supabase.from('dormant_tracking').select('source').eq('bot_source', nomor).eq('status', 'PENDING'),
    ]);

    setCounts({
      escalationsOpen: escOpenCount.count || 0,
      dormantPending: dormantCount.count || 0,
      blacklistTotal: blacklistCount.count || 0,
      phonebookTotal: phonebookCount.count || 0,
    });

    // Beban kerja per staff -- dihitung di sisi client dari baris OPEN
    const loadMap: Record<string, number> = {};
    const prio: PriorityBreakdown = { HIGH: 0, MEDIUM: 0, LOW: 0, other: 0 };
    let myCount = 0;
    (escOpenRows.data || []).forEach((r: { assigned_to: string | null; priority: string | null }) => {
      const staff = r.assigned_to || 'Belum ditugaskan';
      loadMap[staff] = (loadMap[staff] || 0) + 1;
      const p = r.priority;
      if (p === 'HIGH' || p === 'MEDIUM' || p === 'LOW') prio[p]++;
      else prio.other++;
      if (isAssignedToAlias(r.assigned_to, myAlias)) myCount++;
    });
    setStaffLoad(
      Object.entries(loadMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
    );
    setPriority(prio);
    setMyOpenCount(myCount);

    const dorm: DormantBreakdown = { HANDOFF: 0, BUNTU_9X: 0, other: 0 };
    (dormantRows.data || []).forEach((r: { source: string | null }) => {
      const s = r.source;
      if (s === 'HANDOFF' || s === 'BUNTU_9X') dorm[s]++;
      else dorm.other++;
    });
    setDormantSrc(dorm);

    setLoading(false);
  }

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Dashboard</h1>
        <p className="mb-6 text-sm text-gray-500">Ringkasan cepat bot {nomor}.</p>

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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CountCard
                href={`/${nomor}/escalations`}
                label={isAdmin ? 'Eskalasi terbuka' : 'Tiket kamu terbuka'}
                value={isAdmin ? counts.escalationsOpen : myOpenCount}
                tone="border-red-200 bg-red-50 text-red-800"
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
                <p className="mb-2 text-sm font-medium text-gray-900">Beban kerja staff (eskalasi terbuka)</p>
                {staffLoad.length === 0 ? (
                  <p className="text-sm text-gray-400">Tidak ada eskalasi terbuka saat ini.</p>
                ) : (
                  <div className="space-y-1 rounded-xl border border-gray-200 bg-white p-3">
                    {staffLoad.map((s) => (
                      <div key={s.name} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 truncate text-sm text-gray-700">{s.name}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-gray-900"
                            style={{ width: `${(s.count / staffLoad[0].count) * 100}%` }}
                          />
                        </div>
                        <span className="w-6 shrink-0 text-right text-sm text-gray-500">{s.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2 kolom breakdown -- tetap tampil buat semua role, ini
                gambaran umum sistem, bukan data personal per-staff */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-gray-900">Prioritas eskalasi terbuka</p>
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
