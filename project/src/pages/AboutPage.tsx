import { Link } from 'react-router-dom';
import { Gift, ShieldCheck, Zap, Building2 } from 'lucide-react';

const highlights = [
  {
    Icon: Gift,
    title: '100+ top brands',
    body: 'From fashion and beauty to food, travel and entertainment, discover gift cards from the brands people actually love to shop with.',
  },
  {
    Icon: Zap,
    title: 'Instant delivery',
    body: 'Gift cards are delivered digitally by email and SMS within minutes of purchase — perfect for last-minute gifting.',
  },
  {
    Icon: ShieldCheck,
    title: 'Secure payments',
    body: 'Every transaction is processed through PCI-compliant payment gateways, so your card and banking details stay safe.',
  },
  {
    Icon: Building2,
    title: 'Built for gifting at scale',
    body: 'From a single card for a friend\'s birthday to bulk corporate gifting for hundreds of employees, GyftKart scales with you.',
  },
];

export default function AboutPage() {
  return (
    <div className="pt-16 min-h-screen bg-gradient-to-b from-brand-50/40 to-white">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        {/* breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">About GyftKart</span>
        </nav>

        {/* Header */}
        <div className="mt-8">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900">
            About GyftKart
          </h1>
          <span className="mt-2 block h-1 w-14 rounded-full bg-brand-600" />
          <p className="mt-4 text-sm text-slate-600 leading-relaxed max-w-2xl">
            GyftKart is India's premium e-gift card marketplace, built and operated by Tecticon
            Technologies Private Limited. We help people send thoughtful, personalised gift cards
            from 100+ top brands for every occasion — birthdays, anniversaries, festivals, or just
            because — all delivered digitally in minutes.
          </p>
        </div>

        {/* Highlights */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {highlights.map(({ Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <span className="grid place-items-center h-10 w-10 rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-display text-lg font-bold text-slate-900">{title}</h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* Mission */}
        <div className="mt-10 space-y-6">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Our mission</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              We believe gifting should be simple, personal and instant. Whether you're picking
              something for a loved one or managing gifting for an entire organisation, GyftKart
              is designed to make the experience effortless — from choosing a brand to redeeming
              the card.
            </p>
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Who we are</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              GyftKart is operated by Tecticon Technologies Private Limited, headquartered in
              Uttar Pradesh, India. Our team is focused on building a reliable, secure and
              delightful gifting platform for individuals and businesses alike.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-2xl bg-brand-50 border border-brand-100 px-6 py-5 text-center">
          <p className="text-sm text-slate-600">
            Have questions about GyftKart?{' '}
            <Link to="/contact" className="font-semibold text-brand-700 hover:text-brand-800">
              Get in touch with us
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
