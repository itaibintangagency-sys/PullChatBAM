'use client';

import { useState, use } from 'react';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { supabase } from '@/lib/supabase';
import { Nomor, PhonebookEntry, Escalation, DormantEntry } from '@/lib/types';

function normalizeNomor(raw: string): string {
  let cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
  return cleaned;
}

function ProfilContent({ nomor }: { nomor: Nomor }) {
  const [nomorWa, setNomorWa] = useState('');
  const [phonebook, setPhonebook] = useState<PhonebookEntry | null>(null);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [dormant, setDormant] = useState<DormantEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeNomor(nomorWa);
    if (!normalized) return;

    setLoading(true);
    setSearched(true);
    setNotFound(false);

    const [pbRes, escRes, dorRes] = await Promise.all([
      supabase.from('phonebook').select('*').eq('bot_source', nomor).eq('nomor_wa', normalized).maybeSingle(),
      supabase.from('escalations').select('*').eq('bot_source', nomor).eq('nomor_wa', normalized).order('created_at', { ascending: false }),
      supabase.from('dormant_tracking').select('*').eq('bot_source', nomor).eq('nomor_wa', normalized).order('logged_at', { ascending: false }),
    ]);

    setPhonebook((pbRes.data as PhonebookEntry) || null);
    setEscalations((escRes.data as Escalation[]) || []);
    setDormant((dorRes.data as DormantEntry[]) || []);
    setNotFound(!pbRes.data);
    setLoading(false);
  }

  const ctx = phonebook?.context_json;

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Profil Customer</h1>
        <p className="mb-6 text-sm text-gray-500">
          Gabungan status bot, eskalasi, dan riwayat dormant dalam 1 nomor WA.
        </p>

        <form onSubmit={handleSearch} className="mb-6 flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Nomor WA (62812xxxxxxx)"
            value={nomorWa}
            onChange={(e) => setNomorWa(normalizeNomor(e.target.value))}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Cari
          </button>
        </form>

        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : !searched ? (
          <p className="text-sm text-gray-400">Masukkan nomor WA untuk mulai.</p>
        ) : notFound ? (
          <p className="text-sm text-gray-400">Belum ada data phonebook untuk nomor ini di bot {nomor}.</p>
        ) : (
          <div className="space-y-4">
            {/* Kartu status utama */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <p className="text-base font-medium text-gray-900">{phonebook?.nama || nomorWa}</p>
                {!phonebook?.nama_confirmed && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Nama belum dikonfirmasi</span>
                )}
                {ctx?.isDormant && (
                  <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Sedang dormant</span>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-gray-400">Stage saat ini</dt>
                  <dd className="text-gray-800">{phonebook?.stage}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Kategori</dt>
                  <dd className="text-gray-800">{phonebook?.category || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Platform</dt>
                  <dd className="text-gray-800">{phonebook?.platform || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Pesan terakhir</dt>
                  <dd className="text-gray-800">
                    {phonebook?.last_msg_at ? new Date(phonebook.last_msg_at).toLocaleString('id-ID') : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Percobaan gagal</dt>
                  <dd className="text-gray-800">{ctx?.invalidAttempts ?? 0}×</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Screenshot terkumpul</dt>
                  <dd className="text-gray-800">{ctx?.ssCount ?? 0}</dd>
                </div>
              </dl>
              {phonebook?.conversation_summary && (
                <p className="mt-3 rounded-lg bg-gray-50 p-2 text-xs text-gray-500">{phonebook.conversation_summary}</p>
              )}
            </div>

            {/* Riwayat eskalasi */}
            <div>
              <p className="mb-2 text-sm font-medium text-gray-900">Riwayat eskalasi ({escalations.length})</p>
              {escalations.length === 0 ? (
                <p className="text-sm text-gray-400">Belum pernah eskalasi.</p>
              ) : (
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                  {escalations.map((e) => (
                    <div key={e.id} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span className="text-gray-700">
                        {e.category} · {e.escalation_type || '-'}
                      </span>
                      <span className={e.status === 'RESOLVED' ? 'text-green-600' : 'text-amber-600'}>
                        {e.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Riwayat dormant */}
            <div>
              <p className="mb-2 text-sm font-medium text-gray-900">Riwayat dormant ({dormant.length})</p>
              {dormant.length === 0 ? (
                <p className="text-sm text-gray-400">Belum pernah dormant.</p>
              ) : (
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                  {dormant.map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span className="text-gray-700">
                        {d.source} · {new Date(d.logged_at).toLocaleDateString('id-ID')}
                      </span>
                      <span className={d.status === 'RESOLVED' ? 'text-green-600' : 'text-amber-600'}>
                        {d.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProfilPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  return (
    <RequireNomor>
      <ProfilContent nomor={nomor as Nomor} />
    </RequireNomor>
  );
}
