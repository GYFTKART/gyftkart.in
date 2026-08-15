import { Link } from 'react-router-dom';
import { Gift, Mail, Phone, MapPin, Twitter, Instagram, Linkedin, Facebook, ArrowRight, ShieldCheck } from 'lucide-react';

const columns: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Marketplace',
    links: [
      { label: 'All brands', to: '/brands' },
      { label: 'Trending', to: '/brands?filter=trending' },
      { label: 'Birthdays', to: '/brands?occasion=Birthday' },
      { label: 'Corporate gifting', to: '/corporate' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Use', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'FAQ', to: '/faq' },
      { label: 'Offer Terms', to: '/offer-terms' },
      { label: 'Refund Policy', to: '/refund-policy' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About GyftKart', to: '/about' },
      { label: 'How it works', to: '/how-it-works' },
      { label: 'Careers', to: '/careers' },
      { label: 'Contact', to: '/contact' },
    ],
  },
];

const socials = [
  { Icon: Twitter, label: 'Twitter' },
  { Icon: Instagram, label: 'Instagram' },
  { Icon: Linkedin, label: 'LinkedIn' },
  { Icon: Facebook, label: 'Facebook' },
];

export default function Footer() {
  return (
    <footer className="relative mt-20 bg-brand-950 text-brand-100 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-[0.07] pointer-events-none" />
      <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-600/30 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        {/* Newsletter */}
        <div className="rounded-3xl bg-gradient-to-r from-brand-700 to-brand-800 p-8 sm:p-10 shadow-glow mb-14">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="max-w-md">
              <h3 className="font-display text-2xl sm:text-3xl font-bold text-white">
                Never miss a sweet deal
              </h3>
              <p className="mt-2 text-brand-200 text-sm">
                Get exclusive brand offers, festive launches and gifting ideas straight to your inbox.
              </p>
            </div>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex w-full max-w-md items-center gap-2 rounded-full bg-white p-1.5 shadow-card"
            >
              <Mail className="ml-2 h-5 w-5 text-brand-400 shrink-0" />
              <input
                type="email"
                placeholder="you@example.com"
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Subscribe <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Columns */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="grid place-items-center h-10 w-10 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white">
                <Gift className="h-5 w-5" />
              </span>
              <span className="font-display text-xl font-extrabold text-white">
                GyftKart
              </span>
            </Link>
            <p className="mt-4 text-sm text-brand-200/90 max-w-xs leading-relaxed">
              India's premium e-gift card marketplace. Send personalised gift cards from 100+ top brands for every occasion. Powered by GyftKart.
            </p>
            <div className="mt-5 space-y-2 text-sm text-brand-200">
              <p className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-brand-300" /> gyftkart@gmail.com
              </p>
              <p className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-brand-300" /> 09695393786
              </p>
              <p className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 text-brand-300" /> Uttar Pradesh, India
              </p>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="font-display text-sm font-bold uppercase tracking-wider text-brand-300">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="text-sm text-brand-200 hover:text-white transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-brand-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-brand-300">
            © 2026 Tecticon Technologies Pvt Ltd. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-800/70 text-brand-200 px-3.5 py-2 text-xs font-semibold hover:bg-brand-600 hover:text-white transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Admin
            </Link>
            <div className="flex items-center gap-2">
              {socials.map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="grid place-items-center h-9 w-9 rounded-full bg-brand-800/70 text-brand-200 hover:bg-brand-600 hover:text-white transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
