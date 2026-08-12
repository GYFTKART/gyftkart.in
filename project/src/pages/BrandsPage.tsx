import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, Gift, TrendingUp, ShoppingBag } from 'lucide-react';
import BrandCard from '@/components/BrandCard';
import Reveal from '@/components/Reveal';
import { useBrands } from '@/lib/useBrands';
import { getCategoryIcon } from '@/lib/categoryIcons';

const categories = ['All', 'Shopping', 'Fashion', 'Beauty', 'Food & Dining', 'Travel', 'Entertainment'];

export default function BrandsPage() {
  const { brands, loading } = useBrands();
  const [params, setParams] = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const initialOccasion = params.get('occasion') ?? '';
  const filter = params.get('filter') ?? '';

  const [query, setQuery] = useState(initialQ);
  const [activeCategory, setActiveCategory] = useState('All');
  const [onlyTrending, setOnlyTrending] = useState(filter === 'trending');

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    let list = brands;
    if (activeCategory !== 'All') list = list.filter((b) => b.category === activeCategory);
    if (onlyTrending) list = list.filter((b) => b.trending);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q) ||
          b.tagline.toLowerCase().includes(q)
      );
    }
    return list;
  }, [brands, activeCategory, onlyTrending, query]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: brands.length };
    brands.forEach((b) => {
      counts[b.category] = (counts[b.category] ?? 0) + 1;
    });
    return counts;
  }, [brands]);

  return (
    <div className="pt-16 min-h-screen bg-gradient-to-b from-brand-50/40 to-white">
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white border-b border-slate-100">
        <div className="absolute inset-0 bg-grid opacity-50 pointer-events-none" />
        <div className="absolute -top-20 -right-10 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
              <ShoppingBag className="h-3.5 w-3.5" /> 200+ brands
            </span>
            <h1 className="mt-3 font-display text-4xl sm:text-5xl font-extrabold text-slate-900">
              Explore all <span className="text-gradient">brands</span>
            </h1>
            <p className="mt-2 text-slate-600 max-w-xl">
              Find the perfect gift card for any occasion across shopping, fashion,
              food, travel and entertainment.
            </p>

            {/* Search */}
            <div className="mt-6 max-w-xl flex items-center gap-2 rounded-2xl bg-white p-2 shadow-card border border-slate-100">
              <Search className="ml-2 h-5 w-5 text-slate-400" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  updateParam('q', e.target.value);
                }}
                placeholder="Search Amazon, Myntra, Swiggy…"
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none py-2"
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery('');
                    updateParam('q', '');
                  }}
                  className="grid place-items-center h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {(initialOccasion || filter) && (
              <p className="mt-3 text-sm text-brand-700 font-semibold flex items-center gap-1.5">
                <Gift className="h-4 w-4" />
                {initialOccasion
                  ? `Showing gifts for: ${initialOccasion}`
                  : 'Showing trending brands'}
              </p>
            )}
          </Reveal>
        </div>
      </section>

      {/* Filters + grid */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Category chips */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700 mr-1">
            <SlidersHorizontal className="h-4 w-4 text-brand-600" /> Filter
          </span>
          {categories.map((c) => {
            const Icon = c === 'All' ? ShoppingBag : getCategoryIcon(c);
            const count = categoryCounts[c] ?? 0;
            const active = activeCategory === c;
            return (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? 'bg-brand-600 text-white shadow-glow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {c}
                <span className={`text-[10px] ${active ? 'text-white/70' : 'text-slate-400'}`}>({count})</span>
              </button>
            );
          })}
          <button
            onClick={() => setOnlyTrending((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
              onlyTrending
                ? 'bg-gold-400 text-gold-950 shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-gold-300 hover:text-gold-700'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" /> Trending only
          </button>
        </div>

        {/* Results */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-3xl overflow-hidden border border-slate-100">
                <div className="h-44 shimmer" />
                <div className="p-4 space-y-2">
                  <div className="h-4 w-20 shimmer rounded" />
                  <div className="h-6 w-28 shimmer rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <span className="grid place-items-center h-20 w-20 rounded-3xl bg-brand-50 text-brand-300 mx-auto">
              <Search className="h-10 w-10" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold text-slate-900">No brands found</h2>
            <p className="mt-2 text-slate-500">
              Try a different search or clear your filters.
            </p>
            <button
              onClick={() => {
                setQuery('');
                setActiveCategory('All');
                setOnlyTrending(false);
                setParams({}, { replace: true });
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <X className="h-4 w-4" /> Clear all filters
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-4">
              Showing <span className="font-bold text-slate-800">{filtered.length}</span> brand{filtered.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {filtered.map((brand, i) => (
                <Reveal key={brand.id} delay={(i % 8) * 50}>
                  <BrandCard brand={brand} />
                </Reveal>
              ))}
            </div>
          </>
        )}

        {/* corporate banner */}
        <div className="mt-14">
          <Reveal>
            <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-10 sm:px-12 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-glow">
              <div className="absolute -top-16 -right-10 h-56 w-56 rounded-full bg-white/10 blur-3xl pointer-events-none" />
              <div>
                <h3 className="font-display text-2xl sm:text-3xl font-bold">Gifting for your whole team?</h3>
                <p className="mt-2 text-brand-100 max-w-md">
                  Bulk order gift cards for employees, clients and partners with branded, personalised cards.
                </p>
              </div>
              <Link
                to="/corporate"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-brand-700 hover:bg-brand-50 transition-colors shrink-0"
              >
                Explore corporate gifting
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
