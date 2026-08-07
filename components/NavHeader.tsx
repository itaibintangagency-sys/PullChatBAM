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
    { href: `/${nomor}/chats`, label: 'Chat log' },
    { href: `/${nomor}/review`, label: 'Review harian' },
    { href: `/${nomor}/internal-numbers`, label: 'Nomor internal' },
  ];

  function switchNomor() {
    const other: Nomor = nomor === '7484' ? '1052' : '7484';
    setNomor(other);
    router.push(`/${other}/chats`);
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-sm font-medium text-gray-900">Kirana Monitor</p>
            <p className="text-xs text-gray-500">{NOMOR_LABELS[nomor]}</p>
          </div>
          <nav className="flex gap-1">
            {tabs.map((t) => {
              const active = pathname?.startsWith(t.href.split('?')[0].replace(/\/[^/]+$/, '')) || pathname === t.href;
              const isActive = pathname === t.href || (t.label === 'Chat log' && pathname?.includes('/chats'));
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={switchNomor} className="text-sm text-gray-500 hover:text-gray-800">
            Ganti nomor
          </button>
          <span className="text-sm text-gray-300">|</span>
          <span className="text-sm text-gray-700">{profile?.display_name || '...'}</span>
          <button onClick={() => signOut()} className="text-sm text-gray-400 hover:text-red-600">
            Keluar
          </button>
        </div>
      </div>
    </header>
  );
}
