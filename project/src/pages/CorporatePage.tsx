import { useState } from 'react';
import {
  Building2,
  Users,
  Gift,
  ShieldCheck,
  Clock,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Heart,
  Award,
  ArrowRight,
  Headphones,
  PiggyBank,
} from 'lucide-react';
import Reveal from '@/components/Reveal';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

const benefits = [
  { icon: PiggyBank, title: 'Volume discounts', text: 'Tiered pricing that scales — save more as your order grows.' },
  { icon: Sparkles, title: 'Branded cards', text: 'Add your company logo and a custom message to every card.' },
  { icon: Clock, title: 'Bulk instant delivery', text: 'Schedule and send hundreds of gift cards in one go.' },
  { icon: ShieldCheck, title: 'GST invoice', text: 'Compliant invoicing and a single dashboard to track every order.' },
];

const stats = [
  { value: '500+', label: 'Companies served' },
  { value: '1.2M+', label: 'Cards delivered' },
  { value: '48h', label: 'Avg. turnaround' },
  { value: '4.9/5', label: 'Client rating' },
];

const employeeOptions = ['1–50', '51–200', '201–500', '501–1000', '1000+'];
const budgetOptions = ['Under ₹1L', '₹1L–₹5L', '₹5L–₹10L', '₹10L+', 'Not sure yet'];
const occasionOptions = ['Diwali', 'New Joiner', 'Work Anniversary', 'Birthdays', 'Client Gifting', 'Year-end Rewards'];

export default function CorporatePage() {
  const { push } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    employee_count: '',
    budget: '',
    occasions: [] as string[],
    message: '',
  });

  const update = (key: keyof typeof form, value: string | string[]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleOccasion = (o: string) =>
    setForm((f) => ({
      ...f,
      occasions: f.occasions.includes(o)
        ? f.occasions.filter((x) => x !== o)
        : [...f.occasions, o],
    }));

  const valid =
    form.company_name.trim() &&
    form.contact_name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
    /^[0-9+\-\s]{7,15}$/.test(form.phone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      push('Please complete the required fields', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('corporate_inquiries').insert({
        company_name: form.company_name.trim(),
        contact_name: form.contact_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        employee_count: form.employee_count,
        budget: form.budget,
        occasions: form.occasions.join(', '),
        message: form.message.trim(),
        status: 'new',
      });
      if (error) throw error;
      setSubmitted(true);
      push('Inquiry submitted! Our team will be in touch.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pt-16">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden bg-brand-950 text-white">
        <div className="absolute inset-0 bg-grid opacity-[0.08] pointer-events-none" />
        <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-brand-600/40 blur-3xl pointer-events-none" />
        <div className="absolute top-10 -right-20 h-96 w-96 rounded-full bg-gold-400/20 blur-3xl pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-brand-200 border border-white/10">
                <Building2 className="h-3.5 w-3.5" /> Corporate gifting
              </span>
              <h1 className="mt-5 font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05]">
                Delight your team with <span className="text-gradient">gifts they'll love.</span>
              </h1>
              <p className="mt-5 text-lg text-brand-100 max-w-lg leading-relaxed">
                Bulk order premium e-gift cards for employees, clients and partners.
                Branded, personalised and delivered at scale — with volume discounts
                and a single GST invoice.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#inquiry"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-brand-700 hover:bg-brand-50 transition-colors"
                >
                  Request a quote <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#benefits"
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-6 py-3.5 text-sm font-bold text-white hover:bg-white/20 transition-colors"
                >
                  See benefits
                </a>
              </div>
              <div className="mt-10 grid grid-cols-4 gap-3 max-w-lg">
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="font-display text-xl sm:text-2xl font-extrabold">{s.value}</p>
                    <p className="text-[11px] text-brand-200">{s.label}</p>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={150} className="relative">
              <div className="relative mx-auto max-w-md">
                <div className="rounded-[28px] bg-gradient-to-br from-brand-600 to-brand-800 p-7 shadow-glow animate-float">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/15 rounded-full px-3 py-1">
                      <Gift className="h-3.5 w-3.5" /> Corporate order
                    </span>
                    <Building2 className="h-6 w-6 text-white/80" />
                  </div>
                  <p className="mt-6 text-white/70 text-xs">Order summary</p>
                  <p className="font-display text-3xl font-extrabold">250 gift cards</p>
                  <div className="mt-5 space-y-2 text-sm">
                    {['Amazon × 100', 'Myntra × 80', 'Swiggy × 70'].map((row) => (
                      <div key={row} className="flex items-center justify-between text-white/85">
                        <span>{row}</span>
                        <span>Branded</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 pt-4 border-t border-white/15 flex items-center justify-between">
                    <span className="text-white/70 text-xs">Volume savings</span>
                    <span className="font-bold text-gold-300">18% off</span>
                  </div>
                </div>

                <div className="absolute -bottom-6 -left-5 rounded-2xl bg-white px-4 py-3 shadow-card animate-float-rev rotate-[-6deg]">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> Delivered to 250 inboxes
                  </p>
                  <p className="text-[10px] text-slate-400">in 1.8 seconds</p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===== BENEFITS ===== */}
      <section id="benefits" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
              <Award className="h-3.5 w-3.5" /> Why teams choose us
            </span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold text-slate-900">
              Gifting that scales with you
            </h2>
            <p className="mt-2 text-slate-500">
              Everything you need to recognise, reward and celebrate — at any scale.
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {benefits.map((b, i) => (
              <Reveal key={b.title} delay={i * 80}>
                <div className="group h-full rounded-3xl border border-slate-100 bg-white p-6 shadow-soft hover:shadow-card hover:-translate-y-1 transition-all duration-400">
                  <span className="grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm group-hover:scale-110 transition-transform">
                    <b.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-bold text-slate-900">{b.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{b.text}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* mini stats row */}
          <div className="mt-12 grid sm:grid-cols-3 gap-5">
            {[
              { icon: Users, title: 'For HR & People teams', text: 'Onboard, reward and recognise employees with the brands they love.' },
              { icon: TrendingUp, title: 'For Sales & Client teams', text: 'Send memorable client gifts that build relationships that last.' },
              { icon: Headphones, title: 'Dedicated account manager', text: 'A single point of contact for every bulk order, end to end.' },
            ].map((c, i) => (
              <Reveal key={c.title} delay={i * 90}>
                <div className="rounded-3xl bg-gradient-to-br from-brand-50 to-white border border-brand-100 p-6 h-full">
                  <c.icon className="h-7 w-7 text-brand-600" />
                  <h3 className="mt-3 font-display text-lg font-bold text-slate-900">{c.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{c.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== INQUIRY FORM ===== */}
      <section id="inquiry" className="py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-8 items-start">
            {/* Left copy */}
            <Reveal className="lg:col-span-2 lg:sticky lg:top-24">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-700">
                <Heart className="h-3.5 w-3.5" /> Let's talk
              </span>
              <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold text-slate-900">
                Request a bulk quote
              </h2>
              <p className="mt-3 text-slate-600 leading-relaxed">
                Tell us about your team and what you're celebrating. Our corporate
                gifting team will get back to you within 24 hours with tailored
                pricing and brand recommendations.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'No minimum order for first purchase',
                  'Free branded card design',
                  'Single GST invoice',
                  'Dedicated account manager',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>

            {/* Form card */}
            <Reveal delay={120} className="lg:col-span-3">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 sm:p-8 shadow-card">
                {submitted ? (
                  <div className="text-center py-10">
                    <span className="grid place-items-center h-20 w-20 rounded-3xl bg-emerald-50 text-emerald-600 mx-auto animate-pop">
                      <CheckCircle2 className="h-10 w-10" />
                    </span>
                    <h3 className="mt-5 font-display text-2xl font-bold text-slate-900">
                      Thank you, {form.contact_name.split(' ')[0] || 'there'}!
                    </h3>
                    <p className="mt-2 text-slate-500 max-w-sm mx-auto">
                      Your inquiry is in. Our corporate gifting team will email
                      <span className="font-semibold text-slate-700"> {form.email} </span>
                      within 24 hours.
                    </p>
                    <button
                      onClick={() => {
                        setSubmitted(false);
                        setForm({
                          company_name: '',
                          contact_name: '',
                          email: '',
                          phone: '',
                          employee_count: '',
                          budget: '',
                          occasions: [],
                          message: '',
                        });
                      }}
                      className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
                    >
                      Submit another inquiry
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="Company name" required>
                        <input
                          value={form.company_name}
                          onChange={(e) => update('company_name', e.target.value)}
                          placeholder="Acme Corp"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Your name" required>
                        <input
                          value={form.contact_name}
                          onChange={(e) => update('contact_name', e.target.value)}
                          placeholder="Jane Doe"
                          className={inputCls}
                        />
                      </Field>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="Work email" required>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => update('email', e.target.value)}
                          placeholder="jane@acme.com"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Phone" required>
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={(e) => update('phone', e.target.value)}
                          placeholder="+91 98765 43210"
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    <Field label="Number of employees">
                      <div className="flex flex-wrap gap-2">
                        {employeeOptions.map((o) => (
                          <Chip
                            key={o}
                            active={form.employee_count === o}
                            onClick={() => update('employee_count', o)}
                          >
                            {o}
                          </Chip>
                        ))}
                      </div>
                    </Field>

                    <Field label="Approx. budget">
                      <div className="flex flex-wrap gap-2">
                        {budgetOptions.map((o) => (
                          <Chip
                            key={o}
                            active={form.budget === o}
                            onClick={() => update('budget', o)}
                          >
                            {o}
                          </Chip>
                        ))}
                      </div>
                    </Field>

                    <Field label="Gifting occasions">
                      <div className="flex flex-wrap gap-2">
                        {occasionOptions.map((o) => (
                          <Chip
                            key={o}
                            active={form.occasions.includes(o)}
                            onClick={() => toggleOccasion(o)}
                          >
                            {o}
                          </Chip>
                        ))}
                      </div>
                    </Field>

                    <Field label="Anything else?">
                      <textarea
                        value={form.message}
                        onChange={(e) => update('message', e.target.value.slice(0, 500))}
                        rows={3}
                        placeholder="Tell us about your gifting goals, timeline, preferred brands…"
                        className={`${inputCls} resize-none`}
                      />
                    </Field>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-4 text-sm font-bold text-white hover:shadow-glow transition-shadow disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <>
                          <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          Submitting…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" /> Submit inquiry
                        </>
                      )}
                    </button>
                    <p className="text-center text-[11px] text-slate-400">
                      By submitting, you agree to be contacted by our corporate gifting team.
                    </p>
                  </form>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  );
}

const inputCls =
  'w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-slate-800 mb-2">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
        active
          ? 'bg-brand-600 text-white shadow-glow-sm'
          : 'bg-slate-100 text-slate-600 hover:bg-brand-100 hover:text-brand-700'
      }`}
    >
      {children}
    </button>
  );
}
