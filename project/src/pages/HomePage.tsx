import { Link } from 'react-router-dom';
import { useMemo, useRef, useState } from 'react';
import {
  Search,
  Sparkles,
  Gift,
  Cake,
  Heart,
  PartyPopper,
  Star,
  ShieldCheck,
  Zap,
  Clock,
  ArrowRight,
  TrendingUp,
  Quote,
  Smartphone,
  CreditCard,
  Mail,
  SlidersHorizontal,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Reveal from '@/components/Reveal';
import CategorySlider from '@/components/CategorySlider';
import BrandCard from '@/components/BrandCard';
import HeroBanner from '@/components/HeroBanner';
import { useBrands } from '@/lib/useBrands';
import { getCategoryIcon } from '@/lib/categoryIcons';

const brandCategories = ['All', 'Shopping', 'Fashion', 'Beauty', 'Food & Dining', 'Travel', 'Entertainment', 'Trending'];

const occasions = [
  { name: 'Birthday', icon: Cake, color: 'from-pink-500 to-rose-600', search: 'Birthday' },
  { name: 'Wedding', icon: Heart, color: 'from-rose-500 to-red-600', search: 'Wedding' },
  { name: 'Festivals', icon: PartyPopper, color: 'from-amber-500 to-orange-600', search: 'Festival' },
  { name: 'Anniversary', icon: Heart, color: 'from-fuchsia-500 to-purple-600', search: 'Anniversary' },
  { name: 'Thank You', icon: Sparkles, color: 'from-brand-500 to-brand-700', search: 'Thank You' },
  { name: 'Congrats', icon: PartyPopper, color: 'from-emerald-500 to-teal-600', search: 'Congrats' },
];

const features = [
  { icon: Zap, title: 'Instant delivery', text: 'Gift cards land in the recipient inbox within seconds of checkout.' },
  { icon: ShieldCheck, title: '100% secure', text: 'Bank-grade encryption and a verified payment gateway on every order.' },
  { icon: CreditCard, title: '200+ brands', text: 'From Amazon to Nykaa — one marketplace, every favourite brand.' },
  { icon: Smartphone, title: 'Shop on the go', text: 'A gorgeous mobile-first experience that works on any device.' },
];

const steps = [
  { icon: Search, title: 'Pick a brand', text: 'Browse 200+ premium brands and pick the one they love.' },
  { icon: Gift, title: 'Customise it', text: 'Choose an amount, add a recipient and write a personal note.' },
  { icon: CreditCard, title: 'Pay securely', text: 'Checkout in seconds with our Razorpay-style secure gateway.' },
  { icon: Mail, title: 'Send instantly', text: 'The gift card lands in their inbox the moment you pay.' },
];

const testimonials = [
  { name: 'Aarav Mehta', role: 'Bengaluru', text: 'Sent an Amazon gift card to my sister in 30 seconds. The personalisation and animations felt so premium!' },
  { name: 'Priya Nair', role: 'Mumbai', text: 'I use GyftKart for every birthday in the family. The occasion themes are beautiful and delivery is instant.' },
  { name: 'Rohan Gupta', role: 'Delhi', text: 'Corporate gifting for 120 employees was effortless. Bulk orders, branded cards, done in a day.' },
];

export default function HomePage() {
  const { brands, loading } = useBrands();

  const trending = brands.filter((b) => b.trending).slice(0, 8);
  const popular = brands.slice(0, 12);

  const [activeCategory, setActiveCategory] = useState('All');
  const filteredBrands = useMemo(() => {
    let list = brands;
    if (activeCategory === 'Trending') list = list.filter((b) => b.trending);
    else if (activeCategory !== 'All') list = list.filter((b) => b.category === activeCategory);
    return list.slice(0, 8);
  }, [brands, activeCategory]);

  // Refs + helper for the single-row horizontal card carousels
  // (Shop by Category, Trending Brands). Native touch/trackpad swipe
  // works out of the box via overflow-x-auto; these just power the
  // optional desktop arrow buttons.
  const categoryRowRef = useRef<HTMLDivElement | null>(null);
  const trendingRowRef = useRef<HTMLDivElement | null>(null);
  const scrollRowBy = (ref: React.RefObject<HTMLDivElement>, dir: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className="pt-16">
      {/* ===== HERO BANNER ===== */}
      <HeroBanner />

      {/* ===== SHOP BY CATEGORY ===== */}
      <section className="py-16 bg-gradient-to-b from-brand-50/40 to-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto mb-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Shop by category
            </span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold text-slate-900">
              Find gift cards by category
            </h2>
            <p className="mt-2 text-slate-500">
              Filter by what they love — from shopping to travel.
            </p>
          </Reveal>

          {/* Category pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
            {brandCategories.map((c) => {
              const Icon = c === 'All' ? ShoppingBag : c === 'Trending' ? TrendingUp : getCategoryIcon(c);
              const active = activeCategory === c;
              return (
                <button
                  key={c}
                  onClick={() => setActiveCategory(c)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    active
                      ? 'bg-brand-600 text-white shadow-glow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {c}
                </button>
              );
            })}
          </div>

          {/* Desktop scroll arrows */}
          <div className="hidden sm:flex items-center justify-end gap-2 mb-3">
            <button
              onClick={() => scrollRowBy(categoryRowRef, -1)}
              className="grid place-items-center h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-colors shadow-soft"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => scrollRowBy(categoryRowRef, 1)}
              className="grid place-items-center h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-colors shadow-soft"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Filtered brand cards — single-row horizontal carousel */}
          {loading ? (
            <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="shrink-0 w-60 sm:w-64 rounded-3xl overflow-hidden border border-slate-100">
                  <div className="h-44 shimmer" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 w-20 shimmer rounded" />
                    <div className="h-6 w-28 shimmer rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredBrands.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">No brands found in this category yet.</p>
            </div>
          ) : (
            <div
              ref={categoryRowRef}
              className="flex gap-5 overflow-x-auto no-scrollbar scroll-snap-x pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
            >
              {filteredBrands.map((brand, i) => (
                <Reveal key={brand.id} delay={i * 60} className="shrink-0 w-60 sm:w-64 snap-start">
                  <BrandCard brand={brand} />
                </Reveal>
              ))}
            </div>
          )}

          <div className="mt-10 text-center">
            <Link
              to="/brands"
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Explore all brands <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===== TRENDING BRANDS ===== */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-12 w-12 rounded-2xl bg-brand-100 text-brand-700">
                <TrendingUp className="h-6 w-6" />
              </span>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-0.5 text-[11px] font-bold text-gold-700">
                  <Sparkles className="h-3 w-3" /> Hot right now
                </span>
                <h2 className="mt-1.5 font-display text-3xl sm:text-4xl font-bold text-slate-900">
                  Trending brands
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={() => scrollRowBy(trendingRowRef, -1)}
                  className="grid place-items-center h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-colors shadow-soft"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => scrollRowBy(trendingRowRef, 1)}
                  className="grid place-items-center h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-colors shadow-soft"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <Link
                to="/brands"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800 group whitespace-nowrap"
              >
                View all brands
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>

          {loading ? (
            <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="shrink-0 w-60 sm:w-64 rounded-3xl overflow-hidden border border-slate-100">
                  <div className="h-44 shimmer" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 w-20 shimmer rounded" />
                    <div className="h-6 w-28 shimmer rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              ref={trendingRowRef}
              className="flex gap-5 overflow-x-auto no-scrollbar scroll-snap-x pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
            >
              {trending.map((brand, i) => (
                <Reveal key={brand.id} delay={i * 60} className="shrink-0 w-60 sm:w-64 snap-start">
                  <BrandCard brand={brand} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== OCCASIONS SLIDER ===== */}
      <section className="pt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
              <Sparkles className="h-3.5 w-3.5" /> Shop by occasion
            </span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold text-slate-900">
              For every celebration
            </h2>
            <p className="mt-2 text-slate-500">
              Beautifully themed gift cards for the moments that matter most.
            </p>
          </Reveal>
        </div>

        <div className="mt-8">
          <CategorySlider
            title=""
            subtitle=""
            icon={null}
          >
            {occasions.map((o) => (
              <Link
                key={o.name}
                to={`/brands?occasion=${encodeURIComponent(o.search)}`}
                className={`group relative block w-60 h-44 rounded-3xl bg-gradient-to-br ${o.color} p-6 text-white shadow-card hover:shadow-card-hover hover:-translate-y-1.5 transition-all duration-500 overflow-hidden`}
              >
                <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-white/15 blur-2xl group-hover:scale-150 transition-transform duration-700" />
                <o.icon className="h-9 w-9 drop-shadow" />
                <div className="absolute bottom-5 left-5 right-5">
                  <p className="font-display text-2xl font-extrabold">{o.name}</p>
                  <p className="text-sm text-white/80 mt-0.5 flex items-center gap-1">
                    Explore cards <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </p>
                </div>
              </Link>
            ))}
          </CategorySlider>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="py-12 bg-gradient-to-b from-white to-brand-50/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <div className="group h-full rounded-3xl border border-slate-100 bg-white p-6 shadow-soft hover:shadow-card hover:-translate-y-1 transition-all duration-400">
                  <span className="grid place-items-center h-12 w-12 rounded-2xl bg-brand-600 text-white shadow-glow-sm group-hover:scale-110 transition-transform">
                    <f.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-bold text-slate-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{f.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== POPULAR BRANDS STRIP ===== */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-900">
              More brands you'll love
            </h2>
            <p className="mt-2 text-slate-500">
              Browse the full catalogue — shopping, fashion, food, travel and more.
            </p>
          </Reveal>

          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl shimmer" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {popular.map((b, i) => (
                <Reveal key={b.id} delay={i * 40}>
                  <Link
                    to={`/brand/${b.slug}`}
                    className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white p-4 h-24 shadow-soft hover:shadow-card hover:border-brand-200 transition-all duration-300"
                  >
                    <span
                      className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-display font-extrabold text-xs shadow-soft transition-transform group-hover:scale-110"
                      style={{ background: `linear-gradient(135deg, ${b.color}, ${b.color2})` }}
                    >
                      {b.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-600 group-hover:text-brand-700 text-center leading-tight">
                      {b.name}
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
          <div className="mt-8 text-center">
            <Link
              to="/brands"
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Explore all brands <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-16 bg-brand-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-[0.08] pointer-events-none" />
        <div className="absolute -top-24 right-10 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-brand-200">
              <Clock className="h-3.5 w-3.5" /> Takes under a minute
            </span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold">
              Gifting, made effortless
            </h2>
            <p className="mt-2 text-brand-200">
              Four simple steps from thought to thoughtful.
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 90}>
                <div className="relative rounded-3xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm h-full">
                  <span className="absolute -top-3 -right-3 grid place-items-center h-8 w-8 rounded-full bg-gold-400 text-gold-950 font-display font-extrabold text-sm">
                    {i + 1}
                  </span>
                  <span className="grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow-sm">
                    <s.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-brand-200 leading-relaxed">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto mb-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-700">
              <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" /> Loved by givers
            </span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold text-slate-900">
              What our customers say
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={i * 90}>
                <figure className="h-full rounded-3xl border border-slate-100 bg-white p-6 shadow-soft hover:shadow-card transition-shadow">
                  <Quote className="h-8 w-8 text-brand-200" />
                  <blockquote className="mt-3 text-sm text-slate-700 leading-relaxed">
                    "{t.text}"
                  </blockquote>
                  <div className="mt-5 flex items-center gap-3">
                    <span className="grid place-items-center h-11 w-11 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white font-display font-bold">
                      {t.name.charAt(0)}
                    </span>
                    <figcaption>
                      <p className="font-semibold text-slate-900 text-sm">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.role}</p>
                    </figcaption>
                    <span className="ml-auto flex gap-0.5 text-gold-500">
                      {Array.from({ length: 5 }).map((_, k) => (
                        <Star key={k} className="h-3.5 w-3.5 fill-gold-400" />
                      ))}
                    </span>
                  </div>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 px-6 py-14 sm:px-14 sm:py-20 text-white text-center shadow-glow">
              <div className="absolute inset-0 bg-grid opacity-[0.12] pointer-events-none" />
              <div className="absolute -top-20 -left-10 h-60 w-60 rounded-full bg-gold-300/20 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-brand-400/30 blur-3xl pointer-events-none" />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold">
                  <Gift className="h-4 w-4" /> Ready when you are
                </span>
                <h2 className="mt-5 font-display text-3xl sm:text-5xl font-extrabold leading-tight max-w-3xl mx-auto">
                  Make someone's day with a gift they actually want.
                </h2>
                <p className="mt-4 text-brand-100 max-w-xl mx-auto">
                  No more last-minute panic. Pick a brand, personalise it, and send a
                  beautiful e-gift card in under 60 seconds.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    to="/brands"
                    className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-brand-700 hover:bg-brand-50 transition-colors shadow-card"
                  >
                    Start gifting <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/corporate"
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/30 px-6 py-3.5 text-sm font-bold text-white hover:bg-white/20 transition-colors"
                  >
                    Corporate gifting
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
