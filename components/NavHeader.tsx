'use client';

import { useEffect, useState } from 'react';
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
  const [open, setOpen] = useState(false); // drawer menu di layar kecil

  // Drawer menutup otomatis saat pindah halaman atau tombol Esc ditekan
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const groups: NavGroup[] = [
    {
      label: 'Utama',
      items: [
        { href: `/${nomor}`, label: 'Dashboard' },
        { href: `/${nomor}/chats`, label: 'Chat log' },
        { href: '/meta/chats', label: 'Chat log IG/FB' },
        { href: '/eskalasi', label: 'Eskalasi' },
        { href: `/${nomor}/dormant`, label: 'Dormant' },
        { href: `/${nomor}/feedback`, label: 'Feedback chatbot' },
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
        ...(isAdmin ? [{ href: '/aduan', label: 'Aduan' }] : []),
        ...(isAdmin ? [{ href: '/channel', label: 'Channel WA' }] : []),
        ...(isAdmin ? [{ href: '/jejak', label: 'Jejak eksekusi' }] : []),
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

  // Tier "Interaktif" di type scale: semua link nav dapat font-medium, biar
  // kebeda dari body text biasa yang regular.
  function linkClass(active: boolean) {
    return `block rounded-lg px-3 py-2 text-sm font-medium ${
      active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;
  }

  function switchNomor() {
    const other: Nomor = nomor === '7484' ? '1052' : '7484';
    setNomor(other);
    router.push(`/${other}/chats`);
  }

  const isi = (
    <>
      {/* Logo & nomor aktif */}
      <div className="border-b border-gray-100 px-4 py-4">
        <p className="text-sm font-semibold text-gray-900">Kirana Monitor</p>
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
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
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
    </>
  );

  return (
    <>
      {/* Layar lebar: sidebar tetap */}
      <aside className="fixed left-0 top-0 hidden h-screen w-56 flex-col border-r border-gray-200 bg-white md:flex">{isi}</aside>

      {/* Ponsel: bilah atas dengan tombol hamburger + drawer */}
      <div className="md:hidden">
        <header className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-3 border-b border-gray-200 bg-white px-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Buka menu"
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">Kirana Monitor</p>
            <p className="truncate text-[11px] leading-none text-gray-500">{NOMOR_LABELS[nomor]}</p>
          </div>
        </header>

        {open && (
          <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col bg-white shadow-xl">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>
              {isi}
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
