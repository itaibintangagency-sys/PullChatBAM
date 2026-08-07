'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabase';
import { StaffProfile, Nomor } from './types';
import type { Session } from '@supabase/supabase-js';

interface AuthContextValue {
  session: Session | null;
  profile: StaffProfile | null;
  nomor: Nomor | null;
  loading: boolean;
  setNomor: (n: Nomor) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [nomor, setNomorState] = useState<Nomor | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? (localStorage.getItem('kirana_nomor') as Nomor | null) : null;
    if (stored === '7484' || stored === '1052') setNomorState(stored);

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('staff_profiles')
      .select('id, display_name, role')
      .eq('id', userId)
      .single();
    if (data) setProfile(data as StaffProfile);
  }

  function setNomor(n: Nomor) {
    localStorage.setItem('kirana_nomor', n);
    setNomorState(n);
  }

  async function signOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('kirana_nomor');
    setNomorState(null);
    router.push('/login');
  }

  return (
    <AuthContext.Provider value={{ session, profile, nomor, loading, setNomor, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
