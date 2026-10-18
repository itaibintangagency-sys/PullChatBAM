'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { RefreshBar } from '@/components/RefreshBar';
import { SkeletonRow } from '@/components/Skeleton';
import { useAuth } from '@/lib/AuthContext';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import { supabase } from '@/lib/supabase';
import {
  BOT_OPTIONS,
  COLUMN_DEFS,
  DEFAULT_FILTER,
  DEFAULT_SORT,
  DEFAULT_VIEW,
  ESKALASI_COLUMNS,
  FIRST_DIR,
  JENIS_OPTIONS,
  NONE_KEY,
  PAGE_SIZES,
  STATUS_LABEL,
  UMUR_OPTIONS,
  adaFilterAktif,
  aliasTokens,
  applyFilters,
  botLabel,
  buildNameMap,
  buildPageNumbers,
  buildQuery,
  defaultColumns,
  formatDurasi,
  formatWib,
  hitungStatus,
  jenisLabel,
  parseQuery,
  penerimaLabel,
  ringkasPenerima,
  sanitizeColumns,
  sortRows,
  statusOf,
  toCsv,
  toMs,
  umurMs,
  wibStamp,
} from '@/lib/eskalasi';
import type {
  ColumnKey,
  EskalasiRow,
  FilterState,
  NameMap,
  RentangFilter,
  SortKey,
  SortSpec,
  StatusFilter,
  StatusKey,
  ViewState,
} from '@/lib/eskalasi';

const FETCH_PAGE = 1000; // batas baris per permintaan di API Supabase
const OPEN_CAP = 20_000; // pengaman: tiket belum selesai selalu dimuat penuh
const RESOLVED_CAP = 4_000; // tiket selesai: yang terbaru saja
const REFRESH_SEC = 30;
const COLS_KEY = 'kirana_eskalasi_cols';
const DAY_MS = 86_400_000;

interface PageResult {
  data: unknown[] | null;
  error: unknown;
}

// Mengambil data per 1000 baris sampai habis (atau batas pengaman), supaya tidak terpotong diam-diam di 1000 baris.
async function fetchPaged(build: (from: number, to: number) => PromiseLike<PageResult>, cap: number) {
  const out: EskalasiRow[] = [];
  for (let from = 0; from < cap; from += FETCH_PAGE) {
    const to = Math.min(from + FETCH_PAGE, cap) - 1;
    const { data, error } = await build(from, to);
    if (error) return null;
    const rows = (data as EskalasiRow[] | null) ?? [];
    out.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return out;
}

function fetchBelumSelesai() {
  return fetchPaged(async (from, to) => {
    const res = await supabase
      .from('escalations')
      .select(ESKALASI_COLUMNS)
      .or('status.is.null,status.in.(OPEN,PENDING)')
      .order('created_at', { ascending: true })
      .order('id')
      .range(from, to);
    return { data: res.data as unknown as unknown[] | null, error: res.error };
  }, OPEN_CAP);
}

function fetchSelesai() {
  return fetchPaged(async (from, to) => {
    const res = await supabase
      .from('escalations')
      .select(ESKALASI_COLUMNS)
      .not('status', 'is', null)
      .not('status', 'in', '(OPEN,PENDING)')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to);
    return { data: res.data as unknown as unknown[] | null, error: res.error };
  }, RESOLVED_CAP);
}

async function fetchNames(): Promise<NameMap | null> {
  const { data, error } = await supabase.rpc('staff_alias_directory');
  if (error) return null;
  return buildNameMap(
    (data as { escalation_alias: string; display_name: string; pool: string | null; active: boolean | null }[] | null) ?? []
  );
}

/* --------------------------------- tampilan kecil --------------------------------- */

function statusBadge(st: StatusKey) {
  const cls =
    st === 'OPEN' ? 'bg-amber-100 text-amber-700' : st === 'PENDING' ? 'bg-sky-100 text-sky-700' : 'bg-green-100 text-green-700';
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{STATUS_LABEL[st]}</span>;
}

function botBadge(bot: string | null) {
  const cls =
    bot === '1052'
      ? 'bg-blue-100 text-blue-700'
      : bot === '7484'
      ? 'bg-purple-100 text-purple-700'
      : bot
      ? 'bg-pink-100 text-pink-700'
      : 'bg-gray-100 text-gray-500';
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{botLabel(bot)}</span>;
}

function prioritasBadge(p: string | null) {
  const map: Record<string, string> = { HIGH: 'bg-red-100 text-red-700', MEDIUM: 'bg-amber-100 text-amber-700', LOW: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${map[String(p || '').toUpperCase()] || 'bg-gray-100 text-gray-500'}`}>{p || '-'}</span>;
}

// Warna umur: makin lama makin merah (hanya untuk tiket belum selesai)
function umurClass(ms: number, selesai: boolean) {
  if (selesai) return 'text-gray-500';
  if (ms >= 30 * DAY_MS) return 'font-semibold text-red-700';
  if (ms >= 7 * DAY_MS) return 'font-medium text-red-600';
  if (ms >= 3 * DAY_MS) return 'font-medium text-amber-600';
  return 'text-gray-700';
}

function samaHimpunan(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/* ----------------------------------- halaman ----------------------------------- */

function EskalasiContent() {
  const { nomor, profile } = useAuth();
  const myAlias = (profile?.escalation_alias || '').toUpperCase();

  const [rows, setRows] = useState<EskalasiRow[]>([]);
  const [names, setNames] = useState<NameMap>(() => new Map());
  const [namesFailed, setNamesFailed] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [autoOn, setAutoOn] = useState(true);

  // Keadaan awal dibaca dari URL (tautan yang dibagikan) dan localStorage (kolom pilihan).
  // Komponen ini baru tampil setelah RequireAuth selesai memuat sesi (di browser), jadi aman memakai window di sini.
  const [awal] = useState<ViewState>(() =>
    typeof window === 'undefined' ? DEFAULT_VIEW : parseQuery(window.location.search)
  );
  const [filter, setFilter] = useState<FilterState>(awal.filter);
  const [sort, setSort] = useState<SortSpec>(awal.sort);
  const [page, setPage] = useState(awal.page);
  const [size, setSize] = useState<number>(awal.size);
  const [qInput, setQInput] = useState(awal.filter.q);
  const [columns, setColumns] = useState<ColumnKey[]>(() => {
    if (typeof window === 'undefined') return defaultColumns();
    try {
      const raw = localStorage.getItem(COLS_KEY);
      return raw ? sanitizeColumns(JSON.parse(raw)) : defaultColumns();
    } catch {
      return defaultColumns();
    }
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const penerimaRef = useRef<HTMLDetailsElement>(null);
  const kolomRef = useRef<HTMLDetailsElement>(null);

  const load = useCallback(async (): Promise<boolean> => {
    const [belumSelesai, selesai, nm] = await Promise.all([fetchBelumSelesai(), fetchSelesai(), fetchNames()]);
    if (!belumSelesai || !selesai) return false;

    const byId = new Map<string, EskalasiRow>();
    for (const r of [...belumSelesai, ...selesai]) byId.set(r.id, r);
    setRows(Array.from(byId.values()));
    setTruncated(selesai.length >= RESOLVED_CAP);
    if (nm) {
      setNames(nm);
      setNamesFailed(false);
    } else {
      setNamesFailed(true);
    }
    setNow(Date.now());
    setLoadedOnce(true);
    return true;
  }, []);

  const { lastUpdated, refreshing, failed, refreshNow } = useAutoRefresh(load, {
    intervalMs: REFRESH_SEC * 1000,
    enabled: autoOn,
  });

  // Tulis state ke URL (tanpa menambah riwayat browser)
  useEffect(() => {
    const qs = buildQuery({ filter, sort, page, size });
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }, [filter, sort, page, size]);

  // Pencarian ditunda 300 ms supaya tidak menyaring di setiap ketikan
  useEffect(() => {
    const t = setTimeout(() => {
      setFilter((f) => (f.q === qInput ? f : { ...f, q: qInput }));
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  // Tutup menu pilihan (penerima / kolom) saat klik di luar
  useEffect(() => {
    function onDown(e: MouseEvent) {
      for (const ref of [penerimaRef, kolomRef]) {
        const el = ref.current;
        if (el && el.open && !el.contains(e.target as Node)) el.open = false;
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  /* ------------------------------- data turunan ------------------------------- */

  const filtered = useMemo(() => applyFilters(rows, filter, now, names), [rows, filter, now, names]);
  const sorted = useMemo(() => sortRows(filtered, sort, now, names), [filtered, sort, now, names]);
  const counts = useMemo(() => hitungStatus(rows, filter, now, names), [rows, filter, now, names]);
  const ringkas = useMemo(() => ringkasPenerima(rows, now, names), [rows, now, names]);
  const belumSelesai = useMemo(() => rows.filter((r) => statusOf(r) !== 'RESOLVE').length, [rows]);

  const penerimaOptions = useMemo(() => {
    const set = new Set<string>();
    names.forEach((v, k) => {
      if (v.pool) set.add(k);
    });
    for (const r of rows) aliasTokens(r.assigned_to).forEach((t) => set.add(t));
    return Array.from(set)
      .map((alias) => {
        const nama = names.get(alias)?.nama;
        return { alias, label: nama && nama.toUpperCase() !== alias ? `${nama} (${alias})` : alias };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'id'));
  }, [names, rows]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / size));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * size;
  const pageRows = sorted.slice(startIdx, startIdx + size);
  const visibleCols = COLUMN_DEFS.filter((c) => columns.includes(c.key));

  /* --------------------------------- aksi --------------------------------- */

  function patchFilter(p: Partial<FilterState>) {
    setFilter((f) => ({ ...f, ...p }));
    setPage(1);
    setExpandedId(null);
  }

  function resetFilter() {
    setFilter(DEFAULT_FILTER);
    setQInput('');
    setPage(1);
    setExpandedId(null);
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: FIRST_DIR[key] }));
    setPage(1);
  }

  function togglePenerima(alias: string) {
    const ada = filter.penerima.includes(alias);
    patchFilter({ penerima: ada ? filter.penerima.filter((a) => a !== alias) : [...filter.penerima, alias] });
  }

  function toggleKolom(key: ColumnKey) {
    const next = columns.includes(key) ? columns.filter((k) => k !== key) : [...columns, key];
    const clean = sanitizeColumns(next);
    setColumns(clean);
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(clean));
    } catch {
      /* abaikan */
    }
  }

  function exportCsv() {
    const csv = toCsv(sorted, Date.now(), names);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `eskalasi-${wibStamp(Date.now()).replace(/[: ]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function ariaSort(key: SortKey | null): 'ascending' | 'descending' | 'none' | undefined {
    if (!key) return undefined;
    if (sort.key !== key) return 'none';
    return sort.dir === 'asc' ? 'ascending' : 'descending';
  }

  /* ------------------------------ isi sel & rincian ------------------------------ */

  function renderCell(r: EskalasiRow, key: ColumnKey): ReactNode {
    const st = statusOf(r);
    switch (key) {
      case 'masuk': {
        const c = toMs(r.created_at);
        if (c === null) return <span className="text-gray-400">–</span>;
        const w = formatWib(c);
        return (
          <>
            <span className="block text-gray-800">{w.tanggal}</span>
            <span className="block text-xs text-gray-400">{w.jam} WIB</span>
          </>
        );
      }
      case 'umur': {
        const u = umurMs(r, now);
        if (u === null) return <span className="text-gray-400">–</span>;
        return <span className={umurClass(u, st === 'RESOLVE')}>{formatDurasi(u)}</span>;
      }
      case 'nama':
        return (
          <>
            <span className="block font-medium text-gray-900">{r.nama || r.nomor_wa}</span>
            {r.nama && <span className="block text-xs text-gray-400">{r.nomor_wa}</span>}
          </>
        );
      case 'jenis':
        return <span className="text-gray-700">{jenisLabel(r.category, r.sub_category)}</span>;
      case 'penerima': {
        const toks = aliasTokens(r.assigned_to);
        if (toks.length === 0) return <span className="font-medium text-red-600">Belum ditugaskan</span>;
        const nonaktif = toks.some((t) => names.get(t) && names.get(t)?.active === false);
        return (
          <span title={toks.join(', ')} className="text-gray-800">
            {penerimaLabel(r.assigned_to, names)}
            {nonaktif && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">nonaktif</span>}
          </span>
        );
      }
      case 'status':
        return statusBadge(st);
      case 'selesai': {
        const rs = toMs(r.resolved_at);
        if (st !== 'RESOLVE' || rs === null) return <span className="text-gray-300">—</span>;
        const w = formatWib(rs);
        return (
          <>
            <span className="block text-gray-800">{w.tanggal}</span>
            <span className="block text-xs text-gray-400">{w.jam} WIB</span>
          </>
        );
      }
      case 'bot':
        return botBadge(r.bot_source);
      case 'prioritas':
        return prioritasBadge(r.priority);
      case 'tiket':
        return <span className="font-mono text-xs text-gray-500">{r.ticket_id}</span>;
      default:
        return null;
    }
  }

  function renderDetail(r: EskalasiRow) {
    const st = statusOf(r);
    const rs = toMs(r.resolved_at);
    const catatan = r.customer_issue || r.data_notes;
    const waOk = /^\d{8,15}$/.test(r.nomor_wa || '');
    const bisaResolve = st !== 'RESOLVE' && (r.bot_source === '1052' || r.bot_source === '7484');
    return (
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-xs text-gray-400">ID tiket</dt>
          <dd className="font-mono text-xs text-gray-700">{r.ticket_id}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-400">Nomor WA</dt>
          <dd className="text-gray-700">
            {r.nomor_wa}
            {waOk && (
              <a
                href={`https://wa.me/${r.nomor_wa}`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 text-blue-600 hover:underline"
              >
                Buka WhatsApp
              </a>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-400">Alias penerima (di tiket)</dt>
          <dd className="text-gray-700">{r.assigned_to || '—'}</dd>
        </div>
        {r.previous_assigned && (
          <div>
            <dt className="text-xs text-gray-400">Penerima sebelumnya</dt>
            <dd className="text-gray-700">
              {r.previous_assigned}
              {toMs(r.reassigned_at) !== null && (
                <span className="text-xs text-gray-400"> · dialihkan {formatWib(toMs(r.reassigned_at) as number).tanggal}</span>
              )}
            </dd>
          </div>
        )}
        {st === 'RESOLVE' && rs !== null && (
          <div>
            <dt className="text-xs text-gray-400">Selesai</dt>
            <dd className="text-gray-700">
              {formatWib(rs).tanggal}, {formatWib(rs).jam} WIB
              {umurMs(r, now) !== null && <span className="text-xs text-gray-400"> · durasi {formatDurasi(umurMs(r, now) as number)}</span>}
            </dd>
          </div>
        )}
        {catatan && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs text-gray-400">Catatan</dt>
            <dd className="whitespace-pre-wrap text-gray-700">{catatan}</dd>
          </div>
        )}
        {r.store_link && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs text-gray-400">Tautan</dt>
            <dd>
              <a href={r.store_link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                Buka tautan
              </a>
            </dd>
          </div>
        )}
        <div className="sm:col-span-2 lg:col-span-3">
          {bisaResolve ? (
            <Link href={`/${r.bot_source}/escalations`} className="text-sm text-blue-600 hover:underline">
              Buka di halaman Eskalasi {r.bot_source} untuk menandai selesai
            </Link>
          ) : st !== 'RESOLVE' ? (
            <span className="text-xs text-gray-400">
              Tiket ini berasal dari bot yang tidak punya halaman Eskalasi sendiri, jadi belum bisa ditandai selesai dari Monitor.
            </span>
          ) : null}
        </div>
      </dl>
    );
  }

  /* ----------------------------------- render ----------------------------------- */

  const statusTabs: { key: StatusFilter; label: string; n: number }[] = [
    { key: 'OPEN', label: 'Terbuka', n: counts.OPEN },
    { key: 'PENDING', label: 'Menunggu', n: counts.PENDING },
    { key: 'RESOLVE', label: 'Selesai', n: counts.RESOLVE },
    { key: 'ALL', label: 'Semua', n: counts.ALL },
  ];
  const selectCls = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-gray-500';
  const chipCls = (aktif: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${aktif ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`;
  const popCls = 'absolute z-20 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg';
  const summaryCls = 'cursor-pointer list-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50';

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-medium text-gray-900">Tabel Eskalasi</h1>
            <p className="text-sm text-gray-500">
              {loadedOnce
                ? `${sorted.length.toLocaleString('id-ID')} tiket sesuai filter · ${belumSelesai.toLocaleString('id-ID')} belum selesai · semua bot`
                : 'Memuat tiket...'}
            </p>
          </div>
          <RefreshBar
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            failed={failed}
            autoOn={autoOn}
            intervalSec={REFRESH_SEC}
            onToggle={() => setAutoOn((v) => !v)}
            onRefresh={() => void refreshNow()}
          />
        </div>

        {failed && !loadedOnce && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            Gagal memuat tiket. Coba tekan Refresh, atau muat ulang halaman.
          </div>
        )}
        {namesFailed && (
          <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Nama staf belum bisa dimuat, jadi kolom Penerima sementara menampilkan alias.
          </div>
        )}
        {truncated && (
          <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Yang ditampilkan: semua tiket belum selesai, dan {RESOLVED_CAP.toLocaleString('id-ID')} tiket selesai terbaru. Tiket selesai yang lebih lama tidak
            ikut dimuat.
          </div>
        )}

        {/* Ringkasan per penerima */}
        {loadedOnce && ringkas.length > 0 && (
          <section aria-label="Ringkasan per penerima" className="mb-4">
            <p className="mb-2 text-xs font-medium text-gray-500">Tiket terbuka per penerima (klik untuk memfilter)</p>
            <div className="flex flex-wrap gap-2">
              {ringkas.slice(0, 10).map((g) => {
                const target = g.tokens.length ? g.tokens : [NONE_KEY];
                const aktif = filter.status === 'OPEN' && samaHimpunan(filter.penerima, target);
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => (aktif ? patchFilter({ penerima: [] }) : patchFilter({ penerima: target, status: 'OPEN' }))}
                    aria-pressed={aktif}
                    className={`min-w-[7.5rem] rounded-xl border px-3 py-2 text-left ${
                      aktif ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <span className={`block truncate text-xs font-medium ${aktif ? 'text-gray-200' : 'text-gray-500'}`}>{g.label}</span>
                    <span className="block text-lg font-semibold leading-tight">{g.open}</span>
                    <span className={`block text-[11px] ${aktif ? 'text-gray-300' : g.tertuaMs >= 7 * DAY_MS ? 'text-red-500' : 'text-gray-400'}`}>
                      tertua {formatDurasi(g.tertuaMs)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Filter */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {statusTabs.map((s) => (
            <button key={s.key} type="button" onClick={() => patchFilter({ status: s.key })} aria-pressed={filter.status === s.key} className={chipCls(filter.status === s.key)}>
              {s.label} <span className={filter.status === s.key ? 'text-gray-300' : 'text-gray-400'}>{s.n.toLocaleString('id-ID')}</span>
            </button>
          ))}
          {myAlias && (
            <>
              <span className="mx-1 text-gray-300">|</span>
              <button
                type="button"
                onClick={() => (samaHimpunan(filter.penerima, [myAlias]) ? patchFilter({ penerima: [] }) : patchFilter({ penerima: [myAlias] }))}
                aria-pressed={samaHimpunan(filter.penerima, [myAlias])}
                className={chipCls(samaHimpunan(filter.penerima, [myAlias]))}
              >
                Tiket saya
              </button>
            </>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label="Cari nama, nomor, ID tiket, atau penerima"
            placeholder="Cari nama, nomor, tiket, penerima..."
            value={qInput}
            onChange={(e) => {
              setQInput(e.target.value);
              setPage(1);
            }}
            className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
          />

          <details ref={penerimaRef} className="relative">
            <summary className={summaryCls}>
              Penerima{filter.penerima.length > 0 ? ` (${filter.penerima.length})` : ''}
            </summary>
            <div className={popCls}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                <input type="checkbox" checked={filter.penerima.includes(NONE_KEY)} onChange={() => togglePenerima(NONE_KEY)} />
                <span className="text-red-600">Belum ditugaskan</span>
              </label>
              {penerimaOptions.map((o) => (
                <label key={o.alias} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                  <input type="checkbox" checked={filter.penerima.includes(o.alias)} onChange={() => togglePenerima(o.alias)} />
                  <span className="truncate text-gray-700">{o.label}</span>
                </label>
              ))}
              {filter.penerima.length > 0 && (
                <button type="button" onClick={() => patchFilter({ penerima: [] })} className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-gray-500 hover:bg-gray-50">
                  Hapus pilihan
                </button>
              )}
            </div>
          </details>

          <select aria-label="Jenis" value={filter.jenis} onChange={(e) => patchFilter({ jenis: e.target.value })} className={selectCls}>
            <option value="ALL">Semua jenis</option>
            {JENIS_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>

          <select aria-label="Bot" value={filter.bot} onChange={(e) => patchFilter({ bot: e.target.value })} className={selectCls}>
            <option value="ALL">Semua bot</option>
            {BOT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>

          <select aria-label="Rentang waktu masuk" value={filter.rentang} onChange={(e) => patchFilter({ rentang: e.target.value as RentangFilter })} className={selectCls}>
            <option value="ALL">Semua waktu</option>
            <option value="TODAY">Hari ini</option>
            <option value="7D">7 hari terakhir</option>
            <option value="30D">30 hari terakhir</option>
            <option value="CUSTOM">Pilih tanggal...</option>
          </select>
          {filter.rentang === 'CUSTOM' && (
            <>
              <input type="date" aria-label="Dari tanggal" value={filter.dari} max={filter.sampai || undefined} onChange={(e) => patchFilter({ dari: e.target.value })} className={selectCls} />
              <span className="text-gray-400">–</span>
              <input type="date" aria-label="Sampai tanggal" value={filter.sampai} min={filter.dari || undefined} onChange={(e) => patchFilter({ sampai: e.target.value })} className={selectCls} />
            </>
          )}

          <select aria-label="Umur tiket belum selesai" value={filter.umur} onChange={(e) => patchFilter({ umur: Number(e.target.value) })} className={selectCls}>
            {UMUR_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u === 0 ? 'Semua umur' : `Belum selesai ≥ ${u} hari`}
              </option>
            ))}
          </select>

          {adaFilterAktif(filter) && (
            <button type="button" onClick={resetFilter} className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-800">
              Reset filter
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {sort.key !== 'default' && (
              <button type="button" onClick={() => setSort(DEFAULT_SORT)} className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-800">
                Urutan bawaan
              </button>
            )}
            <details ref={kolomRef} className="relative">
              <summary className={summaryCls}>Kolom</summary>
              <div className={`${popCls} right-0`}>
                {COLUMN_DEFS.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                    <input type="checkbox" checked={columns.includes(c.key)} onChange={() => toggleKolom(c.key)} />
                    <span className="text-gray-700">{c.label}</span>
                  </label>
                ))}
              </div>
            </details>
            <button
              type="button"
              onClick={exportCsv}
              disabled={sorted.length === 0}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Ekspor CSV
            </button>
          </div>
        </div>

        {/* Isi */}
        {!loadedOnce && !failed ? (
          <div className="rounded-xl border border-gray-200 bg-white">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center">
            <p className="text-sm text-gray-500">Tidak ada tiket yang cocok dengan filter ini.</p>
            {adaFilterAktif(filter) && (
              <button type="button" onClick={resetFilter} className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Reset filter
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Tabel (layar lebar) */}
            <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white md:block">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <tr>
                    {visibleCols.map((c) => (
                      <th key={c.key} scope="col" aria-sort={ariaSort(c.sortKey)} className="whitespace-nowrap px-3 py-2 font-medium">
                        {c.sortKey ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.sortKey as SortKey)}
                            className="inline-flex items-center gap-1 rounded hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-400"
                          >
                            {c.label}
                            <span aria-hidden="true" className={sort.key === c.sortKey ? 'text-gray-900' : 'text-gray-300'}>
                              {sort.key === c.sortKey ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                            </span>
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    ))}
                    <th scope="col" className="w-10 px-2 py-2">
                      <span className="sr-only">Rincian</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageRows.map((r) => {
                    const expanded = expandedId === r.id;
                    return (
                      <FragmentRow key={r.id}>
                        <tr
                          onClick={() => setExpandedId(expanded ? null : r.id)}
                          className={`cursor-pointer align-top hover:bg-gray-50 ${expanded ? 'bg-gray-50' : ''}`}
                        >
                          {visibleCols.map((c) => (
                            <td key={c.key} className="px-3 py-2.5">
                              {renderCell(r, c.key)}
                            </td>
                          ))}
                          <td className="px-2 py-2.5 text-right">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-label={expanded ? 'Tutup rincian' : 'Buka rincian'}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedId(expanded ? null : r.id);
                              }}
                              className="rounded px-1.5 text-gray-400 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-400"
                            >
                              <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={visibleCols.length + 1} className="px-4 pb-4 pt-1">
                              {renderDetail(r)}
                            </td>
                          </tr>
                        )}
                      </FragmentRow>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Kartu (layar sempit) */}
            <div className="space-y-2 md:hidden">
              {pageRows.map((r) => {
                const expanded = expandedId === r.id;
                const st = statusOf(r);
                const u = umurMs(r, now);
                const c = toMs(r.created_at);
                return (
                  <div key={r.id} className="rounded-xl border border-gray-200 bg-white">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                      className="block w-full px-3 py-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{r.nama || r.nomor_wa}</p>
                          <p className="text-xs text-gray-500">{jenisLabel(r.category, r.sub_category)}</p>
                        </div>
                        {statusBadge(st)}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className={aliasTokens(r.assigned_to).length === 0 ? 'font-medium text-red-600' : 'text-gray-700'}>
                          {penerimaLabel(r.assigned_to, names)}
                        </span>
                        {u !== null && <span className={umurClass(u, st === 'RESOLVE')}>{st === 'RESOLVE' ? 'durasi ' : ''}{formatDurasi(u)}</span>}
                        {c !== null && (
                          <span>
                            {formatWib(c).tanggal}, {formatWib(c).jam}
                          </span>
                        )}
                        {botBadge(r.bot_source)}
                      </div>
                    </button>
                    {expanded && <div className="border-t border-gray-100 px-3 py-3">{renderDetail(r)}</div>}
                  </div>
                );
              })}
            </div>

            {/* Paginasi */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
              <span>
                Menampilkan {(startIdx + 1).toLocaleString('id-ID')}–{Math.min(startIdx + size, sorted.length).toLocaleString('id-ID')} dari{' '}
                {sorted.length.toLocaleString('id-ID')}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5">
                  <span>Baris</span>
                  <select
                    aria-label="Baris per halaman"
                    value={size}
                    onChange={(e) => {
                      setSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <nav aria-label="Halaman" className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, safePage - 1))}
                    disabled={safePage <= 1}
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    ‹
                  </button>
                  {buildPageNumbers(safePage, totalPages).map((p, i) =>
                    p === '…' ? (
                      <span key={`gap-${i}`} className="px-1 text-gray-400">
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        aria-current={p === safePage ? 'page' : undefined}
                        className={`rounded-lg px-2.5 py-1 ${p === safePage ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                    disabled={safePage >= totalPages}
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    ›
                  </button>
                </nav>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// <tbody> hanya boleh berisi <tr>; Fragment dipakai untuk pasangan baris data + baris rincian.
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default function EskalasiPage() {
  return (
    <RequireAuth>
      <EskalasiContent />
    </RequireAuth>
  );
}
