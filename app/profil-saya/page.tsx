'use client';

import { useState } from 'react';
import { RequireAuth } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Super Admin',
  staff: 'Staff',
};

function ProfilSayaContent() {
  const { nomor, profile, session } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError('');
    console.log('DEBUG profile.id:', profile?.id); 
    setNameSuccess('');

    if (!displayName.trim()) {
      setNameError('Nama tidak boleh kosong.');
      return;
    }
    if (!profile?.id) return;

    setNameSaving(true);
    const { error } = await supabase.from('staff_profiles').update({ display_name: displayName.trim() }).eq('id', profile.id);
    setNameSaving(false);

    if (error) {
      setNameError('Gagal menyimpan nama.');
      return;
    }
  setNameSuccess('Nama berhasil diubah. Memuat ulang...');
  setTimeout(() => window.location.reload(), 800);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPassword.length < 6) {
      setPwError('Password minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Konfirmasi password tidak cocok.');
      return;
    }

    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);

    if (error) {
      setPwError('Gagal mengubah password: ' + error.message);
      return;
    }
    setPwSuccess('Password berhasil diubah.');
    setNewPassword('');
    setConfirmPassword('');
  }

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Profil Saya</h1>
        <p className="mb-6 text-sm text-gray-500">{session?.user.email}</p>

        {/* Info role */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400">Role</p>
          <span className="mt-1 inline-block rounded bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
            {ROLE_LABELS[profile?.role || ''] || profile?.role}
          </span>
        </div>

        {/* Ubah nama */}
        <form onSubmit={handleSaveName} className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-gray-900">Nama tampilan</p>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
          />
          {nameError && <p className="mt-2 text-sm text-red-600">{nameError}</p>}
          {nameSuccess && <p className="mt-2 text-sm text-green-600">{nameSuccess}</p>}
          <button
            type="submit"
            disabled={nameSaving}
            className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {nameSaving ? 'Menyimpan...' : 'Simpan nama'}
          </button>
        </form>

        {/* Ganti password */}
        <form onSubmit={handleChangePassword} className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-gray-900">Ganti password</p>
          <div className="space-y-2">
            <input
              type="password"
              placeholder="Password baru (min. 6 karakter)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            <input
              type="password"
              placeholder="Ulangi password baru"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
          </div>
          {pwError && <p className="mt-2 text-sm text-red-600">{pwError}</p>}
          {pwSuccess && <p className="mt-2 text-sm text-green-600">{pwSuccess}</p>}
          <button
            type="submit"
            disabled={pwSaving}
            className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {pwSaving ? 'Menyimpan...' : 'Ganti password'}
          </button>
        </form>
      </main>
    </div>
  );
}

export default function ProfilSayaPage() {
  return (
    <RequireAuth>
      <ProfilSayaContent />
    </RequireAuth>
  );
}
