'use client';

import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RouteGuard';
import { useAuth } from '@/lib/AuthContext';
import { Nomor, NOMOR_LABELS } from '@/lib/types';

function BindContent() {
  const { setNomor, signOut, profile } = useAuth();
  const router = useRouter();

  function pick(n: Nomor) {
    setNomor(n);
    router.push(`/${n}/chats`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-medium text-gray-900">Pilih nomor</h1>
          <p className="mt-1 text-sm text-gray-500">
            {profile ? `Halo, ${profile.display_name}` : 'Pilih nomor yang mau kamu pantau'}
          </p>
        </div>

        <div className="space-y-3">
          {(['7484', '1052'] as Nomor[]).map((n) => (
            <button
              key={n}
              onClick={() => pick(n)}
              className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-gray-400"
            >
              <p className="font-medium text-gray-900">Nomor {n}</p>
              <p className="text-sm text-gray-500">{NOMOR_LABELS[n]}</p>
            </button>
          ))}
        </div>

        <button
          onClick={() => signOut()}
          className="mt-6 w-full text-center text-sm text-gray-400 hover:text-gray-600"
        >
          Keluar
        </button>
      </div>
    </div>
  );
}

export default function BindPage() {
  return (
    <RequireAuth>
      <BindContent />
    </RequireAuth>
  );
}
