'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  if (loading) return <LoadingScreen />;
  if (!session) return null;
  return <>{children}</>;
}

export function RequireNomor({ children }: { children: React.ReactNode }) {
  const { session, nomor, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
    else if (!loading && session && !nomor) router.replace('/bind');
  }, [loading, session, nomor, router]);

  if (loading) return <LoadingScreen />;
  if (!session || !nomor) return null;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p style={{ color: 'var(--text-secondary, #666)' }}>Memuat...</p>
    </div>
  );
}
