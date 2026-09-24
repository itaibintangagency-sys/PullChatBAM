import { Poppins, Work_Sans } from 'next/font/google';

const poppins = Poppins({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-heading' });
const workSans = Work_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-body' });

export default function PrivacyPolicyPage() {
  return (
    <div
      className={`${poppins.variable} ${workSans.variable}`}
      style={{ backgroundColor: '#0A0A0F', color: '#F5F5F7', fontFamily: 'var(--font-body), sans-serif' }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 96px', lineHeight: 1.7 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '2rem', marginBottom: 8 }}>
          Privacy Policy
        </h1>
        <p style={{ color: '#A1A1AA', marginBottom: 40 }}>Last updated: September 2026</p>

        <p>
          BAM ChatBot (&quot;the App&quot;) is developed and operated by <strong>PT Biru Satria Mediatama</strong>
          (&quot;Bintang Agency&quot;, &quot;we&quot;, &quot;us&quot;), based in Bandung, Indonesia. This
          Privacy Policy explains how we collect, use, and protect information when you interact with our
          Instagram (@bintangagency) or Facebook Page through this automated messaging application.
        </p>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          Information We Collect
        </h2>
        <p>When you send a message to our Instagram or Facebook Page, we may collect:</p>
        <ul style={{ marginTop: 8, paddingLeft: 20, color: '#D4D4D8' }}>
          <li>Your Instagram or Facebook username and account ID</li>
          <li>The content of messages you send to us</li>
          <li>Information you voluntarily provide during the conversation, such as your WhatsApp number, name, and inquiry details (e.g. Creator or Seller/Brand collaboration interest)</li>
          <li>Basic public profile metrics (such as follower count), where available and permitted by the platform</li>
        </ul>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          How We Use Your Information
        </h2>
        <ul style={{ paddingLeft: 20, color: '#D4D4D8' }}>
          <li>To provide automated responses and guide you through our customer service menu</li>
          <li>To identify and personalize your conversation with our chatbot</li>
          <li>To forward your inquiry to our internal support team for follow-up via WhatsApp, when applicable</li>
          <li>To maintain records of customer interactions for quality and support purposes</li>
        </ul>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          How We Store and Protect Your Information
        </h2>
        <p>
          Information you share with us is stored securely using Supabase, a hosted database service with
          access restricted to authorized Bintang Agency staff. We do not sell your personal information to
          third parties. Information may be shared internally with our support staff solely for the purpose
          of responding to your inquiry.
        </p>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          Data Retention
        </h2>
        <p>
          We retain conversation records for as long as necessary to provide our services and maintain
          business records, unless a longer retention period is required by law.
        </p>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          Your Rights
        </h2>
        <p>
          You may request access to, correction of, or deletion of your personal information by contacting us
          using the details below. We will respond to reasonable requests in a timely manner.
        </p>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          Changes to This Policy
        </h2>
        <p>
          We may update this Privacy Policy from time to time. Changes will be posted on this page with an
          updated revision date.
        </p>

        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.375rem', marginTop: 40, marginBottom: 12 }}>
          Contact Us
        </h2>
        <p>
          If you have questions about this Privacy Policy or how your information is handled, please contact
          us via WhatsApp at +62 895-2686-1052 or through our Instagram account{' '}
          <a href="https://www.instagram.com/bintangagency" target="_blank" rel="noreferrer" style={{ color: '#E4262A' }}>
            @bintangagency
          </a>.
        </p>
      </div>
    </div>
  );
}
