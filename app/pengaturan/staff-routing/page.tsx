'use client';

import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { L0Config } from '@/lib/types';

const KEY_LOCK_WINDOW_MS = 10 * 60 * 1000; // 10 menit

function normalizeNomor(raw: string): string {
  let cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
  return cleaned;
}

function suggestVariableKey(name: string): string {
  return 'STAF_' + name.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
}

function isKeyLocked(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > KEY_LOCK_WINDOW_MS;
}

function StaffRoutingContent() {
  const { nomor } = useAuth();
  const [items, setItems] = useState<L0Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form tambah staff baru
  const [displayName, setDisplayName] = useState('');
  const [variableKey, setVariableKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false); // apakah user override manual
  const [nomorWa, setNomorWa] = useState('');
  const [peran, setPeran] = useState('');
  const [category, setCategory] = useState('');
  const [peranNotif, setPeranNotif] = useState('');

  // Baris yang lagi diedit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editNomorWa, setEditNomorWa] = useState('');
  const [editPeran, setEditPeran] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPeranNotif, setEditPeranNotif] = useState('');
  const [editVariableKey, setEditVariableKey] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('l0_config').select('*').order('display_name');
    setItems((data as L0Config[]) || []);
    setLoading(false);
  }

  // Auto-suggest variable_key dari nama, kecuali user sudah override manual
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
    setEditDisplayName(item.display_name);
    setEditNomorWa(item.nomor_wa);
    setEditPeran(item.peran || '');
    setEditCategory(item.category || '');
    setEditPeranNotif(item.peran_notif || '');
    setEditVariableKey(item.variable_key);
  }

  async function saveEdit(item: L0Config) {
    setError('');
    const normalized = normalizeNomor(editNomorWa);
    if (!editDisplayName.trim() || !normalized) {
      setError('Nama dan nomor WA wajib diisi.');
      return;
    }
    if (!/^62[0-9]{8,13}$/.test(normalized)) {
      setError('Format nomor tidak valid.');
      return;
    }

    const payload: Partial<L0Config> = {
      display_name: editDisplayName.trim(),
      nomor_wa: normalized,
      peran: editPeran.trim() || null,
      category: editCategory.trim() || null,
      peran_notif: editPeranNotif.trim() || null,
      updated_at: new Date().toISOString(),
    };

    // variable_key cuma boleh berubah kalau masih dalam jendela waktu
    if (!isKeyLocked(item.created_at) && editVariableKey.trim().toUpperCase() !== item.variable_key) {
      payload.variable_key = editVariableKey.trim().toUpperCase();
    }

    const { error: updateError } = await supabase.from('l0_config').update(payload).eq('id', item.id);
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
    <div>
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Staff &amp; routing eskalasi</h1>
        <p className="mb-6 text-sm text-gray-500">
          Daftar staff yang menerima notifikasi eskalasi dari bot. Data ini dipakai bersama oleh kedua nomor
          bot (7484 &amp; 1052) — bukan data terpisah per nomor.
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
                Otomatis terisi dari nama — bisa diketik ulang manual kalau perlu beda (contoh: CS, CS2).
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
            ⚠️ Variable key dipakai langsung oleh kode bot. Setelah 10 menit, key ini terkunci permanen — pastikan
            benar sebelum simpan.
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
              const locked = isKeyLocked(item.created_at);
              const editing = editingId === item.id;

              if (editing) {
                return (
                  <div key={item.id} className="space-y-2 px-4 py-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="Nama"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                      <input
                        value={editVariableKey}
                        onChange={(e) => setEditVariableKey(e.target.value.toUpperCase())}
                        disabled={locked}
                        placeholder="Variable key"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 disabled:bg-gray-100 disabled:text-gray-400"
                      />
                      <input
                        value={editNomorWa}
                        onChange={(e) => setEditNomorWa(normalizeNomor(e.target.value))}
                        placeholder="Nomor WA"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                      <input
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        placeholder="Kategori"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                      <input
                        value={editPeran}
                        onChange={(e) => setEditPeran(e.target.value)}
                        placeholder="Peran"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 sm:col-span-2"
                      />
                      <input
                        value={editPeranNotif}
                        onChange={(e) => setEditPeranNotif(e.target.value)}
                        placeholder="Peran notif"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 sm:col-span-2"
                      />
                    </div>
                    {locked && (
                      <p className="text-xs text-gray-400">
                        Variable key terkunci (lewat 10 menit sejak dibuat: {new Date(item.created_at).toLocaleString('id-ID')}).
                      </p>
                    )}
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex gap-2">
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
                    </div>
                  </div>
                );
              }

              return (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
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
                    <p className="text-sm text-gray-500">{item.nomor_wa}</p>
                    {item.category && (
                      <p className="text-xs text-gray-400">
                        {item.category} · {item.peran || '-'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => startEdit(item)} className="text-sm text-gray-500 hover:text-gray-800">
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(item)}
                      className={`text-sm ${item.active ? 'text-gray-400 hover:text-red-600' : 'text-gray-400 hover:text-green-600'}`}
                    >
                      {item.active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
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

export default function StaffRoutingPage() {
  return (
    <RequireAdmin>
      <StaffRoutingContent />
    </RequireAdmin>
  );
}
