'use client';

import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { StaffProfile } from '@/lib/types';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Super Admin',
  staff: 'Staff',
};

// Nilai persis yang muncul di kolom escalations.assigned_to sekarang
// (dicek langsung dari data, bukan tebakan -- kalau nanti ada nama
// staff baru yang dipakai di l0_config untuk eskalasi, tambahkan di sini juga)
const ESCALATION_ALIAS_OPTIONS = [
  'SAGETA',
  'STAF_COMUNITY',
  'INDAH',
  'YUL',
  'YOAN',
  'RINTAN',
  'RINTAN2',
  'RIZKI',
  'SALMA',
  'CS',
];

function roleBadgeClass(role: string) {
  return role === 'admin' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600';
}

function KelolaStaffContent() {
  const { nomor, profile: myProfile } = useAuth();
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Form tambah staff
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEscalationAlias, setNewEscalationAlias] = useState('');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('staff_profiles').select('*').order('display_name');
    setProfiles((data as StaffProfile[]) || []);
    setLoading(false);
  }

  async function changeRole(id: string, newRole: 'admin' | 'staff') {
    setError('');
    setSavingId(id);
    const { error: updateError } = await supabase.from('staff_profiles').update({ role: newRole }).eq('id', id);
    setSavingId(null);
    if (updateError) {
      setError('Gagal mengubah role. Coba lagi.');
      return;
    }
    load();
  }

  // Update langsung begitu dropdown dipilih -- tanpa tombol simpan terpisah
  async function updateAlias(id: string, alias: string) {
    setError('');
    setSavingId(id);
    const { error: updateError } = await supabase
      .from('staff_profiles')
      .update({ escalation_alias: alias || null })
      .eq('id', id);
    setSavingId(null);
    if (updateError) {
      setError('Gagal menyimpan alias. Coba lagi.');
      return;
    }
    load();
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');

    if (!newEmail.trim() || !newPassword || !newDisplayName.trim()) {
      setAddError('Semua field wajib diisi.');
      return;
    }
    if (newPassword.length < 6) {
      setAddError('Password minimal 6 karakter.');
      return;
    }

    setAdding(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setAddError('Sesi login habis, coba refresh halaman.');
      setAdding(false);
      return;
    }

    const res = await fetch('/api/create-staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: newEmail.trim(),
        password: newPassword,
        displayName: newDisplayName.trim(),
        escalationAlias: newEscalationAlias,
      }),
    });
    const result = await res.json();

    setAdding(false);
    if (!res.ok) {
      setAddError(result.error || 'Gagal menambah staff.');
      return;
    }

    setAddSuccess(`Akun ${newDisplayName} berhasil dibuat.`);
    setNewEmail('');
    setNewPassword('');
    setNewDisplayName('');
    setNewEscalationAlias('');
    load();
  }

  const adminCount = profiles.filter((p) => p.role === 'admin').length;

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Kelola Staff</h1>
        <p className="mb-6 text-sm text-gray-500">Tambah akun baru dan ubah role staff yang sudah ada.</p>

        {/* Form tambah staff */}
        <form onSubmit={handleAddStaff} className="mb-8 rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-gray-900">Tambah staff baru</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Nama"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 sm:col-span-2"
            />
            <input
              type="email"
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            <input
              type="text"
              placeholder="Password awal (min. 6 karakter)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            <select
              value={newEscalationAlias}
              onChange={(e) => setNewEscalationAlias(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 outline-none focus:border-gray-500 sm:col-span-2"
            >
              <option value="">Alias eskalasi (opsional)</option>
              {ESCALATION_ALIAS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Akun baru selalu dibuat dengan role &quot;Staff&quot; — ubah jadi admin lewat daftar di bawah kalau perlu.
            Alias eskalasi dipakai untuk cocokkan tiket di tabel escalations (kolom assigned_to) dengan akun ini.
          </p>
          {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}
          {addSuccess && <p className="mt-2 text-sm text-green-600">{addSuccess}</p>}
          <button
            type="submit"
            disabled={adding}
            className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {adding ? 'Membuat akun...' : 'Tambah staff'}
          </button>
        </form>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {/* Daftar staff & ubah role */}
        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {profiles.map((p) => {
              const isMe = p.id === myProfile?.id;
              const isSaving = savingId === p.id;
              const lastAdminGuard = p.role === 'admin' && adminCount === 1;

              return (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {p.display_name}
                      {isMe && <span className="ml-2 text-xs text-gray-400">(akun kamu)</span>}
                    </p>
                    <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(p.role)}`}>
                      {ROLE_LABELS[p.role] || p.role}
                    </span>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-400">Alias eskalasi:</span>
                      <select
                        value={p.escalation_alias || ''}
                        onChange={(e) => updateAlias(p.id, e.target.value)}
                        disabled={isSaving}
                        className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 outline-none focus:border-gray-400 disabled:opacity-40"
                      >
                        <option value="">— belum diisi —</option>
                        {ESCALATION_ALIAS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {isMe ? (
                    <span className="shrink-0 text-xs text-gray-400" title="Tidak bisa ubah role sendiri, biar tidak sengaja terkunci">
                      Tidak bisa diubah sendiri
                    </span>
                  ) : (
                    <div className="flex shrink-0 gap-2">
                      {p.role !== 'staff' && (
                        <button
                          onClick={() => changeRole(p.id, 'staff')}
                          disabled={isSaving || lastAdminGuard}
                          title={lastAdminGuard ? 'Ini admin terakhir, tidak bisa diturunkan' : undefined}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        >
                          Jadikan Staff
                        </button>
                      )}
                      {p.role !== 'admin' && (
                        <button
                          onClick={() => changeRole(p.id, 'admin')}
                          disabled={isSaving}
                          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
                        >
                          Jadikan Admin
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function KelolaStaffPage() {
  return (
    <RequireAdmin>
      <KelolaStaffContent />
    </RequireAdmin>
  );
}
