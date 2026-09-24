import { Poppins, Work_Sans } from 'next/font/google';
import Link from 'next/link';
import ScrollReveal from '@/components/ScrollReveal';
import MountReveal from '@/components/MountReveal';

const poppins = Poppins({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-heading' });
const workSans = Work_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-body' });

const features = [
  {
    title: 'Pemantauan Chat Real-Time',
    desc: 'Lihat setiap percakapan customer masuk dari WhatsApp dan Instagram begitu terjadi — tanpa buka banyak tab atau refresh manual.',
    size: 'lg',
  },
  {
    title: 'Pelacak Eskalasi',
    desc: 'Tiket otomatis muncul begitu bot butuh diambil alih manusia, lengkap dengan status dan waktu tunggu.',
    size: 'sm',
  },
  {
    title: 'Manajemen Blacklist',
    desc: 'Blokir nomor atau akun bermasalah dalam satu klik, berlaku langsung di semua bot.',
    size: 'sm',
  },
  {
    title: 'Profil Customer Terpadu',
    desc: 'Riwayat lengkap satu customer — lintas WhatsApp dan Instagram — dirangkum dalam satu tampilan, bukan tersebar di banyak tempat.',
    size: 'lg',
  },
  {
    title: 'Review Harian',
    desc: 'Staff menilai performa bot dan penanganan CS setiap hari, jadi masalah ketahuan cepat.',
    size: 'sm',
  },
  {
    title: 'Multi-Channel',
    desc: 'WhatsApp hari ini, Instagram dan Facebook menyusul — satu dashboard untuk semuanya.',
    size: 'sm',
  },
];

const steps = [
  { n: '01', title: 'Customer mengirim pesan', desc: 'Lewat WhatsApp atau Instagram ke salah satu akun Bintang Agency.' },
  { n: '02', title: 'Bot merespons otomatis', desc: 'Kategorikan kebutuhan customer — Creator atau Seller/Brand — dan kumpulkan detail awal.' },
  { n: '03', title: 'Kirana Monitor menampilkannya', desc: 'Percakapan, status, dan data customer langsung terlihat di dashboard staff, real-time.' },
  { n: '04', title: 'Staff ambil alih bila perlu', desc: 'Begitu bot mengeskalasi, staff langsung tahu dan bisa lanjutkan percakapan dari sana.' },
];

export default function AboutKiranaMonitor() {
  return (
    <div
      className={`${poppins.variable} ${workSans.variable}`}
      style={{
        backgroundColor: '#0A0A0F',
        color: '#F5F5F7',
        fontFamily: 'var(--font-body), sans-serif',
      }}
    >
      {/* NAV */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 md:px-12"
        style={{ backgroundColor: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #2A2A33' }}
      >
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.125rem' }}>
          Kirana Monitor
        </span>
        <Link
          href="/login"
          className="rounded-lg px-4 py-2 text-sm font-medium transition-transform active:scale-95"
          style={{ backgroundColor: '#E4262A', color: '#F5F5F7' }}
        >
          Masuk ke Dashboard
        </Link>
      </nav>

      {/* HERO — Split */}
      <section className="grid gap-10 px-6 py-20 md:grid-cols-2 md:items-center md:px-12 md:py-32">
        <div>
          <MountReveal delayMs={0}>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
              }}
            >
              Semua Percakapan Bot.
              <br />
              Satu Layar.
            </h1>
          </MountReveal>
          <MountReveal delayMs={150}>
            <p className="mt-6 max-w-md text-lg" style={{ color: '#A1A1AA', lineHeight: 1.6 }}>
              Kirana Monitor mengumpulkan setiap chat dari WhatsApp dan Instagram Bintang Agency
              jadi satu dashboard — supaya tim CS tahu persis siapa butuh dibalas, kapan, dan oleh siapa.
            </p>
          </MountReveal>
          <MountReveal delayMs={300}>
            <div className="mt-8 flex gap-4">
              <Link
                href="/login"
                className="rounded-lg px-6 py-3 font-medium transition-transform active:scale-95"
                style={{ backgroundColor: '#E4262A', color: '#F5F5F7' }}
              >
                Masuk ke Dashboard
              </Link>
            </div>
          </MountReveal>
        </div>

        {/* Mockup dashboard */}
        <MountReveal delayMs={250} className="relative">
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: '#16161D', border: '1px solid #2A2A33', boxShadow: '0 40px 80px -20px rgba(228,38,42,0.15)' }}
          >
            <div className="mb-4 flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: '#22C55E', animation: 'pulse-dot 2s ease-in-out infinite' }}
              />
              <span className="text-xs" style={{ color: '#A1A1AA' }}>Live &mdash; 3 chat aktif</span>
            </div>
            {[
              { name: 'Erya · Instagram', msg: 'Aku creator TikTok Affiliate...', tag: 'Creator', color: '#38BDF8' },
              { name: '+62 812-xxxx · WhatsApp', msg: 'Mau kerjasama seller dong', tag: 'Seller', color: '#E4262A' },
              { name: 'Dwimaulidya · Instagram', msg: 'Fokus konten Home Living', tag: 'Creator', color: '#38BDF8' },
            ].map((row, i) => (
              <div
                key={i}
                className="mb-2 flex items-center justify-between rounded-lg px-3 py-2.5 last:mb-0"
                style={{ backgroundColor: '#0A0A0F', border: '1px solid #2A2A33' }}
              >
                <div>
                  <div className="text-sm font-medium">{row.name}</div>
                  <div className="text-xs" style={{ color: '#A1A1AA' }}>{row.msg}</div>
                </div>
                <span
                  className="rounded px-2 py-1 text-xs font-medium"
                  style={{ backgroundColor: `${row.color}22`, color: row.color }}
                >
                  {row.tag}
                </span>
              </div>
            ))}
          </div>
        </MountReveal>
      </section>

      {/* KENAPA ADA */}
      <ScrollReveal className="px-6 py-20 text-center md:px-12">
        <p className="mx-auto max-w-2xl text-xl md:text-2xl" style={{ lineHeight: 1.5, color: '#F5F5F7' }}>
          Sebelum Kirana Monitor, tim CS memantau tiap nomor WhatsApp dan akun Instagram secara terpisah.
          Sekarang, semuanya masuk ke satu tempat — supaya tidak ada customer yang terlewat.
        </p>
      </ScrollReveal>

      {/* FITUR — Bento Grid */}
      <section className="px-6 py-16 md:px-12">
        <ScrollReveal>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '2rem' }}>Yang Bisa Dilakukan</h2>
        </ScrollReveal>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4 md:grid-rows-2">
          {features.map((f, i) => (
            <ScrollReveal
              key={f.title}
              delayMs={i * 60}
              className={f.size === 'lg' ? 'md:col-span-2 md:row-span-1' : 'md:col-span-1'}
            >
              <div
                className="h-full rounded-2xl p-6 transition-transform"
                style={{ backgroundColor: '#16161D', border: '1px solid #2A2A33' }}
              >
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.25rem' }}>{f.title}</h3>
                <p className="mt-2 text-sm" style={{ color: '#A1A1AA', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* CARA KERJA */}
      <section className="grid gap-10 px-6 py-20 md:grid-cols-2 md:items-center md:px-12">
        <ScrollReveal>
          <div className="space-y-8">
            {steps.map((s) => (
              <div key={s.n} className="flex gap-4">
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: '#E4262A' }}>
                  {s.n}
                </span>
                <div>
                  <h3 className="font-medium">{s.title}</h3>
                  <p className="mt-1 text-sm" style={{ color: '#A1A1AA', lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
        <ScrollReveal delayMs={100}>
          <div
            className="rounded-2xl p-8"
            style={{ backgroundColor: '#16161D', border: '1px solid #2A2A33' }}
          >
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.25rem' }}>
              Cara Kerjanya
            </h3>
            <p className="mt-3 text-sm" style={{ color: '#A1A1AA', lineHeight: 1.6 }}>
              Dari pesan pertama customer sampai eskalasi ke staff, semua tahapannya tercatat dan
              terlihat real-time — tidak ada yang tersembunyi di balik satu channel saja.
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* DIBANGUN SERIUS */}
      <ScrollReveal className="px-6 py-16 md:px-12">
        <div
          className="rounded-2xl p-8 md:p-10"
          style={{ backgroundColor: '#16161D', border: '1px solid #2A2A33' }}
        >
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.5rem' }}>
            Dibangun dengan Serius
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 text-sm md:grid-cols-3" style={{ color: '#A1A1AA' }}>
            <div>
              <span style={{ color: '#F5F5F7', fontWeight: 500 }}>Real-time.</span> Data tersinkron langsung lewat Supabase, bukan polling manual.
            </div>
            <div>
              <span style={{ color: '#F5F5F7', fontWeight: 500 }}>Akses berbasis peran.</span> Tiap staff login dengan hak akses sesuai perannya.
            </div>
            <div>
              <span style={{ color: '#F5F5F7', fontWeight: 500 }}>Terus berkembang.</span> WhatsApp sudah jalan, Instagram dan Facebook menyusul.
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* PENUTUP */}
      <ScrollReveal className="px-6 py-24 text-center md:px-12">
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '2rem' }}>
          Sudah jadi bagian dari operasional CS Bintang Agency
        </h2>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-lg px-6 py-3 font-medium transition-transform active:scale-95"
          style={{ backgroundColor: '#E4262A', color: '#F5F5F7' }}
        >
          Masuk ke Dashboard
        </Link>
      </ScrollReveal>

      {/* FOOTER */}
      <footer className="px-6 py-10 md:px-12" style={{ borderTop: '1px solid #2A2A33' }}>
        <div className="flex flex-col items-center justify-between gap-4 text-sm md:flex-row" style={{ color: '#A1A1AA' }}>
          <span>&copy; {new Date().getFullYear()} PT Biru Satria Mediatama &mdash; Bintang Agency</span>
          <div className="flex gap-6">
            <Link href="/privacy-policy" className="hover:underline">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:underline">Terms of Service</Link>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @media (hover: hover) and (pointer: fine) {
          section .rounded-2xl:hover {
            transform: translateY(-2px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}
