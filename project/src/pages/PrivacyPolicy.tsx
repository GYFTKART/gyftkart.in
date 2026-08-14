import { Link } from 'react-router-dom';

const sections = [
  {
    title: '1. Introduction',
    body: `Tecticon Technologies Private Limited ("GyftKart", "we", "us", "our") respects your privacy and is committed to protecting the personal data you share with us through GyftKart.in. This Privacy Policy explains what information we collect, how we use it, and the choices you have.`,
  },
  {
    title: '2. Information We Collect',
    body: `We may collect information you provide directly, such as your name, email address, phone number, delivery details and payment information (processed securely by our payment partners). We also automatically collect certain technical information, such as your IP address, browser type, device information and usage patterns on our platform.`,
  },
  {
    title: '3. How We Use Your Information',
    body: `We use your information to process orders and deliver gift cards, provide customer support, send order updates and promotional communications (which you can opt out of at any time), improve our platform and services, and detect and prevent fraud.`,
  },
  {
    title: '4. Sharing of Information',
    body: `We share limited information with brand partners as necessary to issue and fulfil gift card orders, with payment gateway providers to process transactions securely, and with service providers who help us operate the platform (such as hosting and analytics providers). We do not sell your personal information to third parties.`,
  },
  {
    title: '5. Cookies',
    body: `GyftKart uses cookies and similar technologies to remember your preferences, keep you signed in, and understand how you use our platform so we can improve it. You can control cookies through your browser settings, though some features may not function properly if cookies are disabled.`,
  },
  {
    title: '6. Data Security',
    body: `We implement reasonable technical and organisational safeguards to protect your personal data against unauthorised access, alteration, disclosure or destruction. However, no method of transmission over the internet is completely secure, and we cannot guarantee absolute security.`,
  },
  {
    title: '7. Data Retention',
    body: `We retain your personal information for as long as necessary to fulfil the purposes described in this policy, comply with our legal obligations, resolve disputes, and enforce our agreements.`,
  },
  {
    title: '8. Your Rights',
    body: `Depending on applicable law, you may have the right to access, correct or delete your personal information, and to opt out of marketing communications. To exercise these rights, please contact us using the details below.`,
  },
  {
    title: "9. Children's Privacy",
    body: `GyftKart is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children.`,
  },
  {
    title: '10. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated "last updated" date.`,
  },
  {
    title: '11. Contact Us',
    body: `If you have questions about this Privacy Policy or how your data is handled, please write to us at gyftkart@gmail.com.`,
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="pt-16 bg-gradient-to-b from-brand-50/40 to-transparent">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        {/* breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Privacy policy</span>
        </nav>

        {/* Header */}
        <div className="mt-8">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900">
            Privacy Policy
          </h1>
          <span className="mt-2 block h-1 w-14 rounded-full bg-brand-600" />
          <p className="mt-4 text-sm text-slate-500">Last updated: January 2026</p>
        </div>

        {/* Body */}
        <div className="mt-10 space-y-8">
          {sections.map((s) => (
            <div key={s.title}>
              <h2 className="font-display text-lg font-bold text-slate-900">
                {s.title}
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
