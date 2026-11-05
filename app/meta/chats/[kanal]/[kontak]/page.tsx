'use client';

import { useEffect, useState, useRef, use } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { ChatLog, META_CHANNELS, MetaChannel } from '@/lib/types';

function MetaThreadContent({ kanal, kontak }: { kanal: MetaChannel; kontak: string }) {
  const { nomor } = useAuth();
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { session: sessionLabel, botSource, label } = META_CHANNELS[kanal];

  async function load() {
    const [chatRes, bookRes] = await Promise.all([
      supabase
        .from('chat_logs')
        .select('*')
        .eq('session', sessionLabel)
        .eq('nomor_wa', kontak)
        .order('timestamp', { ascending: true }),
      supabase
        .from('phonebook')
        .select('nama, platform_username')
        .eq('bot_source', botSource)
        .eq('nomor_wa', kontak)
        .limit(1),
    ]);

    setLogs((chatRes.data as ChatLog[]) || []);
    const book = bookRes.data?.[0];
    setUsername(book?.nama || book?.platform_username || null);
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }

  useEffect(() => {
    // Memuat data awal dari Supabase -- pola yang sama dengan halaman Chat log WA
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    const sub = supabase
      .channel(`meta_thread_${kontak}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_logs', filter: `nomor_wa=eq.${kontak}` },
        (payload) => {
          setLogs((prev) => {
            if (prev.some((l) => l.id === (payload.new as ChatLog).id)) return prev;
            return [...prev, payload.new as ChatLog].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
          });
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kontak]);

  function exportCsv() {
    const header = 'Timestamp,Sender,Message_Type,Message_Text,Media_URL\n';
    const rows = logs
      .map((l) =>
        [l.timestamp, l.sender, l.message_type, (l.message_text || '').replace(/[\n,]/g, ' '), l.media_url || '']
          .map((v) => `"${v}"`)
          .join(',')
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_${kanal}_${kontak}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const nama = logs.find((l) => l.nama)?.nama || username;

  return (
    <div className="pt-12 md:pl-56 md:pt-0">
      <NavHeader nomor={nomor || '1052'} />
      <div className="flex h-[calc(100vh-3rem)] flex-col md:h-screen">
        <header className="border-b border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/meta/chats" className="text-sm text-gray-400 hover:text-gray-700">
                ← Kembali
              </Link>
              <div>
                <p className="text-sm font-medium text-gray-900">{nama || kontak}</p>
                <p className="text-xs text-gray-500">
                  {label} · {kontak}
                </p>
              </div>
            </div>
            <button
              onClick={exportCsv}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Export CSV
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-1">
            {loading ? (
              <p className="text-center text-sm text-gray-400">Memuat...</p>
            ) : logs.length === 0 ? (
              <p className="text-center text-sm text-gray-400">Belum ada pesan.</p>
            ) : (
              logs.map((log, i) => {
                const showDateDivider =
                  i === 0 || new Date(logs[i - 1].timestamp).toDateString() !== new Date(log.timestamp).toDateString();
                return (
                  <div key={log.id}>
                    {showDateDivider && (
                      <div className="my-4 flex items-center justify-center">
                        <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
                          {formatDateLabel(log.timestamp)}
                        </span>
                      </div>
                    )}
                    <Bubble log={log} />
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameDay(date, today)) return 'Hari ini';
  if (isSameDay(date, yesterday)) return 'Kemarin';

  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Bubble({ log }: { log: ChatLog }) {
  const isCustomer = log.sender === 'CUSTOMER';
  const time = new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-3 py-2 ${
          isCustomer ? 'bg-white text-gray-900' : 'bg-green-600 text-white'
        }`}
      >
        {log.message_type !== 'text' && log.media_url && (
          <img
            src={`/api/media-proxy?url=${encodeURIComponent(log.media_url)}`}
            alt="media"
            className="mb-1 max-h-64 rounded-lg"
          />
        )}
        {log.message_type !== 'text' && !log.media_url && (
          <p className={`text-xs italic ${isCustomer ? 'text-gray-400' : 'text-green-100'}`}>
            [{log.message_type} - tidak tersimpan]
          </p>
        )}
        {log.message_text && <p className="whitespace-pre-wrap text-sm">{log.message_text}</p>}
        <p className={`mt-1 text-right text-[11px] ${isCustomer ? 'text-gray-400' : 'text-green-100'}`}>{time}</p>
      </div>
    </div>
  );
}

export default function MetaThreadPage({ params }: { params: Promise<{ kanal: string; kontak: string }> }) {
  const { kanal, kontak } = use(params);
  if (!(kanal in META_CHANNELS)) return null;
  return (
    <RequireAuth>
      <MetaThreadContent kanal={kanal as MetaChannel} kontak={kontak} />
    </RequireAuth>
  );
}
