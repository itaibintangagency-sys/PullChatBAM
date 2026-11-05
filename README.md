# Kirana Monitor

Web app internal untuk memantau bot WhatsApp Kirana (nomor 1052 dan 7484) dan bot Meta (Instagram dan Facebook), mengelola tiket eskalasi ke staf, serta mengatur routing dan Channel WhatsApp.

Stack: Next.js 16 (App Router), React 19, Tailwind 4, Supabase (Auth, Postgres, Realtime), dan n8n + WAHA di sisi bot.

## Fitur

**Pemantauan**
- Dashboard per nomor: total, terbuka, dan sudah resolve untuk eskalasi; dormant; blacklist; beban kerja per staf (belum vs sudah resolve)
- Chat log WhatsApp: daftar customer vs internal, bubble chat, preview media, export CSV
- Chat log IG/FB (`/meta/chats`): percakapan bot Meta, dipisah per kanal
- Riwayat Customer: jejak keputusan bot per nomor (bisa dicari lewat nama atau username, filter "hanya eskalasi")
- Profil Customer dan Phonebook
- Feedback chatbot: penilaian customer terhadap bot Kirana (bukan staf): rata-rata rating, tingkat respons, sebaran rating, rekap per jenis pengguna, tren mingguan, dan alasan terbaru
- Status Bot: tabel semua workflow n8n yang terhubung dengan status aktif/nonaktif langsung dari n8n; klik baris untuk melihat riwayat ON/OFF workflow itu. Super Admin bisa menyalakan atau mematikan workflow dari tabel (jaring pengaman dan sub-workflow terkunci); tiap aksi tercatat di `bot_toggle_logs`

**Tiket eskalasi**
- Halaman Eskalasi per bot: urutkan menurut prioritas, waktu masuk, nama, staf, atau status; tandai selesai satu per satu
- Tabel Eskalasi (`/eskalasi`): semua bot, filter dan ekspor CSV
- **RESOLVE ALL**: staf (atau admin atas nama staf) mengajukan resolve semua tiket OPEN. Tiket baru berubah RESOLVE setelah disetujui penyetuju, dengan batas waktu 24 jam. Bisa diajukan dari web atau WhatsApp (lihat bagian di bawah)

**Blacklist**
- Kandidat blacklist dari bot menunggu keputusan peninjau (CONFIRMED atau CLEARED)
- Saat dinyatakan CLEARED (bukan spam), bot mengirim sambutan Kirana ke nomor itu satu kali dan sesinya dikembalikan ke menu

**Admin (Super Admin)**
- Channel WA: kontrol broadcast Channel, antrean brand, jadwal
- Pengaturan: Staff & Routing (penerima notifikasi, pool, peran) dan Kelola Staff (akun login)

Panduan fungsi tiap menu untuk pengguna ada di halaman **Legenda & Panduan** di dalam aplikasi.

## Setup Lokal

```bash
npm install
# buat .env.local dan isi variabel pada tabel di bawah
npm run dev
```

Buka http://localhost:3000. Repo ini memakai Next.js versi baru; baca `AGENTS.md` sebelum mengubah kode.

## Environment Variables

| Variable | Wajib | Dipakai untuk |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ya | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ya | Anon key Supabase (aman untuk frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | untuk fitur admin | Rute server: buat akun staf, kontrol Channel, RESOLVE ALL. Jangan pernah diberi awalan `NEXT_PUBLIC_` |
| `BLACKLIST_NOTIFY_WEBHOOK_URL` | untuk blacklist dan RESOLVE ALL dari web | URL webhook n8n `blacklist-notify`. Webhook sambutan (`blacklist-cleared`) dan pemberitahuan penyetuju (`resolve-request-notify`) diturunkan dari URL ini |
| `BLACKLIST_NOTIFY_SECRET` | sama | Nilai header `x-webhook-secret` untuk ketiga webhook di atas |
| `BLACKLIST_CLEARED_WEBHOOK_URL` | opsional | Menimpa URL webhook sambutan |
| `RESOLVE_NOTIFY_WEBHOOK_URL` | opsional | Menimpa URL webhook pemberitahuan penyetuju |
| `CHANNEL_WEBHOOK_URL`, `CHANNEL_WEBHOOK_SECRET` | untuk Channel WA | Webhook n8n untuk perintah SEND NOW, OK, GANTI |
| `N8N_API_KEY` | untuk Status Bot | API key n8n untuk membaca dan menyalakan atau mematikan workflow |
| `WAHA_API_KEY` | untuk preview media | Proxy media WAHA (`/api/media-proxy`) |

Tanpa variabel opsional, fitur terkait menampilkan pesan "Server not configured"; fitur lain tetap berjalan.

## Deploy ke Vercel

1. Hubungkan repo GitHub di vercel.com (Add New Project)
2. Isi Environment Variables sesuai tabel di atas
3. Deploy. Push ke `main` otomatis men-deploy ulang

## Menambah Akun Staf

Cara termudah: login sebagai Super Admin, buka **Pengaturan → Kelola Staff**.

Atau lewat Supabase Dashboard: Authentication → Users → Add user (centang Auto Confirm User). Baris di `staff_profiles` muncul otomatis lewat trigger; ubah `role` jadi `admin` bila perlu.

Isi **escalation_alias** akun staf supaya tiketnya terfilter otomatis. Alias adalah kode di kolom `escalations.assigned_to` (misalnya `RINTAN`), bukan nama tampilan.

## Peran dan Routing (tabel `l0_config`)

Satu baris per nomor staf. Siapa menerima apa ditentukan oleh flag di baris itu, bukan nomor yang tertulis di kode atau workflow. Memindahkan tugas ke nomor baru cukup dengan mengubah flag.

| Kolom | Arti |
|---|---|
| `receives_blacklist_alert` | Menerima notifikasi kandidat blacklist |
| `is_blacklist_reviewer` | Boleh memutuskan CLEARED atau CONFIRMED lewat WhatsApp |
| `is_resolve_approver` | Menyetujui atau menolak RESOLVE ALL |
| `is_channel_verifier` | Menerima dan mengirim perintah verifikasi Channel WA (STATUS, TRUE/FALSE, dst.) |
| `can_control_bot` | Boleh menyalakan dan mematikan bot |
| `escalation_alias`, `pool`, `urutan`, `active` | Alias tiket, pool routing, urutan, aktif atau tidak |

Flag diubah dari **Pengaturan → Staff & Routing** atau langsung di tabel.

## Alur RESOLVE ALL

1. Pengaju: kirim `RESOLVE ALL [catatan]` ke bot staf di WhatsApp, atau tekan **Ajukan RESOLVE ALL** di halaman Eskalasi atau Dashboard
2. Semua pemegang `is_resolve_approver` menerima pesan WhatsApp berisi kode 8 karakter
3. Penyetuju membalas `SETUJU <kode>` atau `TOLAK <kode>`. Akun web yang aliasnya sama dengan alias penyetuju juga bisa memakai tombol Setujui atau Tolak
4. Bila disetujui, tiket menjadi RESOLVE dan sesi customer dikembalikan ke MAIN_MENU dengan status dormant dicabut. Semua ini dikerjakan oleh fungsi database `decide_resolve_request`, jadi hasilnya sama dari web maupun WhatsApp

Permintaan tersimpan di tabel `resolve_requests`. Tabel itu hanya diubah lewat fungsi `create_resolve_request` dan `decide_resolve_request`, yang hanya bisa dipanggil `service_role`.

## Struktur Data (Supabase)

Daftar tabel dan kolom ada di database; ringkasan kelompoknya:

| Kelompok | Tabel |
|---|---|
| Chat | `chat_logs` (tanpa delete), `internal_numbers`, `internal_ig_accounts`, `import_jobs` |
| Customer dan bot | `phonebook` (stage dan konteks sesi), `bot_decision_log`, `dormant_tracking`, `blacklist`, `feedback`, `ss_registry` |
| Eskalasi | `escalations`, `resolve_requests`, `meta_escalation_routes` |
| Staf dan routing | `staff_profiles`, `l0_config`, `l0_config_audit`, `routing_pools` |
| Channel WA | `campaign_links`, `channel_broadcast_log`, `channel_broadcast_control`, `broadcast_verification`, `brand_skip` |
| Lainnya | `bot_toggle_logs`, `service_labels`, `public_holidays`, `tiktok_lead_webhook_raw`, `l1_staff`, `review_forms` (lama, tidak dipakai lagi) |

Semua tabel memakai Row Level Security. Perubahan skema dicatat sebagai migrasi Supabase.

## Integrasi n8n

Data masuk dan keluar lewat workflow n8n (WAHA untuk WhatsApp, Meta untuk IG/FB):

- Pencatat chat mengisi `chat_logs`; kolom `source` membedakan `historical` (impor riwayat) dan `realtime`
- Bot customer 1052 dan 7484, serta bot Meta IG dan FB
- Staff Reply (RESOLVE, menu tiket, RESOLVE ALL, SETUJU/TOLAK), Command Listener (perintah verifikator Channel), dan BotToggle
- Blacklist: Notify, Cleared Welcome, dan Command (balasan peninjau lewat WhatsApp)
- Channel WA: seleksi produk, pembuatan dan pengiriman broadcast, sinkron dan filter Google Sheet (jadwal broadcast dan filter mingguan hari Selasa 16:00 WIB)
- Pemberitahuan penyetuju RESOLVE ALL dari web (`resolve-request-notify`)

Media tidak diunduh ulang; yang ditampilkan adalah `media_url` yang sudah ada.

## Catatan

- `AGENTS.md` ditulis ulang otomatis oleh `next dev`; `CLAUDE.md` hanya mengimpornya. Keduanya tidak perlu diubah manual
