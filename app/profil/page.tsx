'use client';

import { useState } from 'react';
import { RequireAuth } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { PhonebookEntry, Escalation, DormantEntry } from '@/lib/types';

function normalizeNomor(raw: string): string {
  let cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
  return cleaned;
}

interface BotProfile {
  bot: '1052' | '7484';
  phonebook: PhonebookEntry | null;
  escalations: Escalation[];
  dormant: DormantEntry[];
}

function BotProfileCard({ data }: { data: BotProfile }) {
  const ctx = data.phonebook?.context_json;

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            data.bot === '1052' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
          }`}
        >
          Bot {data.bot}
        </span>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <p className="text-base font-medium text-gray-900">{data.phonebook?.nama || '-'}</p>
          {!data.phonebook?.nama_confirmed && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Nama belum dikonfirmasi</span>
          )}
          {ctx?.isDormant && (
            <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Sedang dormant</span>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-gray-400">Stage saat ini</dt>
            <dd className="text-gray-800">{data.phonebook?.stage}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Kategori</dt>
            <dd className="text-gray-800">{data.phonebook?.category || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Pesan terakhir</dt>
            <dd className="text-gray-800">
              {data.phonebook?.last_msg_at ? new Date(data.phonebook.last_msg_at).toLocaleString('id-ID') : '-'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Percobaan gagal</dt>
            <dd className="text-gray-800">{ctx?.invalidAttempts ?? 0}×</dd>
          </div>
        </dl>
        {data.phonebook?.conversation_summary && (
          <p className="mt-3 rounded-lg bg-gray-50 p-2 text-xs text-gray-500">{data.phonebook.conversation_summary}</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-gray-900">Riwayat eskalasi ({data.escalations.length})</p>
        {data.escalations.length === 0 ? (
          <p className="text-sm text-gray-400">Belum pernah eskalasi.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {data.escalations.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-gray-700">
                  {e.category} · {e.escalation_type || '-'}
                </span>
                <span className={e.status === 'RESOLVE' ? 'text-green-600' : 'text-amber-600'}>{e.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-gray-900">Riwayat dormant ({data.dormant.length})</p>
        {data.dormant.length === 0 ? (
          <p className="text-sm text-gray-400">Belum pernah dormant.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {data.dormant.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-gray-700">
                  {d.source} · {new Date(d.logged_at).toLocaleDateString('id-ID')}
                </span>
                <span className={d.status === 'RESOLVED' ? 'text-green-600' : 'text-amber-600'}>{d.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfilContent() {
  const { nomor } = useAuth();
  const [nomorWa, setNomorWa] = useState('');
  const [profiles, setProfiles] = useState<BotProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeNomor(nomorWa);
    if (!normalized) return;

    setLoading(true);
    setSearched(true);

    const bots: ('1052' | '7484')[] = ['1052', '7484'];
    const results = await Promise.all(
      bots.map(async (bot) => {
        const [pbRes, escRes, dorRes] = await Promise.all([
          supabase.from('phonebook').select('*').eq('bot_source', bot).eq('nomor_wa', normalized).maybeSingle(),
          supabase
            .from('escalations')
            .select('*')
            .eq('bot_source', bot)
            .eq('nomor_wa', normalized)
            .order('created_at', { ascending: false }),
          supabase
            .from('dormant_tracking')
            .select('*')
            .eq('bot_source', bot)
            .eq('nomor_wa', normalized)
            .order('logged_at', { ascending: false }),
        ]);
        return {
          bot,
          phonebook: (pbRes.data as PhonebookEntry) || null,
          escalations: (escRes.data as Escalation[]) || [],
          dormant: (dorRes.data as DormantEntry[]) || [],
        };
      })
    );

    // Cuma tampilkan bot yang beneran punya data phonebook -- kalau customer
    // cuma pernah chat ke 1 bot, jangan tampilkan kartu kosong buat bot satunya.
    setProfiles(results.filter((r) => r.phonebook !== null));
    setLoading(false);
  }

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Profil Customer</h1>
        <p className="mb-6 text-sm text-gray-500">
          Gabungan status bot, eskalasi, dan riwayat dormant -- dicek di kedua nomor bot sekaligus.
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
        ) : profiles.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada data phonebook untuk nomor ini di bot manapun.</p>
        ) : (
          <div>
            {profiles.length === 2 && (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Customer ini tercatat chat ke kedua nomor bot.
              </p>
            )}
            <div className="flex flex-col gap-6 lg:flex-row">
              {profiles.map((p) => (
                <BotProfileCard key={p.bot} data={p} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProfilPage() {
  return (
    <RequireAuth>
      <ProfilContent />
    </RequireAuth>
  );
}
