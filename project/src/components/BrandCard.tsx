import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Store } from 'lucide-react';
import type { Brand } from '@/lib/types';

interface BrandCardProps {
  brand: Brand;
  className?: string;
}

export default function BrandCard({ brand, className = '' }: BrandCardProps) {
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
      className={`group relative block rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-brand-200 transition-all duration-300 hover:-translate-y-1 ${className}`}
    >
      {/* Full-width image banner, flush with the card's top corners */}
      <div className="relative h-36 w-full overflow-hidden rounded-t-2xl bg-slate-50/70 border-b border-slate-100">
        {showImage ? (
          <img
            src={logoUrl as string}
            alt={`${brand.name} logo`}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : initials ? (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-2xl font-extrabold text-slate-700">{initials}</span>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Store className="h-8 w-8 text-slate-400" />
          </div>
        )}
      </div>

      {/* Bottom info */}
      <div className="p-4">
        <p className="text-sm font-bold text-slate-900 truncate">{brand.name}</p>
        <p className="mt-0.5 text-xs font-semibold text-brand-700">Get 10% Discount</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400 truncate">{brand.tagline}</span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 shrink-0">
            Buy Now
            <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </span>
        </div>
      </div>
    </Link>
  );
}
