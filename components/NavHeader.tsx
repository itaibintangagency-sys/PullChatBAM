'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { NOMOR_LABELS, Nomor } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export function NavHeader({ nomor }: { nomor: Nomor }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut, setNomor } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const groups: NavGroup[] = [
    {
      label: 'Utama',
      items: [
        { href: `/${nomor}`, label: 'Dashboard' },
        { href: `/${nomor}/chats`, label: 'Chat log' },
        { href: `/${nomor}/escalations`, label: 'Eskalasi' },
        { href: `/${nomor}/dormant`, label: 'Dormant' },
        { href: `/${nomor}/review`, label: 'Review harian' },
      ],
    },
    {
      label: 'Customer',
      items: [
        { href: '/phonebook', label: 'Phonebook' },
        { href: '/profil', label: 'Profil Customer' },
        { href: `/${nomor}/riwayat`, label: 'Riwayat Customer' },
        { href: `/${nomor}/blacklist`, label: 'Blacklist' },
      ],
    },
    {
      label: 'Sistem',
      items: [
        { href: '/status-bot', label: 'Status Bot' },
        { href: '/internal-numbers', label: 'Nomor internal' },
        ...(isAdmin ? [{ href: '/channel', label: 'Channel WA' }] : []),
      ],
    },
    ...(isAdmin
      ? [
          {
            label: 'Pengaturan',
            items: [
              { href: '/pengaturan/staff-routing', label: 'Staff & Routing' },
              { href: '/pengaturan/kelola-staff', label: 'Kelola Staff' },
            ],
          },
        ]
      : []),
  ];

  // Link referensi/akun -- sengaja di luar grup, ditaruh paling bawah sebelum
  // blok ganti-nomor & keluar (bukan bagian dari navigasi kerja harian).
  const footerLinks: NavItem[] = [
    { href: '/profil-saya', label: 'Profil Saya' },
    { href: '/legenda', label: 'Legenda & Panduan' },
  ];

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + '/');
  }

  function linkClass(active: boolean) {
    return `block rounded-lg px-3 py-2 text-sm ${
      active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;
  }

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

      {/* Navigasi, dikelompokkan per fungsi */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className={linkClass(isActive(item.href))}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Referensi & akun -- di luar grup navigasi kerja */}
      <div className="space-y-0.5 border-t border-gray-100 px-2 py-3">
        {footerLinks.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass(isActive(item.href))}>
            {item.label}
          </Link>
        ))}
      </div>

      {/* Ganti nomor & akun, ditaruh paling bawah */}
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
