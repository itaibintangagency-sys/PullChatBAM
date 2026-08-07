'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

export default function HomePage() {
  const { session, nomor, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
    else if (!nomor) router.replace('/bind');
    else router.replace(`/${nomor}/chats`);
  }, [loading, session, nomor, router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p style={{ color: '#666', fontSize: 14 }}>Memuat...</p>
    </div>
  );
}
