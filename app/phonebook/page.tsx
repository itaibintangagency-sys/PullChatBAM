'use client';

import { useEffect, useState, useMemo } from 'react';
import { RequireAuth } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { PhonebookListEntry, GroupedCustomer } from '@/lib/types';
import { SkeletonRow } from '@/components/Skeleton';

type SortKey = 'nama' | 'bots' | 'category' | 'stage' | 'last_msg_at';
type SortDir = 'asc' | 'desc';

function botBadgeClass(bot: string) {
  return bot === '1052' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
}

function groupByNomor(rows: PhonebookListEntry[]): GroupedCustomer[] {
  const map = new Map<string, GroupedCustomer>();

  for (const r of rows) {
    const existing = map.get(r.nomor_wa);
    if (!existing) {
      map.set(r.nomor_wa, {
        nomor_wa: r.nomor_wa,
        nama: r.nama,
        bots: [r.bot_source],
        category: r.category,
        stage: r.stage,
        last_msg_at: r.last_msg_at,
      });
      continue;
    }

    if (!existing.bots.includes(r.bot_source)) existing.bots.push(r.bot_source);

    // Data "wakil" (nama/kategori/stage) diambil dari entri yang paling BARU
    // chat-nya -- supaya representatif, bukan asal entri pertama ketemu.
    const rIsNewer =
      r.last_msg_at && (!existing.last_msg_at || new Date(r.last_msg_at) > new Date(existing.last_msg_at));
    if (rIsNewer) {
      existing.nama = r.nama;
      existing.category = r.category;
      existing.stage = r.stage;
      existing.last_msg_at = r.last_msg_at;
    }
  }

  return Array.from(map.values());
}

function PhonebookContent() {
  const { nomor } = useAuth();
  const [rawRows, setRawRows] = useState<PhonebookListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyBothBots, setOnlyBothBots] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('last_msg_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(searchTerm: string) {
    setLoading(true);
    let query = supabase
      .from('phonebook')
      .select('id, nomor_wa, bot_source, nama, stage, category, last_msg_at')
      .order('last_msg_at', { ascending: false, nullsFirst: false })
      .limit(300);

    if (searchTerm) {
      const digitsOnly = searchTerm.replace(/[^0-9]/g, '');
      if (digitsOnly.length >= 3) {
        query = query.ilike('nomor_wa', `%${digitsOnly}%`);
      } else {
        query = query.ilike('nama', `%${searchTerm}%`);
      }
    }

    const { data } = await query;
    setRawRows((data as PhonebookListEntry[]) || []);
    setLoading(false);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load(search.trim());
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const grouped = useMemo(() => groupByNomor(rawRows), [rawRows]);

  const filtered = useMemo(() => {
    let list = onlyBothBots ? grouped.filter((g) => g.bots.length === 2) : grouped;

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'last_msg_at') {
        cmp = new Date(a.last_msg_at || 0).getTime() - new Date(b.last_msg_at || 0).getTime();
      } else if (sortKey === 'bots') {
        cmp = a.bots.length - b.bots.length;
      } else {
        cmp = String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [grouped, onlyBothBots, sortKey, sortDir]);

  const bothBotsCount = grouped.filter((g) => g.bots.length === 2).length;

  const SortArrow = ({ col }: { col: SortKey }) =>
    sortKey === col ? <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span> : null;

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Phonebook</h1>
        <p className="mb-6 text-sm text-gray-500">
          Semua customer, digabung per nomor WA lintas kedua bot.
          {bothBotsCount > 0 && ` ${bothBotsCount} orang tercatat chat ke kedua bot.`}
        </p>

        <form onSubmit={handleSearch} className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Cari nama atau nomor WA..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Cari
          </button>
          <label className="ml-2 flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={onlyBothBots}
              onChange={(e) => setOnlyBothBots(e.target.checked)}
              className="rounded border-gray-300"
            />
            Cuma yang chat ke 2 bot
          </label>
        </form>

        {loading ? (
          <div className="space-y-2">
            <div className="rounded-xl border border-gray-200 bg-white"><SkeletonRow /></div>
            <div className="rounded-xl border border-gray-200 bg-white"><SkeletonRow /></div>
            <div className="rounded-xl border border-gray-200 bg-white"><SkeletonRow /></div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada customer yang cocok.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th onClick={() => toggleSort('nama')} className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700">
                    Nama <SortArrow col="nama" />
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Nomor WA</th>
                  <th onClick={() => toggleSort('bots')} className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700">
                    Bot <SortArrow col="bots" />
                  </th>
                  <th onClick={() => toggleSort('category')} className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700">
                    Kategori <SortArrow col="category" />
                  </th>
                  <th onClick={() => toggleSort('stage')} className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700">
                    Stage <SortArrow col="stage" />
                  </th>
                  <th onClick={() => toggleSort('last_msg_at')} className="cursor-pointer px-4 py-2 text-left font-medium text-gray-700">
                    Terakhir Chat <SortArrow col="last_msg_at" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr key={c.nomor_wa} className={c.bots.length === 2 ? 'bg-amber-50' : ''}>
                    <td className="px-4 py-2 font-medium text-gray-900">{c.nama || '-'}</td>
                    <td className="px-4 py-2 text-gray-600">{c.nomor_wa}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {c.bots.map((b) => (
                          <span key={b} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${botBadgeClass(b)}`}>
                            {b}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{c.category || '-'}</td>
                    <td className="px-4 py-2 text-gray-600">{c.stage}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {c.last_msg_at ? new Date(c.last_msg_at).toLocaleDateString('id-ID') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
