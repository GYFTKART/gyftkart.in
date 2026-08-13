import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

// Woohoo-style promo banner carousel: a minimalist off-white outer card
// with a left text column (headline + subtext + circular-arrow CTA) and,
// on the right, a self-contained rounded product-image card that carries
// its own background color. Swap `imageUrl` for real creative in
// /public/images/banners — autoplay, dots, and the slide transition all
// work as-is regardless of what image is dropped in.
interface BannerSlide {
  id: string;
  titleHead: string; // first headline line, rendered in black
  titleAccent: string; // second headline line, rendered in brand green
  subtext: string;
  buttonText: string;
  buttonLink: string;
  imageUrl: string; // path to a product/voucher render, e.g. /images/banners/xyz.png
  imageAlt: string;
  panelBg: string; // fallback/backdrop color behind the product image card
}

const ACCENT_GREEN = '#0B6E4F';
const PAGE_CREAM = '#F5F5E9';

const slides: BannerSlide[] = [
  {
    id: 'amazon-voucher',
    titleHead: 'Flat 1.75%',
    titleAccent: 'Instant Off',
    subtext: 'On Amazon Shopping Voucher. Enjoy extra savings on Amazon Great Freedom Sale.',
    buttonText: 'Get yours today',
    buttonLink: '/brand/amazon',
    imageUrl: '/images/banners/amazon-voucher-box.png',
    imageAlt: 'Amazon shopping voucher gift box',
    panelBg: '#F0C7C6',
  },
  {
    id: 'gift-card-rewards',
    titleHead: 'Flat 2%',
    titleAccent: 'Extra Cashback',
    subtext: 'On premium gift cards. Redeem instantly across 200+ top brands nationwide.',
    buttonText: 'Redeem now',
    buttonLink: '/brands',
    imageUrl: '/images/banners/gift-card-rewards.png',
    imageAlt: 'Premium rewards gift card',
    panelBg: '#EFDBB8',
  },
  {
    id: 'bigbasket-groceries',
    titleHead: 'Flat 5%',
    titleAccent: 'Off On Groceries',
    subtext: 'On BigBasket Gift Cards. Stock up your essentials and save on every order.',
    buttonText: 'Shop groceries',
    buttonLink: '/brands?q=BigBasket',
    imageUrl: '/images/banners/bigbasket-groceries.png',
    imageAlt: 'BigBasket groceries gift card',
    panelBg: '#153331',
  },
];

const AUTOPLAY_MS = 5000;
const TRANSITION_MS = 700;

export default function HeroBanner() {
  // True infinite loop: render [lastSlideClone, ...slides, firstSlideClone].
  // `index` always moves in one direction (1..N are the real slides, in
  // order); after a transition lands on a clone at either end, we jump
  // instantly (transition disabled for one frame) to the equivalent real
  // slide at the opposite end — since the clone and the real slide look
  // identical, the jump is invisible and motion never reverses.
  const extendedSlides = [slides[slides.length - 1], ...slides, slides[0]];
  const lastIndex = extendedSlides.length - 1;

  const [index, setIndex] = useState(1);
  const [withTransition, setWithTransition] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag / swipe state.
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const drag = useRef({ isDown: false, pointerId: -1, startX: 0, width: 1, moved: false });

  const startAutoplay = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIndex((i) => i + 1);
    }, AUTOPLAY_MS);
  };

  useEffect(() => {
    startAutoplay();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After every index change, if we've landed on a lead/trail clone, wait
  // for the transition to finish then snap (no animation) to the matching
  // real slide at the far end.
  useEffect(() => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    if (index === lastIndex) {
      snapTimerRef.current = setTimeout(() => {
        setWithTransition(false);
        setIndex(1);
      }, TRANSITION_MS);
    } else if (index === 0) {
      snapTimerRef.current = setTimeout(() => {
        setWithTransition(false);
        setIndex(lastIndex - 1);
      }, TRANSITION_MS);
    }
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Re-enable the transition on the next frame after a transitionless snap.
  useEffect(() => {
    if (withTransition) return;
    const raf = requestAnimationFrame(() => setWithTransition(true));
    return () => cancelAnimationFrame(raf);
  }, [withTransition]);

  const activeDotIndex = ((index - 1) % slides.length + slides.length) % slides.length;

  const goTo = (i: number) => {
    setIndex(i + 1);
    // Restart the timer on manual navigation so a queued auto-advance
    // doesn't fire a moment after the user just picked a slide.
    startAutoplay();
  };

  const beginDrag = (clientX: number, pointerId: number) => {
    drag.current = { isDown: true, pointerId, startX: clientX, width: trackRef.current?.offsetWidth || 1, moved: false };
    if (timerRef.current) clearInterval(timerRef.current);
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
  };

  const updateDrag = (clientX: number) => {
    if (!drag.current.isDown) return;
    const delta = clientX - drag.current.startX;
    if (Math.abs(delta) > 5) drag.current.moved = true;
    setDragOffset(delta);
  };

  const endDrag = (finalX: number) => {
    if (!drag.current.isDown) return;
    drag.current.isDown = false;
    const delta = finalX - drag.current.startX;
    const threshold = drag.current.width * 0.15;
    if (delta > threshold) {
      setIndex((i) => i - 1);
    } else if (delta < -threshold) {
      setIndex((i) => i + 1);
    }
    setDragOffset(0);
    startAutoplay();
  };

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      beginDrag(e.clientX, e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.current.pointerId) return;
      updateDrag(e.clientX);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.current.pointerId) return;
      endDrag(e.clientX);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };
    // A drag ending on a slide's CTA shouldn't also trigger its Link.
    const onClickCapture = (e: MouseEvent) => {
      if (drag.current.moved) {
        e.preventDefault();
        e.stopPropagation();
      }
      drag.current.moved = false;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('click', onClickCapture, true);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('click', onClickCapture, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="pt-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/*
          ~3.3:1 wide rectangle at desktop, matching the reference —
          a fixed responsive height (rather than a strict aspect-ratio)
          keeps the headline/subtext/CTA stack legible at narrow widths.
        */}
        <div
          ref={trackRef}
          className="relative w-full h-[220px] sm:h-[280px] md:h-[330px] lg:h-[380px] overflow-hidden rounded-3xl cursor-grab active:cursor-grabbing select-none touch-pan-y"
          style={{ backgroundColor: PAGE_CREAM }}
        >
          {extendedSlides.map((slide, i) => (
            <div
              key={`${slide.id}-${i}`}
              className="absolute inset-0 flex items-center gap-4 sm:gap-6 lg:gap-8 p-4 sm:p-6 lg:p-8"
              style={{
                transform: `translateX(calc(${(i - index) * 100}% + ${dragOffset}px))`,
                transition: withTransition ? `transform ${TRANSITION_MS}ms ease-out` : 'none',
              }}
              aria-hidden={i !== index}
            >
              {/* Left text column — ~55-60% width */}
              <div className="flex h-full w-[56%] sm:w-[58%] flex-col justify-center gap-2.5 sm:gap-3.5 pl-2 sm:pl-4 lg:pl-8">
                <div className="leading-[1.05]">
                  <p className="font-display font-extrabold text-2xl sm:text-4xl lg:text-5xl text-slate-900">
                    {slide.titleHead}
                  </p>
                  <p
                    className="font-display font-extrabold text-2xl sm:text-4xl lg:text-5xl"
                    style={{ color: ACCENT_GREEN }}
                  >
                    {slide.titleAccent}
                  </p>
                </div>
                <p className="max-w-xs sm:max-w-sm text-xs sm:text-sm lg:text-base text-slate-600 line-clamp-2">
                  {slide.subtext}
                </p>
                <Link
                  to={slide.buttonLink}
                  tabIndex={i === index ? 0 : -1}
                  className="group mt-1 inline-flex w-fit items-center gap-2.5 sm:gap-3"
                >
                  <span
                    className="grid h-8 w-8 sm:h-10 sm:w-10 lg:h-11 lg:w-11 shrink-0 place-items-center rounded-full text-white transition-transform duration-200 group-hover:scale-105"
                    style={{ backgroundColor: ACCENT_GREEN }}
                  >
                    <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  <span className="text-xs sm:text-sm lg:text-base font-bold text-slate-900">
                    {slide.buttonText}
                  </span>
                </Link>
              </div>

              {/* Right product-image card — ~40-44% width, own rounded card + backdrop color */}
              <div
                className="relative h-full w-[44%] sm:w-[42%] overflow-hidden rounded-2xl sm:rounded-3xl"
                style={{ backgroundColor: slide.panelBg }}
              >
                <img
                  src={slide.imageUrl}
                  alt={slide.imageAlt}
                  className="h-full w-full object-cover"
                  loading={i === 1 ? 'eager' : 'lazy'}
                  draggable={false}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Navigation dots — left-aligned under the text column, dash style */}
        <div className="mt-3 sm:mt-4 flex items-center gap-1.5 pl-2 sm:pl-4 lg:pl-8">
          {slides.map((slide, i) => {
            const active = i === activeDotIndex;
            return (
              <button
                key={slide.id}
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={active}
                className={`rounded-full transition-all duration-300 ${
                  active ? 'h-2.5 w-2.5 bg-slate-900' : 'h-1 w-3 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
