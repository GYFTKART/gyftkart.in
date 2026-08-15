import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

// Woohoo-style promo banner carousel: a minimalist off-white outer card
// with a left text column (headline + subtext + circular-arrow CTA) and,
// on the right, a self-contained rounded product-image card that carries
// its own background color. Swap `imageUrl` for real creative in
// /public/images/banners — autoplay, dots, and the slide transition all
// work as-is regardless of what image is dropped in.
//
// MOBILE LAYOUT: below the `sm` breakpoint the slide switches from a
// side-by-side row to a stacked column — the product-image card renders
// ON TOP and the text block (headline / subtext / CTA) follows directly
// underneath it, matching the reference layout. This is done with
// `flex-col-reverse` on the slide row: the image div is the *second*
// child in markup (so screen readers / tab order still hit the text
// first), and `column-reverse` simply paints it above the text without
// reordering the DOM. At `sm` and up we flip back to a normal `flex-row`
// for the original side-by-side treatment.
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
const TRANSITION_MS = 600;

export default function HeroBanner() {
  // True infinite loop, sliding version: render
  // [lastSlideClone, ...slides, firstSlideClone] as one flex "track".
  // `index` always moves in one direction (1..N are the real slides);
  // after a transition lands on a clone at either end, we jump instantly
  // (transition disabled for one frame) to the matching real slide at the
  // opposite end. Because the clone and the real slide are visually
  // identical, that jump is invisible and motion never reverses — the
  // active slide always glides in from the right on auto-play.
  const extendedSlides = [slides[slides.length - 1], ...slides, slides[0]];
  const lastIndex = extendedSlides.length - 1;

  const [index, setIndex] = useState(1);
  const [withTransition, setWithTransition] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag / swipe state. Kept in a ref (not React state) since it's
  // updated on every pointermove and we don't want to re-render the
  // component on every pixel of movement — only `index` changes trigger
  // a render, exactly like the existing autoplay logic.
  const SWIPE_THRESHOLD_PX = 50;
  const drag = useRef({ isDown: false, startX: 0 });

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

  // Shared start/end/cancel logic for both mouse and touch. Only the X
  // coordinate is tracked (matching Woohoo-style horizontal swipe), and
  // the same SWIPE_THRESHOLD_PX used for touch is used for mouse drag.
  const startDrag = (clientX: number) => {
    drag.current = { isDown: true, startX: clientX };
    // Pause autoplay while the user is actively dragging so a timer tick
    // can't fight with the manual swipe mid-gesture.
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const endDrag = (clientX: number | null) => {
    if (!drag.current.isDown) return;
    drag.current.isDown = false;

    if (clientX !== null) {
      const delta = clientX - drag.current.startX;
      if (delta <= -SWIPE_THRESHOLD_PX) {
        setIndex((i) => i + 1); // dragged left -> next slide
      } else if (delta >= SWIPE_THRESHOLD_PX) {
        setIndex((i) => i - 1); // dragged right -> previous slide
      }
    }
    // Resume autoplay regardless of whether the drag crossed the
    // threshold, same as after a manual dot click.
    startAutoplay();
  };

  const cancelDrag = () => {
    if (!drag.current.isDown) return;
    drag.current.isDown = false;
    startAutoplay();
  };

  const onMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    startDrag(e.clientX);
  };
  // While the mouse button is held, suppress the browser's native
  // image/text drag-select so it doesn't fight with our own gesture.
  const onMouseMove = (e: ReactMouseEvent) => {
    if (drag.current.isDown) e.preventDefault();
  };
  const onMouseUp = (e: ReactMouseEvent) => endDrag(e.clientX);
  const onMouseLeave = () => cancelDrag();
  const onTouchStart = (e: ReactTouchEvent) => startDrag(e.touches[0].clientX);
  // No-op: we only need the final delta (captured in onTouchEnd), and
  // leaving touchmove passive keeps native vertical page scroll working.
  const onTouchMove = () => {};
  const onTouchEnd = (e: ReactTouchEvent) => endDrag(e.changedTouches[0]?.clientX ?? null);
  const onTouchCancel = () => cancelDrag();

  return (
    <section className="pt-3 sm:pt-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/*
          sm and up: explicit fixed pixel height (NOT aspect-ratio) — the
          viewport's box never has to be recalculated as slides change or
          images load, which is what removes the jump/layout-shift.

          Mobile (below sm): intentionally h-auto instead of a fixed
          height. The stacked flex-col-reverse layout (image on top, text
          below) has a natural content height well under the old fixed
          460px box, and centering inside that oversized box was exactly
          what created the dead space between the header and the image.
          Letting the box hug its content removes that gap. Slide-to-slide
          height is stable in practice since every slide uses the same
          2-line headline and line-clamp-2 subtext.
        */}
        <div
          className="relative h-auto sm:min-h-[360px] md:min-h-[420px] sm:h-[360px] md:h-[420px] w-full overflow-hidden rounded-3xl select-none"
          style={{ backgroundColor: PAGE_CREAM }}
        >
          {/*
            The track: a single flex row holding every slide (clones
            included) side by side, all mounted at once. Sliding is done
            purely by translating this row with a GPU-accelerated
            transform — no slide is ever unmounted/remounted and nothing
            is keyed off `index`, so there's no flash between slides.

            Pinned to `absolute inset-0` inside the fixed-height wrapper
            above so the track's own box can never influence the height
            of anything outside it — layout shifts inside the slider stay
            fully contained and never ripple into page flow.
          */}
          <div
            className="static sm:absolute sm:inset-0 flex h-auto sm:h-full w-full will-change-transform transform-gpu cursor-grab active:cursor-grabbing select-none"
            style={{
              transform: `translateX(${-index * 100}%)`,
              transition: withTransition ? `transform ${TRANSITION_MS}ms ease-out` : 'none',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
          >
            {extendedSlides.map((slide, i) => (
              <div
                key={`${slide.id}-${i}`}
                // flex-col-reverse (mobile) -> image (2nd child) paints on
                // top, text (1st child) follows below it, with NO markup
                // reordering. sm:flex-row restores the original
                // side-by-side layout on larger screens.
                className="flex h-auto sm:h-full w-full flex-shrink-0 flex-col-reverse sm:flex-row items-center gap-3 sm:gap-6 lg:gap-8 p-4 sm:p-6 lg:p-8 overflow-hidden"
                aria-hidden={i !== index}
              >
                {/* Text column — full width & centered on mobile (below the image), fixed share + left-aligned from sm up */}
                <div className="flex h-auto sm:h-full w-full sm:w-[58%] flex-shrink-0 flex-col justify-center items-center sm:items-start gap-2 sm:gap-3.5 text-center sm:text-left px-1 sm:pl-4 lg:pl-8">
                  <div className="leading-[1.05]">
                    <p className="font-display font-extrabold text-xl sm:text-4xl lg:text-5xl text-slate-900">
                      {slide.titleHead}
                    </p>
                    <p
                      className="font-display font-extrabold text-xl sm:text-4xl lg:text-5xl"
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

                {/* Product-image card — full width on mobile (sits on top of the stack), fixed share from sm up */}
                <div
                  className="relative h-[190px] sm:h-[280px] md:h-[320px] w-full sm:w-[42%] flex-shrink-0 overflow-hidden rounded-2xl sm:rounded-3xl"
                  style={{ backgroundColor: slide.panelBg }}
                >
                  <img
                    src={slide.imageUrl}
                    alt={slide.imageAlt}
                    width={960}
                    height={380}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading={i === 1 ? 'eager' : 'lazy'}
                    draggable="false"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation dots — centered on mobile (under the stacked layout), left-aligned under the text column from sm up */}
        <div className="mt-3 sm:mt-4 flex items-center justify-center sm:justify-start gap-1.5 pl-0 sm:pl-4 lg:pl-8">
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
