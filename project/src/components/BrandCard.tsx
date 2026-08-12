import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Store } from 'lucide-react';
import type { Brand } from '@/lib/types';

interface BrandCardProps {
  brand: Brand;
  className?: string;
}

export default function BrandCard({ brand, className = '' }: BrandCardProps) {
  const dark = brand.text_on_color === 'dark';
  const fg = dark ? 'text-slate-900' : 'text-white';
  const subFg = dark ? 'text-slate-700/80' : 'text-white/80';

  // Support either snake_case or camelCase field names for the logo image,
  // depending on how the brand data is sourced.
  const logoUrl: string | null =
    (brand as any).image_url || (brand as any).imageUrl || (brand as any).logo_url || null;

  // Track load failure in React state rather than mutating the DOM
  // directly — this is what was causing the blank white space: a
  // manual style.display change doesn't reliably re-render in React,
  // so the empty badge stayed in the layout instead of being replaced.
  const [imgFailed, setImgFailed] = useState(false);

  const showImage = Boolean(logoUrl) && !imgFailed;
  const initials = (brand.name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <Link
      to={`/brand/${brand.slug}`}
      className={`group relative block rounded-3xl overflow-hidden shadow-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 ${className}`}
    >
      {/* Brand gradient face */}
      <div
        className="relative h-44 p-5 flex flex-col justify-between overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${brand.color}, ${brand.color2})` }}
      >
        {/* decorative blobs */}
        <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-white/10 blur-2xl group-hover:scale-150 transition-transform duration-700" />
        <div className="absolute -bottom-12 -left-8 h-24 w-24 rounded-full bg-white/10 blur-2xl group-hover:scale-150 transition-transform duration-700 delay-100" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Premium logo badge panel — crisp white square so any logo
                (light or dark, SVG or PNG, transparent or not) reads
                cleanly and "pops" against the colorful gradient face. */}
            <span className="w-14 h-14 bg-white/95 rounded-2xl p-2.5 flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
              {showImage ? (
                <img
                  src={logoUrl as string}
                  alt={`${brand.name} logo`}
                  className="h-full w-full object-contain"
                  loading="lazy"
                  onError={() => setImgFailed(true)}
                />
              ) : initials ? (
                <span className="text-sm font-extrabold text-slate-700">{initials}</span>
              ) : (
                <Store className="h-5 w-5 text-slate-400" />
              )}
            </span>
            <span
              className={`font-display text-2xl font-extrabold tracking-tight leading-none truncate ${fg}`}
            >
              {brand.name}
            </span>
          </div>
          <span
            className={`grid place-items-center h-9 w-9 shrink-0 rounded-full bg-white/15 backdrop-blur-sm ${fg} transition-transform duration-500 group-hover:rotate-45 group-hover:bg-white/25`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

        <div className="relative">
          <p className={`text-sm ${subFg} line-clamp-1`}>{brand.tagline}</p>
        </div>

        {/*
          Offer & Trending badges are temporarily hidden so the clean
          gift-card face is fully visible with no text overlap. To bring
          them back later, reintroduce the offer_badge and trending
          blocks here, reading from `brand.offer_badge` and
          `brand.trending` as before.
        */}
      </div>

      {/* Bottom info */}
      <div className="bg-white p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{brand.name}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-2 text-xs font-bold text-brand-700 group-hover:bg-brand-600 group-hover:text-white transition-colors shrink-0">
          Buy Now
          <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </span>
      </div>
    </Link>
  );
}
