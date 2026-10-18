'use client';

import { useMemo, useState } from 'react';

export type BrandStatus = 'BERIKUTNYA' | 'ANTRE' | 'JEDA' | 'DILEWATI' | 'TIDAK_ADA';

// Baris dari view `channel_queue` di Supabase -- aturan yang SAMA dengan fungsi broadcast_candidates()
export interface BrandQueueItem {
  urutan: number | null; // giliran di antrean (hanya brand yang layak kirim dan tidak dilewati)
  nama_toko: string;
  status: BrandStatus;
  total_link: number;
  link_layak: number; // bisa dipilih untuk siaran (di luar jeda 30 hari, memenuhi minimal 2 dari 3 syarat)
  link_tak_layak: number; // tidak memenuhi syarat komisi
  link_jeda: number; // sudah disiarkan < 30 hari
  link_ditahan: number; // layak, tapi tertahan karena brand dilewati
  link_pernah_terkirim: number;
  siaran_terkirim: number; // jumlah SIARAN di log yang memuat brand ini
  terakhir_siaran: string | null;
  komisi_mcn_terbaik: number | string | null;
  dilewati: boolean;
  dalam_jeda_toko: boolean; // brand ada di 3 siaran terakhir
}

type SortKey = 'urutan' | 'nama_toko' | 'link_layak' | 'komisi' | 'siaran' | 'status';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;

// Arah sort saat header pertama kali diklik
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  urutan: 'asc',
  nama_toko: 'asc',
  status: 'asc',
  link_layak: 'desc',
  komisi: 'desc',
  siaran: 'desc',
};

const STATUS_RANK: Record<BrandStatus, number> = { BERIKUTNYA: 0, JEDA: 1, ANTRE: 2, DILEWATI: 3, TIDAK_ADA: 4 };

function komisiNum(b: BrandQueueItem): number | null {
  if (b.komisi_mcn_terbaik === null || b.komisi_mcn_terbaik === undefined) return null;
  const n = Number(b.komisi_mcn_terbaik);
  return Number.isNaN(n) ? null : n;
}

function tanggalPendek(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
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
  // Tombol "Lewati" pada baris brand yang akan tayang berikutnya
  onLewati?: (brand: BrandQueueItem) => void;
  // Tombol "Batalkan" di daftar brand yang dilewati
  onBatalkan?: (namaToko: string) => void;
  // Nama brand yang sedang diproses (tombol dinonaktifkan)
  busyBrand?: string | null;
}

export function BrandQueueTable({ rows, onLewati, onBatalkan, busyBrand = null }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('urutan');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  // Brand yang ikut antrean = punya link layak dan tidak dilewati (status ANTRE / BERIKUTNYA / JEDA)
  const antre = useMemo(() => rows.filter((b) => b.status === 'ANTRE' || b.status === 'BERIKUTNYA' || b.status === 'JEDA'), [rows]);
  const tanpaKandidat = useMemo(() => rows.filter((b) => b.status === 'TIDAK_ADA'), [rows]);
  const dilewati = useMemo(() => rows.filter((b) => b.status === 'DILEWATI'), [rows]);
  const totalLayak = useMemo(() => antre.reduce((sum, b) => sum + b.link_layak, 0), [antre]);
  const totalTakLayak = useMemo(() => rows.reduce((sum, b) => sum + b.link_tak_layak, 0), [rows]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const arr = [...antre];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'nama_toko':
          cmp = a.nama_toko.localeCompare(b.nama_toko, 'id', { sensitivity: 'base' });
          break;
        case 'link_layak':
          cmp = a.link_layak - b.link_layak;
          break;
        case 'komisi':
          cmp = (komisiNum(a) ?? -1) - (komisiNum(b) ?? -1);
          break;
        case 'siaran':
          cmp = a.siaran_terkirim - b.siaran_terkirim;
          break;
        case 'status':
          cmp = STATUS_RANK[a.status] - STATUS_RANK[b.status];
          break;
        default:
          cmp = (a.urutan ?? 0) - (b.urutan ?? 0);
      }
      if (cmp !== 0) return cmp * dir;
      return (a.urutan ?? 0) - (b.urutan ?? 0); // seri -> selalu ikuti urutan antrean
    });
    return arr;
  }, [antre, sortKey, sortDir]);

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

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <p className="px-3 pt-3 pb-2 text-[11px] text-gray-500">
        {antre.length} brand layak kirim · {totalLayak} link layak
        {totalTakLayak > 0 ? ` · ${totalTakLayak} link tak layak` : ''}
        {tanpaKandidat.length > 0 ? ` · ${tanpaKandidat.length} brand tanpa kandidat` : ''}
        {dilewati.length > 0 ? ` · ${dilewati.length} brand dilewati` : ''}
      </p>

      {antre.length === 0 ? (
        <p className="border-t border-gray-100 px-3 py-4 text-xs text-gray-400">
          Belum ada brand yang layak kirim (semua link dalam jeda 30 hari, tidak memenuhi syarat, atau brand-nya dilewati).
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-y border-gray-200 bg-gray-50 text-[10px]">
                  {th('urutan', '#', 'left', 'Giliran di antrean (menurut aturan seleksi siaran)')}
                  {th('nama_toko', 'Brand', 'left')}
                  {th('link_layak', 'Layak kirim', 'right', 'Link yang bisa dipilih: di luar jeda 30 hari dan memenuhi minimal 2 dari 3 syarat')}
                  <th scope="col" className="px-2 py-2 text-right font-medium uppercase tracking-wide text-gray-500">
                    <span title="Tidak memenuhi syarat komisi (komisi MCN ≤ 4% dan affiliate ≤ 10%), jadi tidak akan dipilih">
                      Tak layak
                    </span>
                  </th>
                  {th('siaran', 'Siaran', 'right', 'Berapa kali brand ini tampil di siaran Channel (dari histori)')}
                  {th('komisi', 'Komisi MCN', 'right', 'Komisi MCN tertinggi di antara link yang layak kirim')}
                  {th('status', 'Status', 'left')}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageRows.map((b) => {
                  const komisi = komisiNum(b);
                  const terakhir = tanggalPendek(b.terakhir_siaran);
                  return (
                    <tr key={b.nama_toko} className={b.status === 'BERIKUTNYA' ? 'bg-sky-50' : 'hover:bg-gray-50'}>
                      <td
                        className={`border-l-2 px-2 py-1.5 text-gray-400 ${
                          b.status === 'BERIKUTNYA' ? 'border-sky-500' : 'border-transparent'
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
                          className={b.link_layak <= 3 ? 'font-medium text-amber-600' : 'text-gray-900'}
                          title={b.link_layak <= 3 ? 'Hampir habis' : undefined}
                        >
                          {b.link_layak}
                        </span>
                        {b.link_jeda > 0 && (
                          <span className="ml-1 text-gray-400" title="Link yang sudah disiarkan < 30 hari (sedang jeda)">
                            · {b.link_jeda} jeda
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right text-gray-400">
                        {b.link_tak_layak > 0 ? b.link_tak_layak : '–'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right text-gray-500">
                        {b.siaran_terkirim}×{terakhir ? <span className="ml-1 text-gray-400">· {terakhir}</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right text-gray-700">
                        {komisi === null ? '–' : `${komisi}%`}
                      </td>
                      <td className="px-2 py-1.5">
                        {b.status === 'BERIKUTNYA' && (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                              Berikutnya
                            </span>
                            {onLewati && (
                              <button
                                type="button"
                                onClick={() => onLewati(b)}
                                disabled={busyBrand !== null}
                                title="Lewati brand ini supaya slot berikutnya memakai brand lain"
                                className="rounded-md border border-sky-600 bg-white px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-40"
                              >
                                {busyBrand === b.nama_toko ? 'Memproses...' : 'Lewati →'}
                              </button>
                            )}
                          </span>
                        )}
                        {b.status === 'JEDA' && (
                          <span
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                            title="Brand ini ada di 3 siaran terakhir, jadi tidak dipilih dulu"
                          >
                            Jeda
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
            Antrean mengikuti aturan seleksi siaran di database (fungsi broadcast_candidates): jeda 30 hari per produk,
            minimal 2 dari 3 syarat (kadaluarsa &gt; 3 bulan, komisi MCN &gt; 4%, komisi affiliate &gt; 10%), dan brand yang
            ada di 3 siaran terakhir ditandai Jeda sehingga giliran berputar antar brand. Biru = tayang berikutnya.
            Kolom Siaran dihitung dari histori siaran, bukan dari jumlah produk.
          </p>
        </>
      )}

      {tanpaKandidat.length > 0 && (
        <details className="border-t border-gray-200 px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-medium text-gray-600">
            Tanpa kandidat ({tanpaKandidat.length} brand)
          </summary>
          <ul className="mt-2 space-y-1">
            {tanpaKandidat.map((b) => (
              <li key={b.nama_toko} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-gray-700" title={b.nama_toko}>
                  {b.nama_toko}
                </span>
                <span className="shrink-0 text-[10px] text-gray-400">
                  {b.link_tak_layak > 0 ? `${b.link_tak_layak} tak layak` : ''}
                  {b.link_tak_layak > 0 && b.link_jeda > 0 ? ' · ' : ''}
                  {b.link_jeda > 0 ? `${b.link_jeda} jeda` : ''}
                  {b.link_tak_layak === 0 && b.link_jeda === 0 ? 'tidak ada link' : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-gray-400">
            Brand ini tidak punya satu pun link yang bisa dipilih sekarang: komisinya di bawah syarat, atau link-nya sedang
            jeda 30 hari.
          </p>
        </details>
      )}

      {dilewati.length > 0 && (
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-3">
          <p className="mb-2 text-[11px] font-medium text-gray-600">Brand dilewati ({dilewati.length})</p>
          <ul className="space-y-1.5">
            {dilewati.map((b) => (
              <li key={b.nama_toko} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-gray-700" title={b.nama_toko}>
                  {b.nama_toko}
                  <span className="ml-2 text-gray-400">
                    {b.link_ditahan} link layak ditahan · {b.siaran_terkirim}× tayang
                  </span>
                </span>
                {onBatalkan && (
                  <button
                    type="button"
                    onClick={() => onBatalkan(b.nama_toko)}
                    disabled={busyBrand !== null}
                    className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                  >
                    {busyBrand === b.nama_toko ? 'Memproses...' : 'Batalkan'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-gray-400">
            Produk brand ini tidak dipilih untuk siaran sampai dibatalkan (termasuk produk yang sudah pernah tayang). Link
            baru dari brand ini (mis. setelah Sync) ikut dilewati.
          </p>
        </div>
      )}
    </div>
  );
}
