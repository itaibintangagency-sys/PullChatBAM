# Kirana Monitor

Web app untuk review chat log bot Kirana (nomor 7484 & 1052) dan pengisian review harian.

## Fitur

- Login staff (Supabase Auth)
- Pilih nomor (7484 / 1052) setelah login
- Chat list: kelompok Customer vs Internal, search
- Chat thread: bubble chat, preview media, garis pembatas riwayat lama vs real-time, export CSV
- Review harian: 6 pertanyaan skala 1-5 + catatan
- Kelola nomor internal (whitelist, satu-satunya fitur dengan delete)
- Real-time update via Supabase Realtime

## Setup Lokal

```bash
npm install
cp .env.local.example .env.local
# isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Buka http://localhost:3000

## Environment Variables

| Variable | Keterangan |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key Supabase (aman untuk frontend) |

## Deploy ke Vercel

1. Push project ini ke repo GitHub
2. Buka vercel.com -> Add New Project -> pilih repo
3. Di step Environment Variables, isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY (sama seperti .env.local)
4. Klik Deploy

## Menambah Akun Staff Baru

Lewat Supabase Dashboard:
1. Authentication -> Users -> Add user -> Create new user
2. Isi email + password, centang Auto Confirm User
3. Klik Create user
4. Cek tabel staff_profiles - baris baru otomatis muncul (lewat trigger)
5. Kalau perlu jadi admin, edit kolom role jadi admin dan isi display_name

## Struktur Data (Supabase)

Lihat file supabase_schema_setup.sql yang sudah dijalankan sebelumnya untuk struktur lengkap table:
- chat_logs - data mentah chat (tanpa delete)
- internal_numbers - whitelist nomor kantor (boleh delete)
- review_forms - hasil review harian (tanpa delete)
- staff_profiles - profil staff yang login

## Catatan Teknis

- Data chat masuk otomatis dari WF n8n Full_Chat_Log (7484 & 1052) yang insert ke tabel chat_logs
- Kolom source membedakan historical (hasil import riwayat lama) vs realtime (pesan baru)
- Media tidak di-download ulang - hanya menampilkan media_url yang sudah ada (dari Google Drive existing atau kosong kalau tidak tersedia)
