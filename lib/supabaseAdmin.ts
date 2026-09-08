import { createClient } from '@supabase/supabase-js';

// PENTING: file ini HANYA boleh diimport dari kode server (API routes),
// TIDAK BOLEH diimport dari komponen client ('use client') -- karena
// SUPABASE_SERVICE_ROLE_KEY adalah kunci penuh, bukan anon key yang
// aman untuk browser.
//
// Beda dari client Supabase biasa (yang pakai NEXT_PUBLIC_SUPABASE_ANON_KEY
// dan tunduk ke RLS), client ini pakai Service Role Key -- otomatis
// BYPASS semua RLS policy. Cuma dipakai untuk operasi admin resmi
// (bikin akun staff baru), jangan dipakai sembarangan.

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY belum di-set. Tambahkan di Vercel ' +
    'Environment Variables (tanpa awalan NEXT_PUBLIC_) atau di .env.local.'
  );
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
