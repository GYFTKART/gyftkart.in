import { Link } from 'react-router-dom';
import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';

interface CategorySliderProps {
  children: ReactNode[];
  title: string;
  subtitle?: string;
  icon?: ReactNode;
}

// Generic horizontal slider row, reused for both the category-pill rail
// and the product/brand carousels.
//
// The row used a `scroll-snap-x` class, which isn't a real Tailwind
// utility (Tailwind's snap utilities are `snap-x` / `snap-mandatory` /
// `snap-start`) — so scroll-snap was silently never applied and the row
// could look like it was "breaking" or landing on half-items instead of
// cleanly snapping card-to-card.
//
// There used to be prev/next chevron buttons here for desktop, since
// mouse drag-to-scroll can be easy to miss. They've been removed: drag-
// to-scroll (below) already makes the row fully navigable with the mouse
// on desktop, and native touch swipe covers mobile, so the buttons were
// redundant UI. That also removed the only consumers of scroll-position
// tracking (canScrollLeft/canScrollRight, the ResizeObserver, and
// scrollByPage), so none of that remains either — the row now only
// tracks what drag-to-scroll itself needs.
export default function CategorySlider({
  children,
  title,
  subtitle,
  icon,
}: CategorySliderProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Same plain onMouseDown/onMouseMove/onMouseUp/onMouseLeave drag-to-scroll
  // approach as the brand card rows on HomePage — moves the row's native
  // scrollLeft directly. Touch is left untouched so native swipe scrolling
  // keeps working.
  const drag = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: 0 });

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
          // old invalid `scroll-snap-x` class. scroll-smooth keeps native
          // scrolling (e.g. from keyboard/scrollbar) gliding rather than
          // jumping.
          // touch-auto (not touch-pan-y or touch-pan-x): this row needs to
          // scroll horizontally on a swipe AND let vertical swipes fall
          // through to scroll the page. touch-pan-y restricts recognized
          // gestures to the y-axis only, which silently blocks horizontal
          // swipe-to-scroll entirely — the same bug found and fixed on the
          // brand-card carousels in HomePage.tsx. touch-pan-x would fix
          // horizontal but then block vertical scroll over this row, same
          // as it did there. touch-auto lets the browser handle each axis
          // on its own merits: scroll this row horizontally (its only
          // scrollable direction), pass vertical drags straight through.
          className="flex flex-nowrap gap-4 overflow-x-auto no-scrollbar scrollbar-none overscroll-x-contain touch-auto snap-x snap-mandatory scroll-smooth pb-2 -mx-4 px-4 cursor-grab active:cursor-grabbing select-none"
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
