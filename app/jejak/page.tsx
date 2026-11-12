'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RequireAdmin } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { FlowReplay } from '@/components/FlowReplay';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import flows from '@/lib/flow-viewer/flows.json';
import { buildReplay, type TraceStep } from '@/lib/flow-viewer/replay';
import type { FlowData } from '@/lib/flow-viewer/types';

// Peta alur (nama sudah disamarkan), diindeks dengan ID workflow n8n. Dibuat oleh scripts/sanitize.ts proyek flow viewer.
const FLOWS = flows as unknown as Record<string, { title: string; status: string; flow: FlowData }>;
const N8N_BASE = process.env.NEXT_PUBLIC_N8N_BASE_URL || 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id';
const LIMIT = 100;
const REFRESH_SEC = 30;

type Kind = 'aduan' | 'error';
interface TraceRow {
  id: string;
  workflow_id: string;
  execution_id: string;
  kind: Kind;
  ref_id: string | null;
  status: 'success' | 'error';
  started_at: string;
  duration_ms: number | null;
}

const KIND_LABEL: Record<Kind, string> = { aduan: 'Aduan', error: 'Error' };

function formatWib(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDur(ms: number | null) {
  if (ms === null || ms === undefined) return '–';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} dtk` : `${ms} ms`;
}

function JejakContent() {
  const { nomor } = useAuth();
  const params = useSearchParams();
  const aduanParam = params.get('aduan');

  const [rows, setRows] = useState<TraceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [kindF, setKindF] = useState<'semua' | Kind>('semua');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  // Langkah jejak yang sudah dimuat untuk satu baris. null = belum dimuat; steps null = gagal dimuat.
  const [stepsState, setStepsState] = useState<{ id: string; steps: TraceStep[] | null } | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const autoOpened = useRef<string | null>(null);

  const COLS = 'id,workflow_id,execution_id,kind,ref_id,status,started_at,duration_ms';

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('execution_traces')
      .select(COLS)
      .order('started_at', { ascending: false })
      .limit(LIMIT);
    if (error) {
      setLoaded(true);
      return false;
    }
    let list = (data as unknown as TraceRow[]) ?? [];
    if (aduanParam && autoOpened.current !== aduanParam) {
      const hit = await supabase
        .from('execution_traces')
        .select(COLS)
        .eq('kind', 'aduan')
        .eq('ref_id', aduanParam)
        .order('started_at', { ascending: false })
        .limit(1);
      const row = ((hit.data as unknown as TraceRow[]) ?? [])[0];
      if (row) {
        if (!list.some((r) => r.id === row.id)) list = [row, ...list];
        setSelectedId(row.id);
        setNotFound(null);
        autoOpened.current = aduanParam;
      } else {
        setNotFound(aduanParam);
      }
    }
    setRows((prev) => {
      // pertahankan baris yang sedang dibuka walau belum masuk ${LIMIT} terbaru
      const keep = prev.filter((r) => r.id === selectedIdRef.current && !list.some((x) => x.id === r.id));
      return [...list, ...keep];
    });
    setLoaded(true);
    return true;
  }, [aduanParam]);

  const { failed: loadFailed, refreshNow } = useAutoRefresh(load, { intervalMs: REFRESH_SEC * 1000 });

  // Ambil langkah-langkah jejak untuk baris yang dipilih.
  useEffect(() => {
    if (!selectedId) return;
    let batal = false;
    void supabase
      .from('execution_traces')
      .select('steps')
      .eq('id', selectedId)
      .single()
      .then(({ data, error }) => {
        if (batal) return;
        setStepsState({ id: selectedId, steps: error || !data ? null : (data as unknown as { steps: TraceStep[] }).steps });
      });
    return () => {
      batal = true;
    };
  }, [selectedId]);

  const stepsReady = stepsState !== null && stepsState.id === selectedId;
  const steps = stepsReady ? stepsState.steps : null;
  const stepsFailed = stepsReady && stepsState.steps === null;

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);
  const base = selected ? FLOWS[selected.workflow_id] : undefined;

  const replay = useMemo(() => {
    if (!selected || !steps || !base) return null;
    const title = base.title;
    const desc = `${KIND_LABEL[selected.kind]}${selected.ref_id && selected.kind === 'aduan' ? ` ${selected.ref_id}` : ''} · ${formatWib(selected.started_at)} WIB · ${formatDur(selected.duration_ms)}`;
    return buildReplay(base.flow, steps, title, desc);
  }, [selected, steps, base]);

  const tampil = useMemo(() => rows.filter((r) => kindF === 'semua' || r.kind === kindF), [rows, kindF]);

  const chipCls = (aktif: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${aktif ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`;

  return (
    <div className="pt-12 md:pl-56 md:pt-0">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4">
          <h1 className="text-lg font-medium text-gray-900">Jejak Eksekusi</h1>
          <p className="text-sm text-gray-500">
            Putar ulang jalur yang dilalui bot pada satu aduan atau error. Hanya nama langkah, waktu, dan status yang
            disimpan; isi pesan pelanggan tidak ikut.
          </p>
        </div>

        {notFound && (
          <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
            Jejak untuk tiket {notFound} belum tersedia. Jejak hanya direkam untuk tiket yang dibuat setelah fitur ini
            aktif, dan baru muncul sekitar satu menit setelah tiket dibuat.
          </div>
        )}
        {loadFailed && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            Gagal memuat jejak. Muat ulang halaman, atau periksa bahwa akun Anda berperan Super Admin.
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(['semua', 'aduan', 'error'] as const).map((k) => (
            <button key={k} type="button" className={chipCls(kindF === k)} onClick={() => setKindF(k)}>
              {k === 'semua' ? 'Semua' : KIND_LABEL[k]}
            </button>
          ))}
          <button type="button" className={chipCls(false)} onClick={() => void refreshNow()}>
            Muat ulang
          </button>
        </div>

        <div className="mb-6 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white">
          {!loaded ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">Memuat...</p>
          ) : tampil.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              Belum ada jejak. Jejak baru muncul saat ada aduan atau error workflow berikutnya.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tampil.map((r) => {
                const aktif = r.id === selectedId;
                const nama = FLOWS[r.workflow_id]?.title ?? `Workflow ${r.workflow_id}`;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      aria-pressed={aktif}
                      className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left text-sm ${aktif ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                    >
                      <span className="w-28 text-xs text-gray-400">{formatWib(r.started_at)}</span>
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${r.kind === 'aduan' ? 'bg-sky-100 text-sky-700' : 'bg-red-100 text-red-700'}`}
                      >
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span className="text-gray-800">{nama}</span>
                      {r.kind === 'aduan' && r.ref_id && <span className="font-mono text-xs text-gray-500">{r.ref_id}</span>}
                      <span className="ml-auto text-xs text-gray-400">{formatDur(r.duration_ms)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selected && (
          <section aria-live="polite">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
              <span className="font-medium text-gray-900">{base?.title ?? `Workflow ${selected.workflow_id}`}</span>
              <span>Eksekusi {selected.execution_id}</span>
              <a
                className="text-blue-700 underline"
                href={`${N8N_BASE}/workflow/${selected.workflow_id}/executions/${selected.execution_id}`}
                target="_blank"
                rel="noreferrer"
              >
                Buka di n8n
              </a>
            </div>

            {stepsFailed && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                Gagal memuat langkah jejak ini.
              </p>
            )}
            {!stepsReady && <p className="text-sm text-gray-500">Memuat jejak...</p>}

            {steps && replay && (
              <>
                {(replay.unknown > 0 || replay.skipped > 0) && (
                  <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
                    {replay.unknown > 0 &&
                      `${replay.unknown} langkah tidak dikenali di peta alur (alur kemungkinan diubah sejak peta dibuat). `}
                    {replay.skipped > 0 &&
                      `${replay.skipped} langkah tidak bisa disambungkan ke jalur (mis. cabang paralel) dan dilewati dari animasi.`}
                  </p>
                )}
                <FlowReplay flow={replay.flow} errorIds={replay.errorIds} />
              </>
            )}

            {steps && !replay && (
              <div className="rounded-lg border border-gray-200 bg-white">
                <p className="border-b border-gray-100 px-4 py-2 text-xs text-amber-800">
                  {base
                    ? 'Tidak ada langkah yang cocok dengan peta alur, jadi animasi tidak bisa ditampilkan. Daftar langkah:'
                    : 'Alur ini belum ada di peta viewer, jadi animasi tidak bisa ditampilkan. Daftar langkah:'}
                </p>
                <ol className="max-h-80 divide-y divide-gray-100 overflow-y-auto text-sm">
                  {[...steps]
                    .sort((a, b) => a.r - b.r)
                    .map((s) => (
                      <li key={s.r} className="flex items-center gap-3 px-4 py-1.5">
                        <span className="w-8 text-right text-xs text-gray-400">{s.r + 1}</span>
                        <span className={s.s === 'error' ? 'text-red-700' : 'text-gray-800'}>{s.n}</span>
                        <span className="ml-auto text-xs text-gray-400">{formatDur(s.d)}</span>
                      </li>
                    ))}
                </ol>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default function JejakPage() {
  return (
    <RequireAdmin>
      <Suspense fallback={null}>
        <JejakContent />
      </Suspense>
    </RequireAdmin>
  );
}
