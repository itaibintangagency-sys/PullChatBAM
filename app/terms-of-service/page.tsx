import { Poppins, Work_Sans } from 'next/font/google';

const poppins = Poppins({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-heading' });
const workSans = Work_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-body' });

export default function TermsOfServicePage() {
  return (
    <div
      className={`${poppins.variable} ${workSans.variable}`}
      style={{ backgroundColor: '#0A0A0F', color: '#F5F5F7', fontFamily: 'var(--font-body), sans-serif' }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 96px', lineHeight: 1.7 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '2rem', marginBottom: 8 }}>
          Terms of Service
        </h1>
        <p style={{ color: '#A1A1AA', marginBottom: 40 }}>Last updated: September 2026</p>

        <p>
          These Terms of Service (&quot;Terms&quot;) govern your interaction with BAM ChatBot, an automated
          messaging application operated by <strong>PT Biru Satria Mediatama</strong> (&quot;Bintang
          Agency&quot;) on its official Instagram (@bintangagency) and Facebook Page. By messaging our
          account, you agree to these Terms.
        </p>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          Description of Service
        </h2>
        <p>
          BAM ChatBot is an automated chatbot that helps guide Creators and business partners (Sellers/Brands)
          through an initial inquiry process, collects relevant contact information, and forwards qualified
          inquiries to our support team for personal follow-up.
        </p>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          Acceptable Use
        </h2>
        <p>
          You agree not to use this service to send unlawful, abusive, or fraudulent content, or to attempt to
          interfere with or disrupt the operation of the chatbot.
        </p>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          No Guarantee of Outcome
        </h2>
        <p>
          Interacting with BAM ChatBot does not guarantee any partnership, collaboration, or business
          agreement with Bintang Agency. Final decisions are made by our support team following manual review.
        </p>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          Availability
        </h2>
        <p>
          We aim to keep this service available during our stated operating hours (Monday&ndash;Friday,
          09:00&ndash;18:00 WIB) but do not guarantee uninterrupted availability at all times.
        </p>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          Changes to These Terms
        </h2>
        <p>
          We may update these Terms from time to time. Continued use of the service after changes are posted
          constitutes acceptance of the updated Terms.
        </p>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          Contact Us
        </h2>
        <p>
          For questions about these Terms, please contact us via WhatsApp at +62 895-2686-1052 or through our
          Instagram account{' '}
          <a href="https://www.instagram.com/bintangagency" target="_blank" rel="noreferrer" style={{ color: '#E4262A' }}>
            @bintangagency
          </a>.
        </p>
      </div>
    </div>
  );
}
