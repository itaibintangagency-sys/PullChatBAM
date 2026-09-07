'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { NOMOR_LABELS, Nomor } from '@/lib/types';

export function NavHeader({ nomor }: { nomor: Nomor }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut, setNomor } = useAuth();

  const tabs = [
    { href: `/${nomor}`, label: 'Dashboard' }, 
    { href: `/${nomor}/chats`, label: 'Chat log' },       
    { href: `/${nomor}/profil`, label: 'Profil Customer' },
    { href: `/${nomor}/dormant`, label: 'Dormant' }, 
    { href: `/${nomor}/escalations`, label: 'Eskalasi' },
    { href: `/${nomor}/blacklist`, label: 'Blacklist' },
    { href: `/${nomor}/review`, label: 'Review harian' },
    { href: `/${nomor}/riwayat`, label: 'Riwayat Customer' },
    { href: `/${nomor}/internal-numbers`, label: 'Nomor internal' },
    { href: '/profil-saya', label: 'Profil Saya' }, 
    { href: '/status-bot', label: 'Status Bot' },...(profile?.role === 'admin' ? [
  { href: '/pengaturan/staff-routing', label: 'Pengaturan' },
  { href: '/pengaturan/kelola-staff', label: 'Kelola Staff' },
] : []),
];
  
  function switchNomor() {
    const other: Nomor = nomor === '7484' ? '1052' : '7484';
    setNomor(other);
    router.push(`/${other}/chats`);
  }

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-56 flex-col border-r border-gray-200 bg-white">
      {/* Logo & nomor aktif */}
      <div className="border-b border-gray-100 px-4 py-4">
        <p className="text-sm font-medium text-gray-900">Kirana Monitor</p>
        <p className="text-xs text-gray-500">{NOMOR_LABELS[nomor]}</p>
      </div>

      {/* Navigasi */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {tabs.map((t) => {
          const isActive = pathname === t.href || pathname?.startsWith(t.href + '/');
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`block rounded-lg px-3 py-2 text-sm ${
                isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* Ganti nomor & akun, ditaruh bawah */}
      <div className="space-y-2 border-t border-gray-100 px-4 py-4">
        <button
          onClick={switchNomor}
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
        >
          ⇄ Ganti nomor
        </button>
        <div className="flex items-center justify-between">
          <span className="truncate text-xs text-gray-500" title={profile?.display_name || ''}>
            {profile?.display_name || '...'}
          </span>
          <button onClick={() => signOut()} className="shrink-0 text-xs text-gray-400 hover:text-red-600">
            Keluar
          </button>
        </div>
      </div>
    </aside>
  );
}
