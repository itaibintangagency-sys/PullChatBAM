'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { PhonebookListEntry } from '@/lib/types';
import { SkeletonRow } from '@/components/Skeleton';

type BotFilter = 'all' | '1052' | '7484';

function normalizeSearch(raw: string): string {
  return raw.trim();
}

function PhonebookContent() {
  const { nomor } = useAuth();
  const [items, setItems] = useState<PhonebookListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [botFilter, setBotFilter] = useState<BotFilter>('all');

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botFilter]);

  async function load(searchTerm: string) {
    setLoading(true);
    let query = supabase
      .from('phonebook')
      .select('id, nomor_wa, bot_source, nama, stage, category, last_msg_at')
      .order('last_msg_at', { ascending: false, nullsFirst: false })
      .limit(100);

    if (botFilter !== 'all') query = query.eq('bot_source', botFilter);

    if (searchTerm) {
      const digitsOnly = searchTerm.replace(/[^0-9]/g, '');
      if (digitsOnly.length >= 3) {
        query = query.ilike('nomor_wa', `%${digitsOnly}%`);
      } else {
        query = query.ilike('nama', `%${searchTerm}%`);
      }
    }

    const { data } = await query;
    setItems((data as PhonebookListEntry[]) || []);
    setLoading(false);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load(normalizeSearch(search));
  }

  function botBadge(bot: string) {
    return bot === '1052' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
  }

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Phonebook</h1>
        <p className="mb-6 text-sm text-gray-500">
          Semua customer terdaftar, gabungan dari kedua nomor bot (7484 &amp; 1052). Menampilkan 100 teraktif -- gunakan pencarian untuk yang lain.
        </p>

        <form onSubmit={handleSearch} className="mb-4 flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Cari nama atau nomor WA..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
          />
          <select
            value={botFilter}
            onChange={(e) => setBotFilter(e.target.value as BotFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            <option value="all">Kedua bot</option>
            <option value="1052">Bot 1052</option>
            <option value="7484">Bot 7484</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Cari
          </button>
        </form>

        {loading ? (
          <div className="space-y-2">
            <div className="rounded-xl border border-gray-200 bg-white"><SkeletonRow /></div>
            <div className="rounded-xl border border-gray-200 bg-white"><SkeletonRow /></div>
            <div className="rounded-xl border border-gray-200 bg-white"><SkeletonRow /></div>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada customer yang cocok.</p>
        ) : (
          <div className="animate-in fade-in divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white duration-300">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/${item.bot_source}/chats/${item.nomor_wa}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{item.nama || item.nomor_wa}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${botBadge(item.bot_source)}`}>
                      {item.bot_source}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {item.nomor_wa} · {item.category || 'Belum ada kategori'} · {item.stage}
                  </p>
                </div>
                <span className="text-xs text-gray-400">
                  {item.last_msg_at ? new Date(item.last_msg_at).toLocaleDateString('id-ID') : '-'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function PhonebookPage() {
  return (
    <RequireAuth>
      <PhonebookContent />
    </RequireAuth>
  );
}
