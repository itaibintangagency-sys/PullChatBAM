'use client';

import { useEffect, useState, useRef, use } from 'react';
import Link from 'next/link';
import { RequireNomor } from '@/components/RouteGuard';
import { supabase } from '@/lib/supabase';
import { Nomor, NOMOR_LABELS, ChatLog } from '@/lib/types';

const N8N_WEBHOOK_URL = 'https://n8n-crfkzibn5git.jkt3.sumopod.my.id/webhook/pull-room-history';
const DAY_PRESETS = [7, 30, 90, 120, 360];

interface ImportJob {
  id: string;
  status: 'running' | 'done' | 'error';
  messages_pulled: number | null;
}

function ChatThreadContent({ nomor, nomorWa }: { nomor: Nomor; nomorWa: string }) {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPresets, setShowPresets] = useState(false);
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const [pullError, setPullError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionLabel = NOMOR_LABELS[nomor];

  useEffect(() => {
    load();

    const chatChannel = supabase
      .channel(`chat_thread_${nomorWa}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_logs', filter: `nomor_wa=eq.${nomorWa}` },
        (payload) => {
          setLogs((prev) => {
            if (prev.some((l) => l.id === (payload.new as ChatLog).id)) return prev;
            const next = [...prev, payload.new as ChatLog].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomorWa]);

  useEffect(() => {
    if (!activeJob || activeJob.status !== 'running') return;

    const jobChannel = supabase
      .channel(`import_job_${activeJob.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'import_jobs', filter: `id=eq.${activeJob.id}` },
        (payload) => {
          setActiveJob(payload.new as ImportJob);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(jobChannel);
    };
  }, [activeJob]);

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

  async function handlePullHistory(days: number) {
    setShowPresets(false);
    setPullError('');
    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomor_wa: nomorWa, nomor, days }),
      });
      const data = await res.json();
      if (!res.ok || !data.job_id) {
        setPullError('Gagal memulai penarikan riwayat.');
        return;
      }
      setActiveJob({ id: data.job_id, status: 'running', messages_pulled: null });
    } catch {
      setPullError('Gagal menghubungi server. Coba lagi.');
    }
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

          <div className="flex items-center gap-2">
            {activeJob?.status === 'running' && (
              <span className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                Menarik riwayat...
              </span>
            )}
            {activeJob?.status === 'done' && (
              <span className="rounded-lg bg-green-50 px-3 py-1.5 text-xs text-green-700">
                Selesai · {activeJob.messages_pulled ?? 0} pesan ditarik
              </span>
            )}

            <div className="relative">
              <button
                onClick={() => setShowPresets((v) => !v)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Tarik riwayat lebih lama
              </button>
              {showPresets && (
                <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white shadow-lg">
                  {DAY_PRESETS.map((d) => (
                    <button
                      key={d}
                      onClick={() => handlePullHistory(d)}
                      className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {d} hari terakhir
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={exportCsv}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Export CSV
            </button>
          </div>
        </div>
        {pullError && <p className="mx-auto mt-2 max-w-3xl text-sm text-red-600">{pullError}</p>}
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
              const showSourceDivider = log.source === 'realtime' && prevSource === 'historical';

              const prevDateKey = i > 0 ? new Date(logs[i - 1].timestamp).toDateString() : null;
              const currDateKey = new Date(log.timestamp).toDateString();
              const showDateDivider = prevDateKey !== currDateKey;

              return (
                <div key={log.id}>
                  {showDateDivider && (
                    <div className="my-4 flex items-center justify-center">
                      <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
                        {formatDateLabel(log.timestamp)}
                      </span>
                    </div>
                  )}
                  {showSourceDivider && (
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
