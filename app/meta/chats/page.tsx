'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { META_CHANNELS, MetaChannel } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface ChatSummaryRow {
  nomor_wa: string;
  nama: string | null;
  last_message: string;
  last_timestamp: string;
}

function MetaChatListContent() {
  const { nomor } = useAuth();
  const [channel, setChannel] = useState<MetaChannel>('ig');
  const [rows, setRows] = useState<ChatSummaryRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const { session: sessionLabel, botSource } = META_CHANNELS[channel];

  async function loadData() {
    const [chatRes, bookRes] = await Promise.all([
      supabase
        .from('chat_logs')
        .select('nomor_wa, nama, message_text, timestamp')
        .eq('session', sessionLabel)
        .order('timestamp', { ascending: false })
        .limit(2000),
      supabase
        .from('phonebook')
        .select('nomor_wa, nama, platform_username')
        .eq('bot_source', botSource)
        .limit(5000),
    ]);

    if (chatRes.error) {
      setLoading(false);
      return;
    }

    const names = new Map<string, string>();
    for (const b of bookRes.data || []) {
      const label = b.nama || b.platform_username;
      if (label) names.set(b.nomor_wa, label);
    }

    const map = new Map<string, ChatSummaryRow>();
    for (const r of chatRes.data || []) {
      if (!map.has(r.nomor_wa)) {
        map.set(r.nomor_wa, {
          nomor_wa: r.nomor_wa,
          nama: r.nama || names.get(r.nomor_wa) || null,
          last_message: r.message_text || '[media]',
          last_timestamp: r.timestamp,
        });
      } else if (!map.get(r.nomor_wa)!.nama && r.nama) {
        map.get(r.nomor_wa)!.nama = r.nama;
      }
    }
    setRows(Array.from(map.values()));
    setLoading(false);
  }

  useEffect(() => {
    // Memuat data awal dari Supabase -- pola yang sama dengan halaman Chat log WA
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();

    const sub = supabase
      .channel(`chat_logs_meta_${channel}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_logs' },
        () => void loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.nomor_wa.includes(q) || (r.nama || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="pt-12 md:pl-56 md:pt-0">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex gap-2">
          {(Object.keys(META_CHANNELS) as MetaChannel[]).map((c) => (
            <button
              key={c}
              onClick={() => {
                if (c === channel) return;
                setLoading(true);
                setChannel(c);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                channel === c ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {META_CHANNELS[c].label}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Cari ID atau nama..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
          />
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada percakapan.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {filtered.map((r) => (
              <Link
                key={r.nomor_wa}
                href={`/meta/chats/${channel}/${r.nomor_wa}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{r.nama || r.nomor_wa}</p>
                  <p className="truncate text-sm text-gray-500">{r.last_message}</p>
                </div>
                <span className="ml-4 shrink-0 text-xs text-gray-400">
                  {formatDistanceToNow(new Date(r.last_timestamp), { addSuffix: true, locale: idLocale })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function MetaChatListPage() {
  return (
    <RequireAuth>
      <MetaChatListContent />
    </RequireAuth>
  );
}
