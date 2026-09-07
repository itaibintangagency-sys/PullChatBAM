'use client';

import { useEffect, useState, use } from 'react';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { supabase } from '@/lib/supabase';
import { Nomor, BlacklistEntry } from '@/lib/types';

function normalizeNomor(raw: string): string {
  let cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
  return cleaned;
}

function BlacklistContent({ nomor }: { nomor: Nomor }) {
  const [items, setItems] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  // Form tambah manual
  const [nomorWa, setNomorWa] = useState('');
  const [reason, setReason] = useState('');

  // Edit alasan
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReason, setEditReason] = useState('');

  // Konfirmasi hapus
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [nomor]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('blacklist')
      .select('*')
      .eq('bot_source', nomor)
      .order('detected_at', { ascending: false });
    setItems((data as BlacklistEntry[]) || []);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const normalized = normalizeNomor(nomorWa);
    if (!normalized || !reason.trim()) {
      setError('Nomor WA dan alasan wajib diisi.');
      return;
    }
    if (!/^62[0-9]{8,13}$/.test(normalized)) {
      setError('Format nomor tidak valid. Harus diawali 62, tanpa tanda + atau spasi.');
      return;
    }

    const { error: insertError } = await supabase.from('blacklist').insert({
      nomor_wa: normalized,
      bot_source: nomor,
      detected_at: new Date().toISOString(),
      reason: reason.trim(),
      original_message: null, // manual, bukan hasil deteksi AI
    });

    if (insertError) {
      setError(
        insertError.code === '23505' ? 'Nomor ini sudah masuk blacklist.' : 'Gagal menambah nomor.'
      );
      return;
    }
    setNomorWa('');
    setReason('');
    load();
  }

  function startEditReason(item: BlacklistEntry) {
    setEditingId(item.id);
    setEditReason(item.reason || '');
  }

  async function saveEditReason(item: BlacklistEntry) {
    if (!editReason.trim()) {
      setError('Alasan tidak boleh kosong.');
      return;
    }
    const { error: updateError } = await supabase
      .from('blacklist')
      .update({ reason: editReason.trim() })
      .eq('id', item.id);

    if (updateError) {
      setError('Gagal menyimpan perubahan.');
      return;
    }
    setEditingId(null);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from('blacklist').delete().eq('id', id);
    setConfirmDeleteId(null);
    load();
  }

  const filtered = items.filter(
    (i) =>
      i.nomor_wa.includes(search.replace(/[^0-9]/g, '')) ||
      (i.reason || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
   // SESUDAH — tambah pl-56 di div pembungkus
<div className="pl-56">
  <NavHeader nomor={nomor} />
  <main className="mx-auto max-w-4xl px-4 py-6">
    <h1 className="mb-1 text-lg font-medium text-gray-900">Blacklist</h1>
        <p className="mb-6 text-sm text-gray-500">
          Nomor yang tidak akan dilayani bot ini — otomatis (terdeteksi spam) atau ditambah manual.
        </p>

        {/* Form tambah manual */}
        <form onSubmit={handleAdd} className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-gray-900">Tambah nomor manual</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Nomor WA (62812xxxxxxx)"
              value={nomorWa}
              onChange={(e) => setNomorWa(normalizeNomor(e.target.value))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            <input
              type="text"
              placeholder="Alasan (misal: penipuan, kasar ke staff)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Tambah ke blacklist
          </button>
        </form>

        <input
          type="text"
          placeholder="Cari nomor atau alasan..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
        />

        {/* List */}
        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">
            {items.length === 0 ? 'Belum ada nomor di-blacklist.' : 'Tidak ada yang cocok pencarian.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {filtered.map((item) => {
              const editing = editingId === item.id;
              const confirming = confirmDeleteId === item.id;

              return (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.nomor_wa}</p>

                      {!editing ? (
                        <p className="text-sm text-gray-600">{item.reason || '-'}</p>
                      ) : (
                        <input
                          type="text"
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-gray-500"
                        />
                      )}

                      {item.original_message && (
                        <p className="mt-1 truncate text-xs text-gray-400">
                          Pesan asli: &quot;{item.original_message}&quot;
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
                        {new Date(item.detected_at).toLocaleString('id-ID')}
                        {!item.original_message && ' · ditambah manual'}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      {editing ? (
                        <>
                          <button
                            onClick={() => saveEditReason(item)}
                            className="text-sm font-medium text-gray-900 hover:underline"
                          >
                            Simpan
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-sm text-gray-400 hover:text-gray-700"
                          >
                            Batal
                          </button>
                        </>
                      ) : confirming ? (
                        <>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-sm font-medium text-red-600 hover:underline"
                          >
                            Yakin, hapus
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-sm text-gray-400 hover:text-gray-700"
                          >
                            Batal
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEditReason(item)}
                            className="text-sm text-gray-500 hover:text-gray-800"
                          >
                            Edit alasan
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="text-sm text-gray-400 hover:text-red-600"
                          >
                            Keluarkan
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function BlacklistPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  return (
    <RequireNomor>
      <BlacklistContent nomor={nomor as Nomor} />
    </RequireNomor>
  );
}
