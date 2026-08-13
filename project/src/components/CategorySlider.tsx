import { Link } from 'react-router-dom';
import { useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

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
          className="flex flex-nowrap gap-4 overflow-x-auto no-scrollbar scrollbar-none overscroll-x-contain touch-pan-y scroll-snap-x pb-2 -mx-4 px-4 cursor-grab active:cursor-grabbing select-none"
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
