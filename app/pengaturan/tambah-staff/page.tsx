'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TambahStaffPage() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    display_name: '',
    role: 'staff',
    escalation_alias: '',
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    // Ambil token sesi admin yang sedang login -- ini yang dikirim
    // ke API buat dibuktikan "beneran admin", karena proyek ini
    // tidak pakai cookie sesi yang bisa dibaca server otomatis.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setStatus('error');
      setMessage('Sesi login tidak ditemukan, coba login ulang');
      return;
    }

    try {
      const res = await fetch('/api/staff/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Terjadi kesalahan');
        return;
      }

      setStatus('success');
      setMessage(data.message);
      setForm({ email: '', password: '', display_name: '', role: 'staff', escalation_alias: '' });
    } catch {
      setStatus('error');
      setMessage('Gagal terhubung ke server');
    }
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Tambah Staff Baru</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Password Sementara</label>
          <input
            type="text"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Nama</label>
          <input
            type="text"
            required
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Role</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full border rounded px-3 py-2"
          >
            <option value="staff">Staff</option>
            <option value="admin">Super Admin</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Alias Eskalasi <span className="text-gray-400">(opsional)</span>
          </label>
          <input
            type="text"
            placeholder="contoh: RIZKI, RINTAN2"
            value={form.escalation_alias}
            onChange={(e) => setForm({ ...form, escalation_alias: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">
            Nama persis yang muncul di kolom assigned_to tabel escalations.
            Kosongkan kalau tidak perlu.
          </p>
        </div>

        <button
          type="submit"
          disabled={status === 'loading'}
          className="w-full bg-black text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {status === 'loading' ? 'Memproses...' : 'Buat Staff'}
        </button>

        {message && (
          <p className={status === 'success' ? 'text-green-600' : 'text-red-600'}>
            {message}
          </p>
        )}
      </form>
    </div>
  );
}
