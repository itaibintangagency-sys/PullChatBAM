'use client';

import { useMemo, useState } from 'react';

// Baris dari view `brand_queue` di Supabase
export interface BrandQueueItem {
  urutan: number | null;
  nama_toko: string;
  link_tersisa: number;
  komisi_mcn_terbaik: number | string | null;
  sudah_terkirim: number;
  total_link: number;
  terakhir_dikirim: string | null;
  brand_aktif: boolean;
}

type SortKey = 'urutan' | 'nama_toko' | 'link_tersisa' | 'komisi' | 'terkirim' | 'status';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;

// Arah sort saat header pertama kali diklik
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  urutan: 'asc',
  nama_toko: 'asc',
  status: 'asc',
  link_tersisa: 'desc',
  komisi: 'desc',
  terkirim: 'desc',
};

function komisiNum(b: BrandQueueItem): number | null {
  if (b.komisi_mcn_terbaik === null || b.komisi_mcn_terbaik === undefined) return null;
  const n = Number(b.komisi_mcn_terbaik);
  return Number.isNaN(n) ? null : n;
}

// 1 … 4 5 6 … 24  (halaman pertama, terakhir, dan sekitar halaman aktif)
function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(set)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

interface Props {
  rows: BrandQueueItem[];
  kirimanPerHari?: number;
}

export function BrandQueueTable({ rows, kirimanPerHari = 5 }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('urutan');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  const tersisa = useMemo(() => rows.filter((b) => b.link_tersisa > 0), [rows]);
  const brandHabis = rows.length - tersisa.length;
  const totalLink = useMemo(() => tersisa.reduce((sum, b) => sum + b.link_tersisa, 0), [tersisa]);

  // Brand "Berikutnya" = urutan 1 kalau belum ada brand berjalan, selain itu urutan 2
  const adaAktif = rows.some((b) => b.brand_aktif);
  const urutanBerikutnya = adaAktif ? 2 : 1;

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const rank = (b: BrandQueueItem) => (b.brand_aktif ? 0 : b.urutan === urutanBerikutnya ? 1 : 2);
    const arr = [...tersisa];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'nama_toko':
          cmp = a.nama_toko.localeCompare(b.nama_toko, 'id', { sensitivity: 'base' });
          break;
        case 'link_tersisa':
          cmp = a.link_tersisa - b.link_tersisa;
          break;
        case 'komisi':
          cmp = (komisiNum(a) ?? -1) - (komisiNum(b) ?? -1);
          break;
        case 'terkirim':
          cmp = a.sudah_terkirim - b.sudah_terkirim;
          break;
        case 'status':
          cmp = rank(a) - rank(b);
          break;
        default:
          cmp = (a.urutan ?? 0) - (b.urutan ?? 0);
      }
      if (cmp !== 0) return cmp * dir;
      return (a.urutan ?? 0) - (b.urutan ?? 0); // seri -> selalu ikuti urutan tayang
    });
    return arr;
  }, [tersisa, sortKey, sortDir, urutanBerikutnya]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const halaman = Math.min(page, totalPages);
  const awal = (halaman - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(awal, awal + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
    setPage(1);
  }

  function th(key: SortKey, label: string, align: 'left' | 'right', title?: string) {
    const aktif = sortKey === key;
    return (
      <th
        scope="col"
        aria-sort={aktif ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`px-2 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          title={title}
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-900 ${
            aktif ? 'text-gray-900' : 'text-gray-500'
          }`}
        >
          {label}
          <span aria-hidden="true" className={aktif ? 'text-gray-900' : 'text-gray-300'}>
            {aktif ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </button>
      </th>
    );
  }

  if (tersisa.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs text-gray-400">Semua link sudah terkirim atau kadaluarsa.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <p className="px-3 pt-3 pb-2 text-[11px] text-gray-500">
        {tersisa.length} brand · {totalLink} link belum terkirim
        {brandHabis > 0 ? ` · ${brandHabis} brand habis` : ''}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-y border-gray-200 bg-gray-50 text-[10px]">
              {th('urutan', '#', 'left', 'Giliran tayang')}
              {th('nama_toko', 'Brand', 'left')}
              {th('link_tersisa', 'Tersisa', 'right', 'Link belum terkirim (dan belum kadaluarsa) + perkiraan lama habis')}
              {th('komisi', 'Komisi MCN', 'right', 'Komisi MCN tertinggi di antara link yang MASIH tersisa')}
              {th('terkirim', 'Terkirim', 'right', 'Link yang sudah terkirim / total link brand')}
              {th('status', 'Status', 'left')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pageRows.map((b) => {
              const berikutnya = !b.brand_aktif && b.urutan === urutanBerikutnya;
              const komisi = komisiNum(b);
              const hari = Math.max(1, Math.ceil(b.link_tersisa / kirimanPerHari));
              return (
                <tr key={b.nama_toko} className={b.brand_aktif ? 'bg-emerald-50' : 'hover:bg-gray-50'}>
                  <td
                    className={`border-l-2 px-2 py-1.5 text-gray-400 ${
                      b.brand_aktif ? 'border-emerald-500' : 'border-transparent'
                    }`}
                  >
                    {b.urutan}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="block max-w-[190px] truncate text-gray-800" title={b.nama_toko}>
                      {b.nama_toko}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <span
                      className={b.link_tersisa <= 3 ? 'font-medium text-amber-600' : 'text-gray-900'}
                      title={b.link_tersisa <= 3 ? 'Hampir habis' : undefined}
                    >
                      {b.link_tersisa}
                    </span>
                    <span className="ml-1 text-gray-400">· ~{hari} hari</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-gray-700">
                    {komisi === null ? '–' : `${komisi}%`}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-gray-500">
                    {b.sudah_terkirim}/{b.total_link}
                  </td>
                  <td className="px-2 py-1.5">
                    {b.brand_aktif && (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white">
                        Berjalan
                      </span>
                    )}
                    {berikutnya && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                        Berikutnya
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-3 py-2">
        <span className="text-[11px] text-gray-500">
          {awal + 1}–{Math.min(awal + PAGE_SIZE, sorted.length)} dari {sorted.length} brand
        </span>
        <nav aria-label="Halaman antrean brand" className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(halaman - 1)}
            disabled={halaman <= 1}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            aria-label="Halaman sebelumnya"
          >
            ‹
          </button>
          {buildPageNumbers(halaman, totalPages).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-gray-400">
                …
              </span>
            ) : (
              <button
                type="button"
                key={p}
                onClick={() => setPage(p)}
                aria-current={p === halaman ? 'page' : undefined}
                className={`min-w-[28px] rounded-md border px-2 py-1 text-xs ${
                  p === halaman
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setPage(halaman + 1)}
            disabled={halaman >= totalPages}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            aria-label="Halaman berikutnya"
          >
            ›
          </button>
        </nav>
      </div>

      <p className="border-t border-gray-100 px-3 py-2 text-[10px] text-gray-400">
        Hijau = brand sedang dikuras · Biru = giliran berikutnya · angka oranye = sisa ≤ 3 link. Komisi MCN dihitung
        dari link yang masih tersisa. Perkiraan hari memakai {kirimanPerHari} kiriman/hari.
      </p>
    </div>
  );
}
