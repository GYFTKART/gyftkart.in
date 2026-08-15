import { Link } from 'react-router-dom';
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CategorySliderProps {
  children: ReactNode[];
  title: string;
  subtitle?: string;
  icon?: ReactNode;
}

// Generic horizontal slider row, reused for both the category-pill rail
// and the product/brand carousels. Two bugs were fixed here:
//
// 1. The row used a `scroll-snap-x` class, which isn't a real Tailwind
//    utility (Tailwind's snap utilities are `snap-x` / `snap-mandatory` /
//    `snap-start`) — so scroll-snap was silently never applied and the
//    row could look like it was "breaking" or landing on half-items
//    instead of cleanly snapping card-to-card.
// 2. There was no way to advance the row other than a raw drag/swipe —
//    on desktop, where drag-to-scroll is easy to miss, the row could
//    look static. Chevron buttons now scroll the row by one viewport-ish
//    "page" with native smooth scrolling, and stay in sync with
//    scroll position so they disable themselves at each end.
export default function CategorySlider({
  children,
  title,
  subtitle,
  icon,
}: CategorySliderProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Same plain onMouseDown/onMouseMove/onMouseUp/onMouseLeave drag-to-scroll
  // approach as the brand card rows on HomePage — moves the row's native
  // scrollLeft directly. Touch is left untouched so native swipe scrolling
  // keeps working.
  const drag = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: 0 });

  const updateArrowState = () => {
    const el = ref.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < maxScroll - 4);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateArrowState();

    el.addEventListener('scroll', updateArrowState, { passive: true });
    // Re-check on resize and whenever children change size (e.g. images
    // finish loading and the row's scrollWidth grows).
    const ro = new ResizeObserver(updateArrowState);
    ro.observe(el);
    window.addEventListener('resize', updateArrowState);

    return () => {
      el.removeEventListener('scroll', updateArrowState);
      ro.disconnect();
      window.removeEventListener('resize', updateArrowState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.length]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    // Scroll by ~85% of the visible width so the next card peeking at
    // the edge gives a clear sense of continuation, rather than jumping
    // a full page and losing context of where you were.
    const amount = el.clientWidth * 0.85 * direction;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    drag.current = {
      isDown: true,
      startX: e.pageX - el.offsetLeft,
      scrollLeft: el.scrollLeft,
      moved: 0,
    };
  };

  const endDrag = () => {
    drag.current.isDown = false;
  };

  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !drag.current.isDown) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - drag.current.startX) * 2;
    drag.current.moved = Math.abs(walk);
    el.scrollLeft = drag.current.scrollLeft - walk;
  };

  // A drag ending on a card shouldn't also trigger its Link navigation.
  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (drag.current.moved > 5) {
      e.preventDefault();
      e.stopPropagation();
    }
    drag.current.moved = 0;
  };

  return (
    <section className="pt-8 pb-6 sm:py-6">
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

          {/* Prev/next controls — desktop only, native touch swipe already
              covers mobile. Disabled + dimmed at each end of the row. */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              disabled={!canScrollLeft}
              aria-label={`Scroll ${title} left`}
              className="grid place-items-center h-9 w-9 rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollByPage(1)}
              disabled={!canScrollRight}
              aria-label={`Scroll ${title} right`}
              className="grid place-items-center h-9 w-9 rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={ref}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onClickCapture={onClickCapture}
          onDragStart={(e) => e.preventDefault()}
          // snap-x + snap-mandatory (real Tailwind utilities) replace the
          // old invalid `scroll-snap-x` class, and scroll-smooth makes
          // the arrow-button scrolling above glide instead of jumping.
          className="flex flex-nowrap gap-4 overflow-x-auto no-scrollbar scrollbar-none overscroll-x-contain touch-pan-y snap-x snap-mandatory scroll-smooth pb-2 -mx-4 px-4 cursor-grab active:cursor-grabbing select-none"
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
