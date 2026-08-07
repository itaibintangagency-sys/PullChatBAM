'use client';

import { useEffect, useState, useRef, use } from 'react';
import Link from 'next/link';
import { RequireNomor } from '@/components/RouteGuard';
import { supabase } from '@/lib/supabase';
import { Nomor, NOMOR_LABELS, ChatLog } from '@/lib/types';

function ChatThreadContent({ nomor, nomorWa }: { nomor: Nomor; nomorWa: string }) {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionLabel = NOMOR_LABELS[nomor];

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`chat_thread_${nomorWa}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_logs', filter: `nomor_wa=eq.${nomorWa}` },
        (payload) => {
          setLogs((prev) => [...prev, payload.new as ChatLog]);
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomorWa]);

  async function load() {
    const { data } = await supabase
      .from('chat_logs')
      .select('*')
      .eq('session', sessionLabel)
      .eq('nomor_wa', nomorWa)
      .order('timestamp', { ascending: true });

    setLogs((data as ChatLog[]) || []);
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }

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
    a.download = `chat_${nomorWa}_${nomor}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const nama = logs.find((l) => l.nama)?.nama;

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/${nomor}/chats`} className="text-sm text-gray-400 hover:text-gray-700">
              ← Kembali
            </Link>
            <div>
              <p className="text-sm font-medium text-gray-900">{nama || nomorWa}</p>
              <p className="text-xs text-gray-500">{nomorWa}</p>
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
              const prevSource = i > 0 ? logs[i - 1].source : log.source;
              const showDivider = log.source === 'realtime' && prevSource === 'historical';
              return (
                <div key={log.id}>
                  {showDivider && (
                    <div className="my-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-gray-300" />
                      <span className="text-xs text-gray-400">Riwayat sebelum sistem aktif</span>
                      <div className="h-px flex-1 bg-gray-300" />
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
  );
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
          <img src={log.media_url} alt="media" className="mb-1 max-h-64 rounded-lg" />
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

export default function ChatThreadPage({ params }: { params: Promise<{ nomor: string; nomorWa: string }> }) {
  const { nomor, nomorWa } = use(params);
  return (
    <RequireNomor>
      <ChatThreadContent nomor={nomor as Nomor} nomorWa={nomorWa} />
    </RequireNomor>
  );
}
