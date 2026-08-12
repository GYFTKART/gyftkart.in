import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

// Woohoo-style promo banner carousel: a minimalist off-white card with
// a left text panel (headline + subtext + CTA) and a right product-image
// panel. Swap `imageUrl` for real creative in /public/images/banners —
// autoplay, dots, and the slide transition all work as-is regardless of
// what image is dropped in.
interface BannerSlide {
  id: string;
  titleHead: string; // first headline line, rendered in black
  titleAccent: string; // second headline line, rendered in brand green
  subtext: string;
  buttonText: string;
  buttonLink: string;
  imageUrl: string; // path to a product/voucher render, e.g. /images/banners/xyz.png
  imageAlt: string;
}

const ACCENT_GREEN = '#0B6E4F';

const slides: BannerSlide[] = [
  {
    id: 'amazon-voucher',
    titleHead: 'Flat 1.75%',
    titleAccent: 'Instant Off',
    subtext: 'On Amazon Shopping Voucher. Enjoy extra savings on every recharge and gift purchase.',
    buttonText: 'Get yours today',
    buttonLink: '/brand/amazon',
    imageUrl: '/images/banners/amazon-voucher-box.png',
    imageAlt: 'Amazon shopping voucher gift box',
  },
  {
    id: 'flipkart-voucher',
    titleHead: 'Flat 2%',
    titleAccent: 'Cashback Extra',
    subtext: 'On Flipkart Gift Cards. Stack it with ongoing offers for even bigger savings.',
    buttonText: 'Shop now',
    buttonLink: '/brand/flipkart',
    imageUrl: '/images/banners/flipkart-voucher-box.png',
    imageAlt: 'Flipkart gift card box',
  },
  {
    id: 'corporate-gifting',
    titleHead: 'Gifting for',
    titleAccent: 'Your Whole Team',
    subtext: 'Bulk order branded, personalised gift cards for employees, clients and partners.',
    buttonText: 'Explore corporate',
    buttonLink: '/corporate',
    imageUrl: '/images/banners/corporate-gift-box.png',
    imageAlt: 'Corporate gifting box',
  },
];

const AUTOPLAY_MS = 5000;

export default function HeroBanner() {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoplay = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
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
    setIndex(i);
    // Restart the timer on manual navigation so a queued auto-advance
    // doesn't fire a moment after the user just picked a slide.
    startAutoplay();
  };

  return (
    <section className="pt-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/*
          Fixed, responsive height rather than a strict aspect-ratio —
          a pure aspect-ratio box would squeeze the headline/subtext/CTA
          stack at narrow widths. This still reads as the same wide,
          short "banner" rectangle at every breakpoint.
        */}
        <div className="relative w-full h-[190px] sm:h-[240px] md:h-[270px] lg:h-[310px] overflow-hidden rounded-3xl bg-[#F5F5E9]">
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              className="absolute inset-0 flex items-stretch transition-transform duration-700 ease-out"
              style={{ transform: `translateX(${(i - index) * 100}%)` }}
              aria-hidden={i !== index}
            >
              {/* Left text panel — ~60-65% width */}
              <div className="flex w-[62%] sm:w-[64%] flex-col justify-center gap-2 sm:gap-3 pl-6 sm:pl-10 lg:pl-14 pr-2 sm:pr-4">
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
                  className="inline-flex w-fit items-center gap-2 rounded-lg px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm transition-colors hover:opacity-90"
                  style={{ backgroundColor: ACCENT_GREEN }}
                >
                  <ArrowRight className="h-4 w-4 shrink-0 text-white" />
                  {slide.buttonText}
                </Link>
              </div>

              {/* Right product image panel — ~35-40% width */}
              <div className="relative w-[38%] sm:w-[36%] overflow-hidden">
                <img
                  src={slide.imageUrl}
                  alt={slide.imageAlt}
                  className="absolute bottom-0 right-0 h-[95%] sm:h-[105%] w-auto max-w-none object-contain object-right-bottom"
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Navigation dots */}
        <div className="mt-4 flex items-center justify-center gap-2">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index ? 'w-6 bg-brand-600' : 'w-2 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
