'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Poppins, Work_Sans } from 'next/font/google';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

const poppins = Poppins({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-heading' });
const workSans = Work_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-body' });

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) router.replace('/bind');
  }, [loading, session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      setError('Email atau password salah.');
      return;
    }
    router.push('/bind');
  }

  return (
    <div
      className={`${poppins.variable} ${workSans.variable} flex min-h-screen items-center justify-center px-4`}
      style={{ backgroundColor: '#0A0A0F', color: '#F5F5F7', fontFamily: 'var(--font-body), sans-serif' }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.375rem' }}>
            Kirana Monitor
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#A1A1AA' }}>
            Masuk untuk lihat chat log dan isi review
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6"
          style={{ backgroundColor: '#16161D', border: '1px solid #2A2A33' }}
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm" style={{ color: '#A1A1AA' }}>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@bintangagency.id"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: '#0A0A0F', border: '1px solid #2A2A33', color: '#F5F5F7' }}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm" style={{ color: '#A1A1AA' }}>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: '#0A0A0F', border: '1px solid #2A2A33', color: '#F5F5F7' }}
              />
            </div>

            {error && <p className="text-sm" style={{ color: '#EF4444' }}>{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg px-3 py-2 text-sm font-medium transition-transform active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: '#E4262A', color: '#F5F5F7' }}
            >
              {submitting ? 'Masuk...' : 'Masuk'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
