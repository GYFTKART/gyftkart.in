import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'span';
  motion?: 'full' | 'fade';
}

export default function Reveal({
  children,
  className = '',
  delay = 0,
  as = 'div',
  motion = 'full',
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Synchronous check, before the browser's first paint: if this
    // element is already in (or close to) the viewport on mount — the
    // common case on a hard refresh, where most above-the-fold content
    // is already "in view" the instant it exists — mark it visible
    // immediately. This is what closes the opacity:0 flash: previously
    // visibility only ever got set inside the IntersectionObserver's
    // async callback (registered in a useEffect that runs after paint),
    // so there was always at least one painted frame where the element
    // sat at opacity:0 before JS caught up.
    const rect = el.getBoundingClientRect();
    const nearViewport = rect.top < window.innerHeight + 40 && rect.bottom > -40;
    if (nearViewport) {
      setVisible(true);
      return; // no need for an observer — already resolved
    }

    // Below the fold: fall back to the observer for genuine scroll-in.
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const Tag = as as 'div';
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`${motion === 'fade' ? 'reveal-fade' : 'reveal'} ${visible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}