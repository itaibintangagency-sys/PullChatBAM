'use client';

import { useEffect, useState } from 'react';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import type { RefreshFn } from '@/lib/useAutoRefresh';

interface PageRefreshOptions {
  /** Nama unik halaman, dipakai utk mengingat pilihan ON/OFF di browser */
  storageKey: string;
  /** Jeda auto-refresh (default 30 detik) */
  intervalMs?: number;
  /** false = halaman memanggil refreshNow sendiri utk muat awal */
  runOnMount?: boolean;
}

/**
 * Pembungkus siap pakai: auto-refresh + pilihan ON/OFF yang diingat + props utk <RefreshBar />.
 * Pemakaian di halaman:
 *   const { refreshNow, barProps } = usePageRefresh(load, { storageKey: 'dashboard' });
 *   <RefreshBar {...barProps} />
 */
export function usePageRefresh(load: RefreshFn, { storageKey, intervalMs = 30_000, runOnMount = true }: PageRefreshOptions) {
  const key = `autorefresh:${storageKey}`;
  const [autoOn, setAutoOn] = useState(true);

  const { lastUpdated, refreshing, failed, refreshNow } = useAutoRefresh(load, {
    intervalMs,
    enabled: autoOn,
    runOnMount,
  });

  // Baca pilihan tersimpan setelah mount (supaya tidak beda dengan render server)
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === 'off') setAutoOn(false);
    } catch {
      /* penyimpanan browser tidak tersedia -> abaikan */
    }
  }, [key]);

  function toggle() {
    const next = !autoOn;
    setAutoOn(next);
    try {
      localStorage.setItem(key, next ? 'on' : 'off');
    } catch {
      /* abaikan */
    }
    if (next) void refreshNow();
  }

  return {
    refreshNow,
    barProps: {
      lastUpdated,
      refreshing,
      failed,
      autoOn,
      intervalSec: intervalMs / 1000,
      onToggle: toggle,
      onRefresh: () => void refreshNow(),
    },
  };
}
