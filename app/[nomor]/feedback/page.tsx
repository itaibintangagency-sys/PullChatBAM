'use client';

import { useEffect, useMemo, useState, use } from 'react';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { supabase } from '@/lib/supabase';
import { Nomor } from '@/lib/types';
import { SkeletonCard } from '@/components/Skeleton';

interface FeedbackRow {
  id: string;
  nomor_wa: string;
  nama: string | null;
  kategori: string | null;
  rating: number | null;
  feedback_text: string | null;
  requested_at: string;
  status: string; // DONE = customer menilai, SKIPPED = tidak membalas
}

const FETCH_PAGE = 1000; // batas baris per permintaan di API Supabase
const LOW_RATING = 2;
const DAY_MS = 86_400_000;

type Periode = 7 | 30 | 90 | 0;
type Tampil = 'SEMUA' | 'RENDAH' | 'KOMENTAR';

// Ambil semua feedback per 1000 baris supaya tidak terpotong diam-diam
async function fetchFeedback(nomor: Nomor): Promise<FeedbackRow[] | null> {
  const out: FeedbackRow[] = [];
  for (let from = 0; ; from += FETCH_PAGE) {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, nomor_wa, nama, kategori, rating, feedback_text, requested_at, status')
      .eq('bot_source', nomor)
      .order('requested_at', { ascending: false })
      .order('id')
      .range(from, from + FETCH_PAGE - 1);
    if (error) return null;
    const rows = (data as FeedbackRow[] | null) ?? [];
    out.push(...rows);
    if (rows.length < FETCH_PAGE) break;
  }
  return out;
}

function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function fmtAvg(n: number | null): string {
  return n === null ? '–' : n.toFixed(2).replace('.', ',');
}

function stars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
}

function ratingTone(rating: number): string {
  if (rating <= LOW_RATING) return 'text-red-600';
  if (rating === 3) return 'text-amber-600';
  return 'text-green-600';
}

// Awal minggu (Senin) sebagai kunci kelompok tren mingguan
function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone: string }) {
  return (
    <div className={`rounded-xl border p-5 ${tone}`}>
      <p className="text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm opacity-80">{label}</p>
      {hint && <p className="mt-0.5 text-xs opacity-60">{hint}</p>}
    </div>
  );
}

function FeedbackContent({ nomor }: { nomor: Nomor }) {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [now] = useState(() => Date.now());

  const [periode, setPeriode] = useState<Periode>(30);
  const [kategori, setKategori] = useState('ALL');
  const [tampil, setTampil] = useState<Tampil>('SEMUA');

  useEffect(() => {
    let cancelled = false;
    fetchFeedback(nomor).then((data) => {
      if (cancelled) return;
      if (data) setRows(data);
      setFailed(!data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [nomor]);

  const kategoriOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.kategori).filter((k): k is string => !!k))).sort(),
    [rows]
  );

  const scoped = useMemo(
    () =>
      rows.filter((r) => {
        if (periode && now - new Date(r.requested_at).getTime() > periode * DAY_MS) return false;
        if (kategori !== 'ALL' && r.kategori !== kategori) return false;
        return true;
      }),
    [rows, periode, kategori, now]
  );

  const rated = useMemo(() => scoped.filter((r) => r.status === 'DONE' && r.rating !== null), [scoped]);
  const avgAll = avg(rated.map((r) => r.rating as number));
  const lowCount = rated.filter((r) => (r.rating as number) <= LOW_RATING).length;
  const responseRate = scoped.length ? (rated.length / scoped.length) * 100 : null;

  // Penilaian ini untuk bot Kirana (bukan staf), jadi dikelompokkan per jenis pengguna bot (Creator/Seller)
  const perKategori = useMemo(() => {
    const map = new Map<string, { kategori: string; minta: number; nilai: number[] }>();
    for (const r of scoped) {
      const key = (r.kategori || '').trim() || '(belum diketahui)';
      const g = map.get(key) ?? { kategori: key, minta: 0, nilai: [] };
      g.minta++;
      if (r.status === 'DONE' && r.rating !== null) g.nilai.push(r.rating);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => b.minta - a.minta);
  }, [scoped]);

  const distribusi = useMemo(
    () => [5, 4, 3, 2, 1].map((n) => ({ n, jumlah: rated.filter((r) => r.rating === n).length })),
    [rated]
  );

  const trend = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const r of rated) {
      const k = weekStart(r.requested_at);
      map.set(k, [...(map.get(k) ?? []), r.rating as number]);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 8)
      .reverse()
      .map(([minggu, nilai]) => ({ minggu, n: nilai.length, rata: avg(nilai) as number }));
  }, [rated]);

  const daftar = useMemo(() => {
    let list = rated;
    if (tampil === 'RENDAH') list = list.filter((r) => (r.rating as number) <= LOW_RATING);
    if (tampil === 'KOMENTAR') list = list.filter((r) => (r.feedback_text || '').trim() !== '');
    return list;
  }, [rated, tampil]);

  const selectCls = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-gray-500';
  const chipCls = (aktif: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${aktif ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`;

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Feedback chatbot</h1>
        <p className="mb-6 text-sm text-gray-500">
          Penilaian customer terhadap bot Kirana ({nomor}). Di akhir percakapan, bot meminta rating 1–5 dan alasan (boleh dikosongkan atau di-skip).
          Ini penilaian untuk bot, bukan untuk staf.
        </p>

        {failed && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            Gagal memuat feedback. Muat ulang halaman untuk mencoba lagi.
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <select aria-label="Periode" value={periode} onChange={(e) => setPeriode(Number(e.target.value) as Periode)} className={selectCls}>
            <option value={7}>7 hari terakhir</option>
            <option value={30}>30 hari terakhir</option>
            <option value={90}>90 hari terakhir</option>
            <option value={0}>Semua waktu</option>
          </select>
          <select aria-label="Kategori" value={kategori} onChange={(e) => setKategori(e.target.value)} className={selectCls}>
            <option value="ALL">Semua kategori</option>
            {kategoriOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Rata-rata rating" value={fmtAvg(avgAll)} hint="dari skala 5" tone="border-green-200 bg-green-50 text-green-800" />
              <StatCard label="Customer menilai" value={String(rated.length)} hint={`dari ${scoped.length} permintaan`} tone="border-blue-200 bg-blue-50 text-blue-800" />
              <StatCard
                label="Tingkat respons"
                value={responseRate === null ? '–' : `${responseRate.toFixed(0)}%`}
                hint="yang membalas permintaan"
                tone="border-gray-200 bg-gray-50 text-gray-800"
              />
              <StatCard label={`Rating rendah (≤${LOW_RATING})`} value={String(lowCount)} tone="border-red-200 bg-red-50 text-red-800" />
            </div>

            {rated.length === 0 ? (
              <p className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
                Belum ada penilaian pada filter ini.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-900">Sebaran rating</p>
                    <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-3">
                      {distribusi.map((d) => (
                        <div key={d.n} className="flex items-center gap-3">
                          <span className={`w-14 shrink-0 text-xs ${ratingTone(d.n)}`}>{d.n} ★</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={`h-full rounded-full ${d.n <= LOW_RATING ? 'bg-red-500' : d.n === 3 ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${rated.length ? (d.jumlah / rated.length) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="w-20 shrink-0 text-right text-xs text-gray-500">
                            <span className="font-medium text-gray-900">{d.jumlah}</span>
                            {rated.length ? ` · ${Math.round((d.jumlah / rated.length) * 100)}%` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mb-2 mt-4 text-sm font-medium text-gray-900">Per jenis pengguna bot</p>
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">Kategori</th>
                            <th className="px-3 py-2 text-right font-medium">Diminta</th>
                            <th className="px-3 py-2 text-right font-medium">Menilai</th>
                            <th className="px-3 py-2 text-right font-medium">Rata-rata</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {perKategori.map((g) => (
                            <tr key={g.kategori}>
                              <td className="px-3 py-2 text-gray-800">{g.kategori}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{g.minta}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{g.nilai.length}</td>
                              <td className={`px-3 py-2 text-right font-medium ${g.nilai.length ? ratingTone(Math.round(avg(g.nilai) as number)) : 'text-gray-400'}`}>
                                {fmtAvg(avg(g.nilai))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-900">Tren mingguan</p>
                    <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-3">
                      {trend.map((t) => (
                        <div key={t.minggu} className="flex items-center gap-3">
                          <span className="w-20 shrink-0 text-xs text-gray-500">
                            {new Date(t.minggu).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-green-500" style={{ width: `${(t.rata / 5) * 100}%` }} />
                          </div>
                          <span className="w-24 shrink-0 text-right text-xs text-gray-500">
                            <span className="font-medium text-gray-900">{fmtAvg(t.rata)}</span> · {t.n} nilai
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">Penilaian dan alasan terbaru</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setTampil('SEMUA')} aria-pressed={tampil === 'SEMUA'} className={chipCls(tampil === 'SEMUA')}>
                        Semua
                      </button>
                      <button type="button" onClick={() => setTampil('RENDAH')} aria-pressed={tampil === 'RENDAH'} className={chipCls(tampil === 'RENDAH')}>
                        Rating rendah
                      </button>
                      <button type="button" onClick={() => setTampil('KOMENTAR')} aria-pressed={tampil === 'KOMENTAR'} className={chipCls(tampil === 'KOMENTAR')}>
                        Ada komentar
                      </button>
                    </div>
                  </div>
                  {daftar.length === 0 ? (
                    <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">
                      Tidak ada penilaian yang cocok.
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                      {daftar.slice(0, 100).map((r) => (
                        <div key={r.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm tracking-wide ${ratingTone(r.rating as number)}`} aria-label={`Rating ${r.rating} dari 5`}>
                                {stars(r.rating as number)}
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                {r.nama && r.nama !== '-' ? r.nama : r.nomor_wa}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400">
                              {new Date(r.requested_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          {(r.feedback_text || '').trim() && (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{r.feedback_text}</p>
                          )}
                          {r.kategori && <p className="mt-1 text-xs text-gray-400">{r.kategori}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  {daftar.length > 100 && (
                    <p className="mt-2 text-xs text-gray-400">Menampilkan 100 terbaru dari {daftar.length}. Persempit filter untuk melihat sisanya.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function FeedbackPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  return (
    <RequireNomor>
      <FeedbackContent key={nomor} nomor={nomor as Nomor} />
    </RequireNomor>
  );
}
