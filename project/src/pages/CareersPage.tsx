import { Link } from 'react-router-dom';
import { Heart, Rocket, Users, Sparkles } from 'lucide-react';

const values = [
  {
    Icon: Rocket,
    title: 'Move fast, build well',
    body: 'We ship quickly and iterate often, but never at the cost of quality or reliability for the people who trust us with their gifting.',
  },
  {
    Icon: Users,
    title: 'Customer first',
    body: 'Every decision starts with what makes gifting simpler, faster and more delightful for our users and brand partners.',
  },
  {
    Icon: Heart,
    title: 'Ownership & care',
    body: 'We hire people who care deeply about their craft and take ownership of outcomes, not just tasks.',
  },
  {
    Icon: Sparkles,
    title: 'Grow together',
    body: 'As GyftKart grows, we want our team to grow with it — through new challenges, mentorship and room to take on more.',
  },
];

export default function CareersPage() {
  return (
    <div className="pt-16 bg-gradient-to-b from-brand-50/40 to-transparent">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        {/* breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Careers</span>
        </nav>

        {/* Header */}
        <div className="mt-8">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900">
            Careers at GyftKart
          </h1>
          <span className="mt-2 block h-1 w-14 rounded-full bg-brand-600" />
          <p className="mt-4 text-sm text-slate-600 leading-relaxed max-w-2xl">
            GyftKart is built by Tecticon Technologies Private Limited, and we're always looking
            for passionate people who want to help shape India's premium e-gift card marketplace.
          </p>
        </div>

        {/* Values */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {values.map(({ Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <span className="grid place-items-center h-10 w-10 rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-display text-lg font-bold text-slate-900">{title}</h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* Current openings */}
        <div className="mt-10">
          <h2 className="font-display text-lg font-bold text-slate-900">Current openings</h2>
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
            <p className="text-sm text-slate-600 leading-relaxed">
              We don't have any open roles listed right now, but we're always happy to hear from
              people who are excited about GyftKart. Reach out and tell us how you'd like to
              contribute — we'll keep your details on file for when a fitting role opens up.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-2xl bg-brand-50 border border-brand-100 px-6 py-5 text-center">
          <p className="text-sm text-slate-600">
            Interested in joining the team?{' '}
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
