'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Ringkasan {
  ticket_id: string;
  nama: string | null;
  pesanChat: number;
  logKeputusanBot: number;
  tiketLainPelanggan: number;
}

type Langkah = 'pilih' | 'konfirmasi1' | 'konfirmasi2';

interface Props {
  tiket: { id: string; ticket_id: string; nama: string | null };
  onClose: () => void;
  onDone: (pesan: string) => void;
}

async function panggil(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/eskalasi-hapus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

// Pop up hapus tiket eskalasi (khusus Super Admin). Hapus riwayat percakapan wajib dikonfirmasi dua kali.
export function HapusEskalasiDialog({ tiket, onClose, onDone }: Props) {
  const [langkah, setLangkah] = useState<Langkah>('pilih');
  const [ringkas, setRingkas] = useState<Ringkasan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let batal = false;
    panggil({ id: tiket.id, dryRun: true }).then((r) => {
      if (batal) return;
      if (r.ok) setRingkas(r.json as Ringkasan);
      else setError(r.json.error || 'Gagal memuat ringkasan.');
    });
    return () => {
      batal = true;
    };
  }, [tiket.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function hapus(denganRiwayat: boolean) {
    setBusy(true);
    setError('');
    const r = await panggil({ id: tiket.id, konfirmasi: true, hapusRiwayat: denganRiwayat, konfirmasiRiwayat: denganRiwayat });
    setBusy(false);
    if (!r.ok) {
      setError(r.json.error || 'Gagal menghapus.');
      return;
    }
    onDone(
      denganRiwayat
        ? `Tiket ${r.json.ticket_id} dan riwayat percakapan (${r.json.pesanChat} pesan) dihapus.`
        : `Tiket ${r.json.ticket_id} dihapus. Riwayat percakapan tidak diubah.`
    );
  }

  const btn = 'rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50';
  const total = ringkas ? ringkas.pesanChat + ringkas.logKeputusanBot : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hapus-judul"
      onClick={() => !busy && onClose()}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {langkah === 'pilih' && (
          <>
            <h2 id="hapus-judul" className="text-base font-medium text-gray-900">
              Hapus tiket {tiket.ticket_id}?
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Pelanggan: {tiket.nama || '-'}. Tiket dihapus permanen dan tidak bisa dikembalikan.
            </p>
            {ringkas && ringkas.tiketLainPelanggan > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Pelanggan ini punya {ringkas.tiketLainPelanggan} tiket lain. Tiket lain tidak ikut terhapus.
              </p>
            )}
            <p className="mt-4 text-sm font-medium text-gray-900">Hapus juga seluruh histori percakapan pelanggan ini?</p>
            <p className="mt-1 text-xs text-gray-500">
              {ringkas
                ? `Ada ${ringkas.pesanChat} pesan chat dan ${ringkas.logKeputusanBot} catatan keputusan bot.`
                : error
                ? ''
                : 'Menghitung...'}
            </p>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`} onClick={onClose} disabled={busy}>
                Batal
              </button>
              <button className={`${btn} border border-red-300 text-red-700 hover:bg-red-50`} onClick={() => void hapus(false)} disabled={busy || !ringkas}>
                {busy ? 'Menghapus...' : 'Hapus tiket saja'}
              </button>
              <button className={`${btn} bg-red-600 text-white hover:bg-red-700`} onClick={() => setLangkah('konfirmasi1')} disabled={busy || !ringkas}>
                Hapus tiket + histori
              </button>
            </div>
          </>
        )}

        {langkah === 'konfirmasi1' && ringkas && (
          <>
            <h2 id="hapus-judul" className="text-base font-medium text-gray-900">
              Konfirmasi 1 dari 2
            </h2>
            <p className="mt-2 text-sm text-gray-700">Yang akan terhapus permanen:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
              <li>Tiket {ringkas.ticket_id} beserta feedback dan data dormant-nya</li>
              <li>{ringkas.pesanChat} pesan di chat log pelanggan</li>
              <li>{ringkas.logKeputusanBot} catatan keputusan bot</li>
            </ul>
            {total === 0 && <p className="mt-2 text-xs text-gray-500">Tidak ditemukan riwayat percakapan untuk pelanggan ini.</p>}
            <p className="mt-3 text-sm text-gray-700">Riwayat pelanggan di seluruh bot ikut hilang, bukan hanya untuk tiket ini. Lanjutkan?</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`} onClick={() => setLangkah('pilih')}>
                Kembali
              </button>
              <button className={`${btn} bg-red-600 text-white hover:bg-red-700`} onClick={() => setLangkah('konfirmasi2')}>
                Ya, lanjutkan
              </button>
            </div>
          </>
        )}

        {langkah === 'konfirmasi2' && ringkas && (
          <>
            <h2 id="hapus-judul" className="text-base font-medium text-red-700">
              Konfirmasi 2 dari 2: terakhir
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              Anda akan menghapus permanen tiket {ringkas.ticket_id} dan seluruh histori percakapan pelanggan ({ringkas.pesanChat} pesan).
              Tindakan ini tidak bisa dibatalkan.
            </p>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`} onClick={onClose} disabled={busy}>
                Batal
              </button>
              <button className={`${btn} bg-red-600 text-white hover:bg-red-700`} onClick={() => void hapus(true)} disabled={busy}>
                {busy ? 'Menghapus...' : 'Hapus permanen'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
