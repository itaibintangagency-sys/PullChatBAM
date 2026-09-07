'use client';

import { RequireAuth } from '@/components/RouteGuard';
import { NavHeader } from '@/components/NavHeader';
import { useAuth } from '@/lib/AuthContext';

interface MenuDoc {
  nama: string;
  untukSiapa: string;
  fungsi: string;
  istilah?: { label: string; arti: string }[];
}

const MENU_DOCS: MenuDoc[] = [
  {
    nama: 'Dashboard',
    untukSiapa: 'Semua orang',
    fungsi:
      'Halaman depan setelah pilih nomor bot. Nunjukin ringkasan angka penting: berapa eskalasi masih terbuka, berapa customer lagi didiamkan bot (dormant), berapa nomor di-blacklist, dan beban kerja tiap staff. Klik kartu angkanya buat langsung ke halaman detailnya.',
  },
  {
    nama: 'Chat log',
    untukSiapa: 'Semua orang',
    fungsi:
      'Lihat semua percakapan customer dengan bot, mirip tampilan WhatsApp. Bisa cari nomor/nama, buka 1 percakapan buat lihat detail lengkap (termasuk screenshot yang dikirim customer), dan export ke CSV.',
  },
  {
    nama: 'Dormant',
    untukSiapa: 'Semua orang',
    fungsi:
      'Daftar customer yang lagi "didiamkan" bot — bot berhenti balas otomatis, nunggu staff turun tangan. Klik "Resolve" setelah masalahnya selesai ditangani, biar bot mulai balas normal lagi ke customer itu.',
    istilah: [
      { label: 'Handoff staff', arti: 'Bot sengaja serahkan ke staff (biasanya karena customer minta bantuan manusia)' },
      { label: '9× salah pilih', arti: 'Customer 9 kali berturut-turut kirim jawaban yang tidak dikenali bot, jadi otomatis di-handoff' },
    ],
  },
  {
    nama: 'Eskalasi',
    untukSiapa: 'Semua orang',
    fungsi:
      'Daftar tiket yang perlu ditindaklanjuti staff (pendaftaran creator, kerjasama seller, dll). Klik 1 baris buat lihat detail & screenshot, klik "Tandai selesai" kalau sudah beres ditangani.',
    istilah: [
      { label: 'HIGH / MEDIUM / LOW', arti: 'Prioritas — semakin tinggi, semakin perlu didahulukan' },
      { label: 'Terbuka', arti: 'Belum ditangani' },
      { label: 'Selesai', arti: 'Sudah ditandai beres oleh staff' },
    ],
  },
  {
    nama: 'Blacklist',
    untukSiapa: 'Semua orang',
    fungsi:
      'Nomor yang tidak akan dilayani bot lagi — otomatis (bot deteksi spam) atau ditambah manual. Bisa tambah nomor baru, edit alasan, atau keluarkan nomor dari daftar (unblacklist).',
  },
  {
    nama: 'Riwayat Customer',
    untukSiapa: 'Semua orang',
    fungsi:
      'Alat debug — cari 1 nomor WA, lihat jejak lengkap keputusan bot (pindah stage apa, balas apa, kenapa). Berguna buat jawab pertanyaan "kok bot balasnya begini ke customer ini kemarin?"',
  },
  {
    nama: 'Profil Customer',
    untukSiapa: 'Semua orang',
    fungsi:
      'Gabungan status bot + riwayat eskalasi + riwayat dormant buat 1 nomor WA, dalam 1 halaman ringkas. Murni buat dilihat, tidak ada tombol ubah data di sini.',
  },
  {
    nama: 'Review harian',
    untukSiapa: 'Semua orang',
    fungsi: 'Isi penilaian harian soal kinerja bot & operasional (skala 1-5 + catatan).',
  },
  {
    nama: 'Nomor internal',
    untukSiapa: 'Semua orang',
    fungsi: 'Daftar nomor kantor/internal, supaya terpisah dari daftar customer biasa di Chat log.',
  },
  {
    nama: 'Status Bot',
    untukSiapa: 'Semua orang',
    fungsi:
      'Lihat apakah bot lagi AKTIF atau NONAKTIF, dan riwayat kapan bot pernah dimatikan/dinyalakan (berlaku sama buat kedua nomor bot, tidak terpisah per nomor).',
  },
  {
    nama: 'Profil Saya',
    untukSiapa: 'Semua orang',
    fungsi: 'Ubah nama tampilan sendiri dan ganti password sendiri.',
  },
  {
    nama: 'Pengaturan → Staff & Routing',
    untukSiapa: 'Khusus Super Admin',
    fungsi:
      'Kelola daftar staff yang menerima notifikasi WA dari bot (siapa dapat notif eskalasi TikTok, Shopee, Seller, dll). Nomor WA bisa diedit, tapi nama/kategori/kode-nya cuma bisa diisi sekali waktu staff pertama kali ditambahkan.',
  },
  {
    nama: 'Pengaturan → Kelola Staff',
    untukSiapa: 'Khusus Super Admin',
    fungsi:
      'Tambah akun login baru buat staff, dan ubah role seseorang antara Staff ↔ Super Admin.',
    istilah: [
      { label: 'Staff', arti: 'Akses ke semua menu operasional harian (Chat log, Eskalasi, Dormant, dll)' },
      { label: 'Super Admin', arti: 'Semua akses Staff, ditambah akses ke menu Pengaturan' },
    ],
  },
];

function LegendaContent() {
  const { nomor } = useAuth();

  return (
    <div className="pl-56">
      <NavHeader nomor={nomor || '1052'} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 text-lg font-medium text-gray-900">Legenda &amp; Panduan</h1>
        <p className="mb-6 text-sm text-gray-500">
          Penjelasan fungsi tiap menu dan istilah yang sering muncul di Kirana Monitor.
        </p>

        <div className="space-y-4">
          {MENU_DOCS.map((doc) => (
            <div key={doc.nama} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">{doc.nama}</h2>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    doc.untukSiapa === 'Semua orang'
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {doc.untukSiapa}
                </span>
              </div>
              <p className="text-sm text-gray-600">{doc.fungsi}</p>

              {doc.istilah && (
                <dl className="mt-3 space-y-1 border-t border-gray-100 pt-3">
                  {doc.istilah.map((i) => (
                    <div key={i.label} className="flex gap-2 text-xs">
                      <dt className="shrink-0 font-medium text-gray-700">{i.label}</dt>
                      <dd className="text-gray-500">— {i.arti}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function LegendaPage() {
  return (
    <RequireAuth>
      <LegendaContent />
    </RequireAuth>
  );
}
