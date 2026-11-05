'use client';

import { useCallback, useMemo, useState } from 'react';
import { RequireAdmin } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { RefreshBar } from '@/components/RefreshBar';
import { useAuth } from '@/lib/AuthContext';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import { supabase } from '@/lib/supabase';

type AduanStatus = 'BARU' | 'DIPROSES' | 'SELESAI' | 'DITOLAK';
type AduanJenis = 'ADUAN' | 'LOWONGAN' | 'LAINNYA';

interface AduanRow {
  id: string;
  ticket_id: string;
  created_at: string;
  updated_at: string | null;
  jenis: AduanJenis;
  sub_jenis: string | null;
  sumber: string;
  nomor_wa: string | null;
  nama: string | null;
  platform_user_id: string | null;
  isi: string;
  lampiran: { url?: string }[] | null;
  status: AduanStatus;
  assigned_to: string | null;
  email_status: 'BELUM' | 'TERKIRIM' | 'GAGAL';
  email_sent_at: string | null;
  email_error: string | null;
  resolved_at: string | null;
  catatan: string | null;
}

const COLUMNS =
  'id,ticket_id,created_at,updated_at,jenis,sub_jenis,sumber,nomor_wa,nama,platform_user_id,isi,lampiran,status,assigned_to,email_status,email_sent_at,email_error,resolved_at,catatan';
const LIMIT = 1000;
const REFRESH_SEC = 30;

const STATUS_LABEL: Record<AduanStatus, string> = {
  BARU: 'Baru',
  DIPROSES: 'Diproses',
  SELESAI: 'Selesai',
  DITOLAK: 'Ditolak',
};
const JENIS_LABEL: Record<AduanJenis, string> = { ADUAN: 'Aduan', LOWONGAN: 'Lowongan', LAINNYA: 'Keperluan lain' };
const SUMBER_LABEL: Record<string, string> = {
  WA_7484: 'WA 7484',
  WA_1052: 'WA 1052',
  IG: 'Instagram',
  FB: 'Facebook',
  WEB: 'Web',
};

function formatWib(iso: string | null) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(st: AduanStatus) {
  const cls =
    st === 'BARU'
      ? 'bg-amber-100 text-amber-700'
      : st === 'DIPROSES'
      ? 'bg-sky-100 text-sky-700'
      : st === 'SELESAI'
      ? 'bg-green-100 text-green-700'
      : 'bg-gray-100 text-gray-600';
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{STATUS_LABEL[st]}</span>;
}

function emailBadge(row: AduanRow) {
  if (row.email_status === 'TERKIRIM') return <span className="text-xs text-green-700">Email terkirim</span>;
  if (row.email_status === 'GAGAL')
    return <span className="text-xs font-medium text-red-600">Email GAGAL</span>;
  return <span className="text-xs text-amber-600">Email belum terkirim</span>;
}

function AduanContent() {
  const { nomor } = useAuth();
  const [rows, setRows] = useState<AduanRow[]>([]);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [autoOn, setAutoOn] = useState(true);
  const [statusF, setStatusF] = useState<'AKTIF' | 'SEMUA' | AduanStatus>('AKTIF');
  const [jenisF, setJenisF] = useState<'SEMUA' | AduanJenis>('SEMUA');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('aduan_tickets')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (error) return false;
    setRows((data as unknown as AduanRow[]) ?? []);
    setLoadedOnce(true);
    return true;
  }, []);

  const { lastUpdated, refreshing, failed, refreshNow } = useAutoRefresh(load, {
    intervalMs: REFRESH_SEC * 1000,
    enabled: autoOn,
  });

  const hitung = useMemo(() => {
    const c = { BARU: 0, DIPROSES: 0, SELESAI: 0, DITOLAK: 0, emailGagal: 0 };
    for (const r of rows) {
      c[r.status] += 1;
      if (r.email_status === 'GAGAL' && (r.status === 'BARU' || r.status === 'DIPROSES')) c.emailGagal += 1;
    }
    return c;
  }, [rows]);

  const tampil = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusF === 'AKTIF' && !(r.status === 'BARU' || r.status === 'DIPROSES')) return false;
      if (statusF !== 'AKTIF' && statusF !== 'SEMUA' && r.status !== statusF) return false;
      if (jenisF !== 'SEMUA' && r.jenis !== jenisF) return false;
      if (!needle) return true;
      return [r.ticket_id, r.nama, r.nomor_wa, r.isi, r.platform_user_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, statusF, jenisF, q]);

  async function ubah(row: AduanRow, status: AduanStatus) {
    setBusy(row.id);
    setMsg(null);
    const selesai = status === 'SELESAI' || status === 'DITOLAK';
    const patch: Record<string, unknown> = {
      status,
      resolved_at: selesai ? new Date().toISOString() : null,
    };
    const catatan = draft[row.id];
    if (catatan !== undefined) patch.catatan = catatan.trim() || null;
    const { error } = await supabase.from('aduan_tickets').update(patch).eq('id', row.id);
    setBusy(null);
    if (error) {
      setMsg({
        ok: false,
        text:
          error.message.includes('aduan_tickets_satu_terbuka') || error.code === '23505'
            ? 'Gagal: sudah ada tiket terbuka lain untuk nomor ini.'
            : 'Gagal menyimpan perubahan. Coba lagi.',
      });
      return;
    }
    setMsg({ ok: true, text: `Tiket ${row.ticket_id} → ${STATUS_LABEL[status]}.` });
    await refreshNow();
  }

  async function simpanCatatan(row: AduanRow) {
    const catatan = (draft[row.id] ?? row.catatan ?? '').trim();
    setBusy(row.id);
    setMsg(null);
    const { error } = await supabase
      .from('aduan_tickets')
      .update({ catatan: catatan || null })
      .eq('id', row.id);
    setBusy(null);
    setMsg(error ? { ok: false, text: 'Gagal menyimpan catatan.' } : { ok: true, text: 'Catatan disimpan.' });
    if (!error) await refreshNow();
  }

  const chipCls = (aktif: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${aktif ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`;

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-medium text-gray-900">Aduan & Keperluan Lain</h1>
            <p className="text-sm text-gray-500">
              {loadedOnce
                ? `${hitung.BARU} baru · ${hitung.DIPROSES} diproses · ${hitung.SELESAI + hitung.DITOLAK} selesai/ditolak`
                : 'Memuat tiket...'}
              {rows.length >= LIMIT ? ` · menampilkan ${LIMIT} terbaru` : ''}
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

        {hitung.emailGagal > 0 && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {hitung.emailGagal} tiket aktif gagal dikirim ke email. Periksa kredensial Gmail di n8n, lalu teruskan manual
            dari halaman ini.
          </div>
        )}
        {failed && !loadedOnce && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            Gagal memuat tiket. Coba tekan Refresh, atau muat ulang halaman.
          </div>
        )}
        {msg && (
          <div
            className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
            role="status"
          >
            {msg.text}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(['AKTIF', 'SEMUA', 'BARU', 'DIPROSES', 'SELESAI', 'DITOLAK'] as const).map((s) => (
            <button key={s} type="button" className={chipCls(statusF === s)} onClick={() => setStatusF(s)}>
              {s === 'AKTIF' ? 'Aktif' : s === 'SEMUA' ? 'Semua' : STATUS_LABEL[s]}
            </button>
          ))}
          <select
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
            value={jenisF}
            onChange={(e) => setJenisF(e.target.value as 'SEMUA' | AduanJenis)}
            aria-label="Filter jenis"
          >
            <option value="SEMUA">Semua jenis</option>
            <option value="ADUAN">Aduan</option>
            <option value="LOWONGAN">Lowongan</option>
            <option value="LAINNYA">Keperluan lain</option>
          </select>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari tiket, nama, nomor, isi..."
            className="min-w-[14rem] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {tampil.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">
              {loadedOnce ? 'Tidak ada tiket yang sesuai filter.' : 'Memuat...'}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tampil.map((r) => {
                const terbuka = openId === r.id;
                const catatanVal = draft[r.id] ?? r.catatan ?? '';
                const aktif = r.status === 'BARU' || r.status === 'DIPROSES';
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(terbuka ? null : r.id)}
                      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-gray-50"
                      aria-expanded={terbuka}
                    >
                      <span className="font-mono text-sm text-gray-900">{r.ticket_id}</span>
                      {statusBadge(r.status)}
                      <span className="text-sm text-gray-700">
                        {JENIS_LABEL[r.jenis]}
                        {r.sub_jenis ? ` · ${r.sub_jenis}` : ''}
                      </span>
                      <span className="text-sm text-gray-500">{r.nama || r.nomor_wa || r.platform_user_id || '–'}</span>
                      <span className="text-xs text-gray-400">{SUMBER_LABEL[r.sumber] ?? r.sumber}</span>
                      <span className="ml-auto text-xs text-gray-400">{formatWib(r.created_at)}</span>
                    </button>
                    {terbuka && (
                      <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-4 py-4 text-sm">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
                          <span>
                            Nomor WA:{' '}
                            {r.nomor_wa ? (
                              <a
                                className="text-blue-700 underline"
                                href={`https://wa.me/${r.nomor_wa.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {r.nomor_wa}
                              </a>
                            ) : (
                              '–'
                            )}
                          </span>
                          {r.platform_user_id && <span>ID platform: {r.platform_user_id}</span>}
                          <span>{emailBadge(r)}</span>
                          {r.resolved_at && <span>Selesai: {formatWib(r.resolved_at)}</span>}
                        </div>
                        {r.email_status === 'GAGAL' && r.email_error && (
                          <p className="text-xs text-red-600">Error email: {r.email_error}</p>
                        )}
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Isi pesan</p>
                          <p className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-gray-800">
                            {r.isi}
                          </p>
                        </div>
                        {(r.lampiran ?? []).some((l) => l?.url) && (
                          <div className="text-xs text-gray-600">
                            Lampiran:{' '}
                            {(r.lampiran ?? [])
                              .filter((l) => l?.url)
                              .map((l, i) => (
                                <a key={i} className="mr-2 text-blue-700 underline" href={l.url} target="_blank" rel="noreferrer">
                                  #{i + 1}
                                </a>
                              ))}
                          </div>
                        )}
                        <div>
                          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                            Catatan internal
                          </label>
                          <textarea
                            rows={2}
                            value={catatanVal}
                            onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Mis. sudah dihubungi, menunggu data tambahan..."
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {r.status === 'BARU' && (
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => void ubah(r, 'DIPROSES')}
                              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
                            >
                              Tandai diproses
                            </button>
                          )}
                          {aktif && (
                            <>
                              <button
                                type="button"
                                disabled={busy === r.id}
                                onClick={() => void ubah(r, 'SELESAI')}
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                Selesai
                              </button>
                              <button
                                type="button"
                                disabled={busy === r.id}
                                onClick={() => void ubah(r, 'DITOLAK')}
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white disabled:opacity-50"
                              >
                                Tolak
                              </button>
                            </>
                          )}
                          {!aktif && (
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => void ubah(r, 'DIPROSES')}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white disabled:opacity-50"
                            >
                              Buka kembali
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy === r.id || catatanVal === (r.catatan ?? '')}
                            onClick={() => void simpanCatatan(r)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white disabled:opacity-50"
                          >
                            Simpan catatan
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Satu nomor hanya boleh punya satu tiket terbuka. Pelanggan baru bisa membuat tiket lagi setelah tiketnya
          Selesai atau Ditolak.
        </p>
      </main>
    </div>
  );
}

export default function AduanPage() {
  return (
    <RequireAdmin>
      <AduanContent />
    </RequireAdmin>
  );
}
