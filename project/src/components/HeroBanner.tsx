import { useEffect, useRef, useState } from 'react';

// Woohoo-style wide image banner carousel. Swap the placeholder
// imageUrl values below for real creative when ready — everything
// else (autoplay, dots, transitions) works as-is.
interface BannerSlide {
  id: string;
  imageUrl: string;
  alt: string;
  href?: string;
}

const slides: BannerSlide[] = [
  {
    id: 'diwali-sale',
    imageUrl: 'https://placehold.co/1600x500/6d28d9/ffffff?text=Big+Diwali+Sale',
    alt: 'Big Diwali Sale — up to 20% off top brands',
    href: '/brands?occasion=Festival',
  },
  {
    id: 'top-brands',
    imageUrl: 'https://placehold.co/1600x500/be123c/ffffff?text=200%2B+Top+Brands',
    alt: '200+ top brands on one marketplace',
    href: '/brands',
  },
  {
    id: 'corporate-gifting',
    imageUrl: 'https://placehold.co/1600x500/0f766e/ffffff?text=Corporate+Gifting+Made+Easy',
    alt: 'Corporate gifting made easy',
    href: '/corporate',
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
        <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] lg:aspect-[3/1] overflow-hidden rounded-3xl shadow-card bg-slate-100">
          {slides.map((slide, i) => {
            const content = (
              <img
                src={slide.imageUrl}
                alt={slide.alt}
                className="h-full w-full object-cover"
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            );
            return (
              <div
                key={slide.id}
                className="absolute inset-0 transition-transform duration-700 ease-out"
                style={{ transform: `translateX(${(i - index) * 100}%)` }}
                aria-hidden={i !== index}
              >
                {slide.href ? (
                  <a href={slide.href} className="block h-full w-full" tabIndex={i === index ? 0 : -1}>
                    {content}
                  </a>
                ) : (
                  content
                )}
              </div>
            );
          })}
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
