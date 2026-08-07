'use client';

import { useEffect, useState, useMemo, use } from 'react';
import Link from 'next/link';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { supabase } from '@/lib/supabase';
import { Nomor, NOMOR_LABELS, InternalNumber } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface ChatSummaryRow {
  nomor_wa: string;
  nama: string | null;
  last_message: string;
  last_timestamp: string;
}

function ChatListContent({ nomor }: { nomor: Nomor }) {
  const [rows, setRows] = useState<ChatSummaryRow[]>([]);
  const [internalNumbers, setInternalNumbers] = useState<InternalNumber[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const sessionLabel = NOMOR_LABELS[nomor];

  useEffect(() => {
    loadData();
    loadInternal();

    const channel = supabase
      .channel('chat_logs_list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_logs' },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomor]);

  async function loadData() {
    const { data, error } = await supabase
      .from('chat_logs')
      .select('nomor_wa, nama, message_text, timestamp')
      .eq('session', sessionLabel)
      .order('timestamp', { ascending: false })
      .limit(2000);

    if (error) {
      setLoading(false);
      return;
    }

    const map = new Map<string, ChatSummaryRow>();
    for (const r of data || []) {
      if (!map.has(r.nomor_wa)) {
        map.set(r.nomor_wa, {
          nomor_wa: r.nomor_wa,
          nama: r.nama,
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

  async function loadInternal() {
    const { data } = await supabase.from('internal_numbers').select('*');
    setInternalNumbers((data as InternalNumber[]) || []);
  }

  const internalSet = useMemo(() => new Set(internalNumbers.map((i) => i.nomor_wa)), [internalNumbers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) => r.nomor_wa.includes(q) || (r.nama || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, search]);

  const customerList = filtered.filter((r) => !internalSet.has(r.nomor_wa));
  const internalList = filtered.filter((r) => internalSet.has(r.nomor_wa));

  return (
    <div>
      <NavHeader nomor={nomor} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Cari nomor atau nama..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
          />
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : (
          <>
            <Section title="Customer" items={customerList} nomor={nomor} internal={internalNumbers} empty="Belum ada percakapan customer." />
            {internalList.length > 0 && (
              <Section title="Internal" items={internalList} nomor={nomor} internal={internalNumbers} empty="" />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Section({
  title,
  items,
  nomor,
  internal,
  empty,
}: {
  title: string;
  items: ChatSummaryRow[];
  nomor: Nomor;
  internal: InternalNumber[];
  empty: string;
}) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {items.map((r) => {
            const label = internal.find((i) => i.nomor_wa === r.nomor_wa)?.label;
            return (
              <Link
                key={r.nomor_wa}
                href={`/${nomor}/chats/${r.nomor_wa}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {r.nama || label || r.nomor_wa}
                  </p>
                  <p className="truncate text-sm text-gray-500">{r.last_message}</p>
                </div>
                <span className="ml-4 shrink-0 text-xs text-gray-400">
                  {formatDistanceToNow(new Date(r.last_timestamp), { addSuffix: true, locale: idLocale })}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ChatListPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  return (
    <RequireNomor>
      <ChatListContent nomor={nomor as Nomor} />
    </RequireNomor>
  );
}
