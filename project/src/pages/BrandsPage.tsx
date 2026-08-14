import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, TrendingUp, ShoppingBag } from 'lucide-react';
import BrandCard from '@/components/BrandCard';
import Reveal from '@/components/Reveal';
import { useBrands } from '@/lib/useBrands';
import { getCategoryIcon } from '@/lib/categoryIcons';

const categories = ['All', 'Shopping', 'Fashion', 'Beauty', 'Food & Dining', 'Travel', 'Entertainment'];

export default function BrandsPage() {
  const { brands, loading } = useBrands();
  const [params, setParams] = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const filter = params.get('filter') ?? '';

  const [query, setQuery] = useState(initialQ);
  const [activeCategory, setActiveCategory] = useState('All');
  const [onlyTrending, setOnlyTrending] = useState(filter === 'trending');

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
      {/* breadcrumb */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Brands</span>
        </nav>
      </div>

      {/* Filters + grid */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-10">
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
