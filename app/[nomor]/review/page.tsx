'use client';

import { useState, use } from 'react';
import { RequireNomor } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Nomor } from '@/lib/types';

const QUESTIONS: { key: keyof Scores; label: string }[] = [
  { key: 'skor_teknikal', label: 'Bot merespons pesan tanpa error atau balasan ganda hari ini' },
  { key: 'skor_handoff', label: 'Kelengkapan dan kejelasan data yang bot kirim ke staff (handoff)' },
  { key: 'skor_completion', label: 'Customer berhasil selesai sampai handoff tanpa banyak drop-off' },
  { key: 'skor_volume', label: 'Volume tiket hari ini sesuai ekspektasi' },
  { key: 'skor_cs_handling', label: 'Kecepatan dan kualitas penanganan CS saat handle customer manual' },
  { key: 'skor_kepuasan_umum', label: 'Kepuasan keseluruhan terhadap performa bot dan CS hari ini' },
];

type Scores = {
  skor_teknikal: number;
  skor_handoff: number;
  skor_completion: number;
  skor_volume: number;
  skor_cs_handling: number;
  skor_kepuasan_umum: number;
};

function ReviewContent({ nomor }: { nomor: Nomor }) {
  const { profile } = useAuth();
  const [scores, setScores] = useState<Partial<Scores>>({});
  const [catatan, setCatatan] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function setScore(key: keyof Scores, value: number) {
    setScores((s) => ({ ...s, [key]: value }));
  }

  async function handleSubmit() {
    const missing = QUESTIONS.filter((q) => !scores[q.key]);
    if (missing.length > 0) {
      setError('Semua pertanyaan wajib dijawab.');
      return;
    }
    setError('');
    setSubmitting(true);

    const { error: insertError } = await supabase.from('review_forms').insert({
      submitted_by: profile?.id,
      nomor_bind: nomor,
      ...scores,
      catatan: catatan.trim() || null,
    });

    setSubmitting(false);
    if (insertError) {
      setError('Gagal menyimpan review. Coba lagi.');
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div>
        <NavHeader nomor={nomor} />
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-lg font-medium text-gray-900">Review tersimpan</p>
          <p className="mt-1 text-sm text-gray-500">Terima kasih sudah mengisi review harian.</p>
          <button
            onClick={() => {
              setSubmitted(false);
              setScores({});
              setCatatan('');
            }}
            className="mt-6 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Isi review lain
          </button>
        </main>
      </div>
    );
  }

  return (
    <div>
      <NavHeader nomor={nomor} />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Review harian</h1>
        <p className="mb-6 text-sm text-gray-500">Nilai tiap pertanyaan dengan angka 1 sampai 5.</p>

        <div className="mb-4 flex justify-center gap-4 text-xs text-gray-500">
          <span>1 = Sangat buruk</span>
          <span>3 = Cukup</span>
          <span>5 = Sangat baik</span>
        </div>

        <div className="space-y-4">
          {QUESTIONS.map((q) => (
            <div key={q.key} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="mb-3 text-sm text-gray-800">{q.label}</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setScore(q.key, n)}
                    className={`h-9 w-9 rounded-lg border text-sm font-medium ${
                      scores[q.key] === n
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 text-sm text-gray-800">Catatan tambahan (opsional)</p>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              rows={3}
              placeholder="Tulis kendala, saran, atau hal lain yang perlu diperhatikan..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-6 w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? 'Menyimpan...' : 'Simpan review'}
        </button>
      </main>
    </div>
  );
}

export default function ReviewPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  return (
    <RequireNomor>
      <ReviewContent nomor={nomor as Nomor} />
    </RequireNomor>
  );
}
