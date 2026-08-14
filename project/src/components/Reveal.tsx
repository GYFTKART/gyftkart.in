import { useEffect, useRef, useState, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'span';
  // 'full' (default) fades in AND slides up via translateY — fine for
  // vertically-stacked sections. 'fade' only animates opacity, with no
  // transform at all. Use 'fade' for cards inside a horizontal-scroll
  // carousel (like the brand card rows): with 'full', a card's own
  // translateY(28px) -> translateY(0) entrance animation fires exactly
  // when it scrolls into view, which visually looks like the card is
  // "shifting" while the user is mid-scroll and reads as scroll-jank.
  motion?: 'full' | 'fade';
}

export default function Reveal({
  children,
  className = '',
  delay = 0,
  as = 'div',
  motion = 'full',
}: RevealProps) {
  
  // --- TEMPORARY TRACKING CODE ADDED FOR DEBUGGING ---
  useEffect(() => {
    console.log('[Reveal MOUNT]', { key: (children as any)?.key ?? "no-key", time: performance.now() });
    return () => console.log('[Reveal UNMOUNT]', { key: (children as any)?.key ?? "no-key", time: performance.now() });
  }, []);
  // ---------------------------------------------------

  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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