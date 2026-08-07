'use client';

import { useEffect, useState, use } from 'react';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { supabase } from '@/lib/supabase';
import { Nomor, InternalNumber } from '@/lib/types';

function InternalNumbersContent({ nomor }: { nomor: Nomor }) {
  const [items, setItems] = useState<InternalNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [nomorWa, setNomorWa] = useState('');
  const [label, setLabel] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase.from('internal_numbers').select('*').order('created_at', { ascending: false });
    setItems((data as InternalNumber[]) || []);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!nomorWa.trim() || !label.trim()) {
      setError('Nomor WA dan label wajib diisi.');
      return;
    }
    const { error: insertError } = await supabase.from('internal_numbers').insert({
      nomor_wa: nomorWa.trim(),
      label: label.trim(),
      keterangan: keterangan.trim() || null,
    });
    if (insertError) {
      setError('Gagal menambah nomor. Mungkin sudah terdaftar.');
      return;
    }
    setNomorWa('');
    setLabel('');
    setKeterangan('');
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from('internal_numbers').delete().eq('id', id);
    load();
  }

  return (
    <div>
      <NavHeader nomor={nomor} />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Nomor internal</h1>
        <p className="mb-6 text-sm text-gray-500">
          Nomor kantor di sini dipisah dari kategori customer di chat log.
        </p>

        <form onSubmit={handleAdd} className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              placeholder="Nomor WA (628xxx)"
              value={nomorWa}
              onChange={(e) => setNomorWa(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            <input
              type="text"
              placeholder="Label (misal: HP Kantor)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            <input
              type="text"
              placeholder="Keterangan (opsional)"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Tambah nomor
          </button>
        </form>

        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada nomor internal terdaftar.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{it.label}</p>
                  <p className="text-sm text-gray-500">{it.nomor_wa}</p>
                  {it.keterangan && <p className="text-xs text-gray-400">{it.keterangan}</p>}
                </div>
                <button
                  onClick={() => handleDelete(it.id)}
                  className="text-sm text-gray-400 hover:text-red-600"
                >
                  Hapus
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function InternalNumbersPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  return (
    <RequireNomor>
      <InternalNumbersContent nomor={nomor as Nomor} />
    </RequireNomor>
  );
}
