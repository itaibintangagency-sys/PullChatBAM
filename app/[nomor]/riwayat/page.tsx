'use client';

import { useState, use } from 'react';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { supabase } from '@/lib/supabase';
import { Nomor, BotDecisionLog } from '@/lib/types';

function normalizeNomor(raw: string): string {
  let cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
  return cleaned;
}

function outcomeBadge(outcome: string | null) {
  if (outcome === 'REPLIED') return 'bg-green-100 text-green-700';
  if (outcome && outcome.includes('ESCALAT')) return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

function RiwayatContent({ nomor }: { nomor: Nomor }) {
  const [nomorWa, setNomorWa] = useState('');
  const [logs, setLogs] = useState<BotDecisionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeNomor(nomorWa);
    if (!normalized) return;

    setLoading(true);
    setSearched(true);
    const { data } = await supabase
      .from('bot_decision_log')
      .select('*')
      .eq('bot_source', nomor)
      .eq('nomor_wa', normalized)
      .order('created_at', { ascending: false });
    setLogs((data as BotDecisionLog[]) || []);
    setLoading(false);
  }

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Riwayat Customer</h1>
        <p className="mb-6 text-sm text-gray-500">
          Cari 1 nomor WA, lihat jejak lengkap tiap keputusan bot — berguna buat debug kenapa bot balas begitu.
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
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada riwayat untuk nomor ini di bot {nomor}.</p>
        ) : (
          <div>
            <p className="mb-2 text-xs text-gray-400">
              {logs[0].nama_brand ? `${logs[0].nama_brand} · ` : ''}
              {logs.length} entri, terbaru di atas
            </p>
            <div className="space-y-2">
              {logs.map((log) => {
                const expanded = expandedId === log.id;
                return (
                  <div key={log.id} className="rounded-xl border border-gray-200 bg-white">
                    <button
                      onClick={() => setExpandedId(expanded ? null : log.id)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${outcomeBadge(log.outcome)}`}>
                            {log.outcome || '-'}
                          </span>
                          <p className="text-sm text-gray-700">
                            {log.stage_prev} → {log.stage_next}
                          </p>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {new Date(log.created_at).toLocaleString('id-ID')}
                        </p>
                      </div>
                      {log.trigger_eskalasi && (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          Eskalasi: {log.trigger_eskalasi}
                        </span>
                      )}
                    </button>

                    {expanded && (
                      <div className="space-y-2 border-t border-gray-100 px-4 py-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-400">Pesan customer</p>
                          <p className="text-gray-800">{log.pesan_customer || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Balasan bot</p>
                          <p className="whitespace-pre-wrap text-gray-800">{log.balasan_bot || '-'}</p>
                        </div>
                        {log.vision_check_result && (
                          <div>
                            <p className="text-xs text-gray-400">Hasil Vision Check</p>
                            <p className="text-gray-800">{log.vision_check_result}</p>
                          </div>
                        )}
                        {log.store_link && (
                          <div>
                            <p className="text-xs text-gray-400">Screenshot</p>
                            <a href={log.store_link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                              Buka link
                            </a>
                          </div>
                        )}
                        {log.context_summary && (
                          <p className="text-xs text-gray-400">{log.context_summary}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function RiwayatPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  return (
    <RequireNomor>
      <RiwayatContent nomor={nomor as Nomor} />
    </RequireNomor>
  );
}
