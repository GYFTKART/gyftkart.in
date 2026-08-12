import { Link } from 'react-router-dom';
import { useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CategorySliderProps {
  children: ReactNode[];
  title: string;
  subtitle?: string;
  icon?: ReactNode;
}

export default function CategorySlider({
  children,
  title,
  subtitle,
  icon,
}: CategorySliderProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const scrollBy = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="grid place-items-center h-11 w-11 rounded-2xl bg-brand-100 text-brand-700">
                {icon}
              </span>
            )}
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                {title}
              </h2>
              {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => scrollBy(-1)}
              className="grid place-items-center h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-colors shadow-soft"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              className="grid place-items-center h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-colors shadow-soft"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          ref={ref}
          className="flex gap-4 overflow-x-auto no-scrollbar scroll-snap-x pb-2 -mx-4 px-4"
        >
          {children.map((child, i) => (
            <div key={i} className="snap-start shrink-0">
              {child}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function toBrandsLink(query: string): string {
  return `/brands?q=${encodeURIComponent(query)}`;
}

export { Link };
