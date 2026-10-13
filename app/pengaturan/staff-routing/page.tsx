'use client';

import { useEffect, useMemo, useState } from 'react';
import { RequireAdmin } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { L0Config, RoutingPool } from '@/lib/types';

function normalizeNomor(raw: string): string {
  let cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
  return cleaned;
}

function suggestVariableKey(name: string): string {
  return 'STAF_' + name.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
}

const MODE_LABEL: Record<string, string> = {
  ALL: 'semua penerima dikirimi',
  ROUND_ROBIN: 'bergiliran, satu penerima per tiket',
};

const NO_POOL = '__NONE__';

function byUrutan(a: L0Config, b: L0Config): number {
  return (a.urutan ?? 999) - (b.urutan ?? 999) || a.display_name.localeCompare(b.display_name);
}

function StaffRoutingContent() {
  const { nomor } = useAuth();
  const [items, setItems] = useState<L0Config[]>([]);
  const [pools, setPools] = useState<RoutingPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); // error form tambah staff
  const [rowError, setRowError] = useState(''); // error edit / aktif-nonaktif di daftar
  const [notice, setNotice] = useState('');

  // Form tambah staff baru -- field identitas (key, kategori, peran) hanya diisi di sini
  const [displayName, setDisplayName] = useState('');
  const [variableKey, setVariableKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [nomorWa, setNomorWa] = useState('');
  const [peran, setPeran] = useState('');
  const [category, setCategory] = useState('');
  const [peranNotif, setPeranNotif] = useState('');
  const [newPool, setNewPool] = useState('');

  // Edit baris lama: nama, nomor WA, pool, urutan (aktif/nonaktif lewat tombol terpisah)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNomorWa, setEditNomorWa] = useState('');
  const [editPool, setEditPool] = useState(NO_POOL);
  const [editUrutan, setEditUrutan] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [staffRes, poolRes] = await Promise.all([
      supabase.from('l0_config').select('*').order('urutan'),
      supabase.from('routing_pools').select('*').order('pool'),
    ]);
    setItems((staffRes.data as L0Config[]) || []);
    setPools((poolRes.data as RoutingPool[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!keyTouched) setVariableKey(suggestVariableKey(displayName));
  }, [displayName, keyTouched]);

  const groups = useMemo(() => {
    const result = pools.map((p) => ({ pool: p as RoutingPool | null, label: p.label, staff: items.filter((i) => i.pool === p.pool).sort(byUrutan) }));
    const orphan = items.filter((i) => !i.pool || !pools.some((p) => p.pool === i.pool)).sort(byUrutan);
    if (orphan.length > 0) result.push({ pool: null, label: 'Tanpa pool (tidak menerima eskalasi)', staff: orphan });
    return result;
  }, [items, pools]);

  // Pool ALERT = penerima notifikasi blacklist/dormant sekaligus peninjau CLEARED/BL. Tidak boleh kosong.
  function alertAktifLain(excludeId: string): number {
    return items.filter((i) => i.id !== excludeId && i.pool === 'ALERT' && i.active).length;
  }

  function resetForm() {
    setDisplayName('');
    setVariableKey('');
    setKeyTouched(false);
    setNomorWa('');
    setPeran('');
    setCategory('');
    setPeranNotif('');
    setNewPool('');
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');

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
    const dupe = items.find((i) => normalizeNomor(i.nomor_wa) === normalized);
    if (dupe) {
      setError(`Nomor ini sudah dipakai staf lain (${dupe.display_name}).`);
      return;
    }

    // Urutan otomatis = paling akhir di pool yang dipilih
    const sisaUrutan = items.filter((i) => newPool && i.pool === newPool).map((i) => i.urutan ?? 0);
    const urutan = newPool ? Math.max(0, ...sisaUrutan) + 1 : null;

    const { error: insertError } = await supabase.from('l0_config').insert({
      variable_key: cleanKey,
      display_name: displayName.trim(),
      nomor_wa: normalized,
      peran: peran.trim() || null,
      category: category.trim() || null,
      peran_notif: peranNotif.trim() || null,
      pool: newPool || null,
      urutan,
      escalation_alias: cleanKey, // alias tiket = variable key; tidak diubah lagi (dipakai filter tiket di Monitor)
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
    setNotice('Staf ditambahkan. Bot memakai data baru mulai pesan berikutnya.');
    load();
  }

  function startEdit(item: L0Config) {
    setEditingId(item.id);
    setEditName(item.display_name);
    setEditNomorWa(item.nomor_wa);
    setEditPool(item.pool || NO_POOL);
    setEditUrutan(item.urutan === null || item.urutan === undefined ? '' : String(item.urutan));
    setRowError('');
    setNotice('');
  }

  async function saveEdit(item: L0Config) {
    setRowError('');
    setNotice('');

    const name = editName.trim();
    const normalized = normalizeNomor(editNomorWa);
    const poolValue = editPool === NO_POOL ? null : editPool;
    const urutanNum = editUrutan.trim() === '' ? NaN : Number(editUrutan);

    if (!name) {
      setRowError('Nama tidak boleh kosong.');
      return;
    }
    if (!normalized) {
      setRowError('Nomor WA wajib diisi.');
      return;
    }
    if (!/^62[0-9]{8,13}$/.test(normalized)) {
      setRowError('Format nomor tidak valid. Harus diawali 62, tanpa tanda + atau spasi.');
      return;
    }
    const dupe = items.find((i) => i.id !== item.id && normalizeNomor(i.nomor_wa) === normalized);
    if (dupe) {
      setRowError(`Nomor ini sudah dipakai staf lain (${dupe.display_name}).`);
      return;
    }
    if (poolValue && (!Number.isInteger(urutanNum) || urutanNum < 1)) {
      setRowError('Urutan harus bilangan bulat mulai 1.');
      return;
    }
    if (item.pool === 'ALERT' && item.active && poolValue !== 'ALERT' && alertAktifLain(item.id) === 0) {
      setRowError('Pool ALERT harus punya minimal 1 staf aktif (penerima alert blacklist). Tambahkan staf lain ke ALERT dulu.');
      return;
    }

    const { error: updateError } = await supabase
      .from('l0_config')
      .update({
        display_name: name,
        nomor_wa: normalized,
        pool: poolValue,
        urutan: poolValue ? urutanNum : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    if (updateError) {
      setRowError(
        updateError.code === '23505'
          ? 'Nomor ini sudah terdaftar di Nomor internal. Pakai nomor lain.'
          : 'Gagal menyimpan perubahan.'
      );
      return;
    }
    setEditingId(null);
    setNotice('Tersimpan. Bot memakai data baru mulai pesan berikutnya.');
    load();
  }

  async function toggleActive(item: L0Config) {
    setRowError('');
    setNotice('');
    if (item.active && item.pool === 'ALERT' && alertAktifLain(item.id) === 0) {
      setRowError('Pool ALERT harus punya minimal 1 staf aktif (penerima alert blacklist). Aktifkan staf lain di ALERT dulu.');
      return;
    }
    const { error: updateError } = await supabase
      .from('l0_config')
      .update({ active: !item.active, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (updateError) {
      setRowError('Gagal mengubah status aktif.');
      return;
    }
    setNotice(item.active ? 'Staf dinonaktifkan.' : 'Staf diaktifkan.');
    load();
  }

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Staff &amp; routing eskalasi</h1>
        <p className="mb-6 text-sm text-gray-500">
          Siapa menerima notifikasi bot, dikelompokkan per pool. Data ini dibaca bot pada setiap pesan, jadi perubahan
          berlaku mulai pesan berikutnya, tanpa deploy ulang. Dipakai bersama oleh kedua nomor bot (7484 &amp; 1052).
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
            <select
              aria-label="Pool baru"
              value={newPool}
              onChange={(e) => setNewPool(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            >
              <option value="">Tanpa pool (tidak menerima eskalasi)</option>
              {pools.map((p) => (
                <option key={p.pool} value={p.pool}>
                  {p.label} ({p.pool})
                </option>
              ))}
            </select>
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
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
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
            ⚠️ Variable key, kategori, dan peran hanya bisa diisi SEKALI di sini (key juga menjadi alias tiket). Nama,
            nomor WA, pool, urutan, dan status aktif bisa diubah kapan saja setelahnya.
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Tambah staff
          </button>
        </form>

        {notice && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
        {rowError && editingId === null && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{rowError}</p>
        )}

        {/* Daftar staff per pool */}
        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada staff terdaftar.</p>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => {
              const aktif = g.staff.filter((s) => s.active).length;
              return (
                <section key={g.pool ? g.pool.pool : 'orphan'} aria-label={g.label}>
                  <div className="mb-2 flex flex-wrap items-baseline gap-2">
                    <h2 className="text-sm font-semibold text-gray-800">{g.label}</h2>
                    {g.pool && (
                      <span className="text-xs text-gray-400">
                        {g.pool.pool} · {MODE_LABEL[g.pool.mode] || g.pool.mode} · {aktif}/{g.staff.length} aktif
                      </span>
                    )}
                  </div>
                  {g.pool && aktif === 0 && (
                    <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {g.pool.pool === 'ALERT'
                        ? '⚠️ Tidak ada penerima alert aktif. Notifikasi blacklist tidak akan sampai ke siapa pun.'
                        : '⚠️ Tidak ada staf aktif di pool ini. Tiket otomatis diteruskan ke pool ALERT.'}
                    </p>
                  )}
                  {g.staff.length === 0 ? (
                    <p className="text-xs text-gray-400">Belum ada staf di pool ini.</p>
                  ) : (
                    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                      {g.staff.map((item) => {
                        const editing = editingId === item.id;
                        return (
                          <div key={item.id} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                  {item.pool && item.urutan !== null && item.urutan !== undefined && (
                                    <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-500">
                                      #{item.urutan}
                                    </span>
                                  )}
                                  {item.display_name}{' '}
                                  <span className="font-normal text-gray-400">({item.variable_key})</span>
                                  {!item.active && (
                                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">Nonaktif</span>
                                  )}
                                </p>

                                {!editing ? (
                                  <p className="text-sm text-gray-500">{item.nomor_wa}</p>
                                ) : (
                                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <input
                                      aria-label="Nama"
                                      type="text"
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-gray-500"
                                    />
                                    <input
                                      aria-label="Nomor WA"
                                      type="text"
                                      inputMode="numeric"
                                      value={editNomorWa}
                                      onChange={(e) => setEditNomorWa(normalizeNomor(e.target.value))}
                                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-gray-500"
                                    />
                                    <select
                                      aria-label="Pool"
                                      value={editPool}
                                      onChange={(e) => setEditPool(e.target.value)}
                                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-gray-500"
                                    >
                                      <option value={NO_POOL}>Tanpa pool</option>
                                      {pools.map((p) => (
                                        <option key={p.pool} value={p.pool}>
                                          {p.label} ({p.pool})
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      aria-label="Urutan"
                                      type="number"
                                      min={1}
                                      disabled={editPool === NO_POOL}
                                      value={editUrutan}
                                      onChange={(e) => setEditUrutan(e.target.value)}
                                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-gray-500 disabled:opacity-40"
                                    />
                                  </div>
                                )}

                                {item.category && (
                                  <p className="text-xs text-gray-400">
                                    {item.category} · {item.peran || '-'}
                                  </p>
                                )}
                                <p className="text-xs text-gray-300">alias tiket: {item.escalation_alias || item.variable_key} (tetap)</p>
                              </div>

                              <div className="flex shrink-0 items-center gap-3">
                                {editing ? (
                                  <>
                                    <button
                                      onClick={() => saveEdit(item)}
                                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                                    >
                                      Simpan
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingId(null);
                                        setRowError('');
                                      }}
                                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                                    >
                                      Batal
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => startEdit(item)} className="text-sm text-gray-500 hover:text-gray-800">
                                      Edit
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
                            {rowError && editingId === item.id && <p className="mt-2 text-sm text-red-600">{rowError}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
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
