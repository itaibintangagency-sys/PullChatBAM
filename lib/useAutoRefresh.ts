'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  /** Jeda antar refresh otomatis (default 30 detik) */
  intervalMs?: number;
  /** false = tanpa refresh otomatis (refresh manual tetap bisa) */
  enabled?: boolean;
  /** Saat tab kembali aktif, refresh bila data lebih tua dari ini (default 5 detik) */
  staleAfterMs?: number;
  /** false = jangan muat otomatis saat mount (halaman sendiri yang memanggil refreshNow, mis. saat parameter berubah) */
  runOnMount?: boolean;
}

// Fungsi muat-data milik halaman. Kembalikan false kalau gagal (mis. query error).
export type RefreshFn = () => Promise<boolean | void> | boolean | void;

/**
 * Auto-refresh yang aman utk dashboard:
 * - memuat sekali saat halaman dibuka
 * - polling tiap `intervalMs`, HANYA saat tab terlihat (hemat query)
 * - refresh segera saat tab/jendela kembali aktif bila datanya sudah usang
 * - tidak pernah menjalankan dua refresh bersamaan; permintaan yang datang saat
 *   refresh berjalan diantrikan satu kali (mis. event realtime beruntun)
 */
export function useAutoRefresh(refresh: RefreshFn, options: Options = {}) {
  const { intervalMs = 30_000, enabled = true, staleAfterMs = 5_000, runOnMount = true } = options;

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const refreshRef = useRef(refresh);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const lastRun = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    setRefreshing(true);
    try {
      const ok = await refreshRef.current();
      if (mounted.current) {
        if (ok === false) {
          setFailed(true);
        } else {
          setFailed(false);
          setLastUpdated(new Date());
        }
      }
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      lastRun.current = Date.now();
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
      if (queued.current && mounted.current) {
        queued.current = false;
        void run();
      }
    }
  }, []);

  // Muat pertama kali
  useEffect(() => {
    if (runOnMount) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // Polling berkala (hanya saat tab terlihat)
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void run();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, run]);

  // Kembali ke tab / jendela -> segarkan kalau datanya sudah usang
  useEffect(() => {
    if (!enabled) return;
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRun.current >= staleAfterMs) void run();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [enabled, staleAfterMs, run]);

  return { lastUpdated, refreshing, failed, refreshNow: run };
}
