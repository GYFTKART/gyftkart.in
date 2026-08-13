import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

// Woohoo-style promo banner carousel: a minimalist off-white outer card
// with a left text column (headline + subtext + circular-arrow CTA) and,
// on the right, a self-contained rounded product-image card that carries
// its own background color. Swap `imageUrl` for real creative in
// /public/images/banners — autoplay, dots, and the cross-fade transition
// all work as-is regardless of what image is dropped in.
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

export default function HeroBanner() {
  // Pure cross-fade carousel: every slide is mounted at all times as an
  // `absolute inset-0` layer. Nothing is conditionally rendered and no
  // slide is ever keyed off `activeIndex`, so React never unmounts or
  // remounts a slide when the active one changes — only each layer's
  // opacity/z-index/pointer-events flip, which is a pure CSS transition
  // and can never produce a 1-frame "everything disappears" flash.
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoplay = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex((i) => (i + 1) % slides.length);
    }, AUTOPLAY_MS);
  };

  useEffect(() => {
    startAutoplay();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (i: number) => {
    setActiveIndex(i);
    // Restart the timer on manual navigation so a queued auto-advance
    // doesn't fire a moment after the user just picked a slide.
    startAutoplay();
  };

  return (
    <section className="pt-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/*
          Strictly fixed height across breakpoints (not aspect-ratio) so
          the box itself never resizes as slides cross-fade — that's what
          keeps the transition butter-smooth with no layout jump.
        */}
        <div
          className="relative w-full h-[340px] sm:h-[380px] md:h-[420px] overflow-hidden rounded-3xl select-none"
          style={{ backgroundColor: PAGE_CREAM }}
        >
          {slides.map((slide, i) => {
            const active = i === activeIndex;
            return (
              <div
                key={slide.id}
                className={`absolute inset-0 flex items-center gap-4 sm:gap-6 lg:gap-8 p-4 sm:p-6 lg:p-8 transition-opacity duration-700 ease-in-out ${
                  active ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
                }`}
                aria-hidden={!active}
              >
                {/* Left text column — ~55-60% width */}
                <div className="flex h-full w-[56%] sm:w-[58%] flex-shrink-0 flex-col justify-center gap-2.5 sm:gap-3.5 pl-2 sm:pl-4 lg:pl-8">
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
                    tabIndex={active ? 0 : -1}
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

                {/* Right product-image card — fixed height, own rounded card + backdrop color */}
                <div
                  className="relative h-[220px] sm:h-[280px] w-[44%] sm:w-[42%] flex-shrink-0 overflow-hidden rounded-2xl sm:rounded-3xl"
                  style={{ backgroundColor: slide.panelBg }}
                >
                  <img
                    src={slide.imageUrl}
                    alt={slide.imageAlt}
                    width={960}
                    height={380}
                    className="h-full w-full object-contain"
                    loading={i === 0 ? 'eager' : 'lazy'}
                    draggable={false}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Navigation dots — left-aligned under the text column, dash style */}
        <div className="mt-3 sm:mt-4 flex items-center gap-1.5 pl-2 sm:pl-4 lg:pl-8">
          {slides.map((slide, i) => {
            const active = i === activeIndex;
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
