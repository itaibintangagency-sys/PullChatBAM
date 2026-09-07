'use client';

import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { L0Config } from '@/lib/types';

function normalizeNomor(raw: string): string {
  let cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
  return cleaned;
}

function suggestVariableKey(name: string): string {
  return 'STAF_' + name.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
}

function StaffRoutingContent() {
  const { nomor } = useAuth();
  const [items, setItems] = useState<L0Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form tambah staff baru — SEMUA field masih diisi di sini, karena baru dibuat
  const [displayName, setDisplayName] = useState('');
  const [variableKey, setVariableKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [nomorWa, setNomorWa] = useState('');
  const [peran, setPeran] = useState('');
  const [category, setCategory] = useState('');
  const [peranNotif, setPeranNotif] = useState('');

  // Edit baris lama — CUMA nomor WA
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNomorWa, setEditNomorWa] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('l0_config').select('*').order('display_name');
    setItems((data as L0Config[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!keyTouched) setVariableKey(suggestVariableKey(displayName));
  }, [displayName, keyTouched]);

  function resetForm() {
    setDisplayName('');
    setVariableKey('');
    setKeyTouched(false);
    setNomorWa('');
    setPeran('');
    setCategory('');
    setPeranNotif('');
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const normalized = normalizeNomor(nomorWa);
    const cleanKey = variableKey.trim().toUpperCase();

    if (!displayName.trim() || !cleanKey || !normalized) {
      setError('Nama, variable key, dan nomor WA wajib diisi.');
      return;
    }
    if (!/^62[0-9]{8,13}$/.test(normalized)) {
      setError('Format nomor tidak valid. Harus diawali 62, tanpa tanda + atau spasi.');
      return;
    }

    const { error: insertError } = await supabase.from('l0_config').insert({
      variable_key: cleanKey,
      display_name: displayName.trim(),
      nomor_wa: normalized,
      peran: peran.trim() || null,
      category: category.trim() || null,
      peran_notif: peranNotif.trim() || null,
      active: true,
    });

    if (insertError) {
      setError(
        insertError.code === '23505'
          ? `Variable key "${cleanKey}" sudah dipakai. Pilih yang lain.`
          : 'Gagal menambah staff.'
      );
      return;
    }
    resetForm();
    load();
  }

  function startEdit(item: L0Config) {
    setEditingId(item.id);
    setEditNomorWa(item.nomor_wa);
    setError('');
  }

  async function saveEdit(item: L0Config) {
    setError('');
    const normalized = normalizeNomor(editNomorWa);
    if (!normalized) {
      setError('Nomor WA wajib diisi.');
      return;
    }
    if (!/^62[0-9]{8,13}$/.test(normalized)) {
      setError('Format nomor tidak valid. Harus diawali 62, tanpa tanda + atau spasi.');
      return;
    }

    const { error: updateError } = await supabase
      .from('l0_config')
      .update({ nomor_wa: normalized, updated_at: new Date().toISOString() })
      .eq('id', item.id);

    if (updateError) {
      setError('Gagal menyimpan perubahan.');
      return;
    }
    setEditingId(null);
    load();
  }

  async function toggleActive(item: L0Config) {
    await supabase.from('l0_config').update({ active: !item.active, updated_at: new Date().toISOString() }).eq('id', item.id);
    load();
  }

  return (
   // SESUDAH — tambah pl-56 di div pembungkus
<div className="pl-56">
  <NavHeader nomor={nomor} />
  <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Staff &amp; routing eskalasi</h1>
        <p className="mb-6 text-sm text-gray-500">
          Daftar staff yang menerima notifikasi eskalasi dari bot. Data ini dipakai bersama oleh kedua nomor
          bot (7484 &amp; 1052).
        </p>

        {/* Form tambah staff baru */}
        <form onSubmit={handleAdd} className="mb-8 rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-gray-900">Tambah staff baru</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Nama (misal: Rizki)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            <div>
              <input
                type="text"
                placeholder="Variable key (misal: STAF_RIZKI)"
                value={variableKey}
                onChange={(e) => {
                  setVariableKey(e.target.value.toUpperCase());
                  setKeyTouched(true);
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Otomatis terisi dari nama — bisa diketik ulang manual (contoh: CS, CS2).
              </p>
            </div>
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
              placeholder="Kategori (misal: CREATOR_TIKTOK)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            <input
              type="text"
              placeholder="Peran (misal: Registration Officer)"
              value={peran}
              onChange={(e) => setPeran(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 sm:col-span-2"
            />
            <input
              type="text"
              placeholder="Peran notif (opsional, teks bebas)"
              value={peranNotif}
              onChange={(e) => setPeranNotif(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 sm:col-span-2"
            />
          </div>
          <p className="mt-2 text-xs text-amber-600">
            ⚠️ Semua field di sini cuma bisa diisi SEKALI di sini. Setelah staff tersimpan, cuma nomor WA yang
            bisa diubah lagi.
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Tambah staff
          </button>
        </form>

        {/* Daftar staff */}
        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada staff terdaftar.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {items.map((item) => {
              const editing = editingId === item.id;

              return (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.display_name}{' '}
                        <span className="font-normal text-gray-400">({item.variable_key})</span>
                        {!item.active && (
                          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                            Nonaktif
                          </span>
                        )}
                      </p>

                      {!editing ? (
                        <p className="text-sm text-gray-500">{item.nomor_wa}</p>
                      ) : (
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={editNomorWa}
                            onChange={(e) => setEditNomorWa(normalizeNomor(e.target.value))}
                            className="rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-gray-500"
                          />
                        </div>
                      )}

                      {item.category && (
                        <p className="text-xs text-gray-400">
                          {item.category} · {item.peran || '-'}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {editing ? (
                        <>
                          <button
                            onClick={() => saveEdit(item)}
                            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                          >
                            Simpan
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setError(''); }}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                          >
                            Batal
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(item)} className="text-sm text-gray-500 hover:text-gray-800">
                            Edit nomor
                          </button>
                          <button
                            onClick={() => toggleActive(item)}
                            className={`text-sm ${item.active ? 'text-gray-400 hover:text-red-600' : 'text-gray-400 hover:text-green-600'}`}
                          >
                            {item.active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {editing && error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function StaffRoutingPage() {
  return (
    <RequireAdmin>
      <StaffRoutingContent />
    </RequireAdmin>
  );
}
