import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Brand } from '@/lib/types';

// -----------------------------------------------------------------------
// Fallback logo source — 100% CLOUD-HOSTED, no local files
// -----------------------------------------------------------------------
// Why Google's favicon CDN instead of hotlinked Wikimedia Commons URLs:
//   - Wikimedia Commons does NOT have a clean, official vector logo for
//     every one of these 12 brands (Swiggy, Zomato, Ajio, Croma,
//     BookMyShow, MakeMyTrip, and Nykaa don't have a reliably maintained
//     Commons file), and the real file URLs live at unpredictable hash
//     paths (upload.wikimedia.org/wikipedia/commons/<hash>/<file>) that
//     change per-file and can't be safely hardcoded without verifying
//     each one individually — a wrong/rotted hash just reproduces the
//     broken-image bug you're trying to fix.
//   - Google's public favicon endpoint (www.google.com/s2/favicons) is a
//     stable, unauthenticated, always-on Google-operated CDN, keyed by
//     plain domain name. No API key, no account, no rate-limit wall like
//     Clearbit had, and no manual asset management required.
//
// If you later get real brand-supplied logo URLs (from each brand's
// press/media kit hosted on their own CDN), just replace the value for
// that key below — everything else in this file stays the same.
// -----------------------------------------------------------------------
const BRAND_DOMAINS: Record<string, string> = {
  amazon: 'amazon.in',
  flipkart: 'flipkart.com',
  myntra: 'myntra.com',
  swiggy: 'swiggy.com',
  zomato: 'zomato.com',
  nykaa: 'nykaa.com',
  netflix: 'netflix.com',
  bookmyshow: 'bookmyshow.com',
  makemytrip: 'makemytrip.com',
  starbucks: 'starbucks.in',
  ajio: 'ajio.com',
  croma: 'croma.com',
};

function buildCloudLogoUrl(domain: string): string {
  // sz=128 asks Google's service for a 128px icon — the largest size it
  // reliably serves for most domains.
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

// Custom local overrides — brands we've designed a dedicated flat-vector
// gift-card graphic for (public/images/banners/). These take priority
// over the generic Google favicon so BrandCard shows the on-brand
// artwork instead of a tiny favicon icon.
const LOCAL_LOGO_OVERRIDES: Record<string, string> = {
  amazon: '/images/banners/amazon-gift-card.png',
  flipkart: '/images/banners/flipkart-gift-card.png',
  myntra: '/images/banners/myntra-gift-card.png',
};

const BRAND_LOGO_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(BRAND_DOMAINS).map(([key, domain]) => [
    key,
    LOCAL_LOGO_OVERRIDES[key] ?? buildCloudLogoUrl(domain),
  ])
);

// A deterministic accent color per brand, used only if we ever need the
// generated-initials fallback below (e.g. the brand isn't in the map
// above at all, such as a brand added to the DB later).
const BRAND_ACCENT_COLORS: Record<string, string> = {
  amazon: '#FF9900',
  flipkart: '#2874F0',
  myntra: '#FF3F6C',
  swiggy: '#FC8019',
  zomato: '#E23744',
  nykaa: '#FC2779',
  netflix: '#E50914',
  bookmyshow: '#C4242B',
  makemytrip: '#E74C3C',
  starbucks: '#00704A',
  ajio: '#2C2C2C',
  croma: '#1BA1E2',
};

// Normalizes a brand name for matching: lowercase, strip spaces/punctuation.
// e.g. "Book My Show", "BookMyShow", "book-my-show" all normalize the same.
function normalizeBrandKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getCloudLogoUrl(brandName: string): string | null {
  const key = normalizeBrandKey(brandName ?? '');
  return BRAND_LOGO_URLS[key] ?? null;
}

// Last-resort fallback if a brand isn't in BRAND_DOMAINS at all (e.g. a
// brand added to the DB that this file hasn't been updated for yet).
// Generated entirely in-browser as an inline SVG data URI — no network
// call, so it can never 404 or get blocked, guaranteeing every brand
// always renders *something* instead of a broken image icon.
function generateInitialsAvatar(brandName: string): string {
  const key = normalizeBrandKey(brandName ?? '');
  const color = BRAND_ACCENT_COLORS[key] ?? '#64748B';
  const initial = (brandName?.trim()?.[0] ?? '?').toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
    <circle cx="48" cy="48" r="48" fill="${color}" />
    <text x="48" y="48" text-anchor="middle" dominant-baseline="central"
      font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="#ffffff">
      ${initial}
    </text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getFallbackLogo(brandName: string): string {
  return getCloudLogoUrl(brandName) ?? generateInitialsAvatar(brandName);
}

// Returns true if a value should be treated as "empty/broken" and worth
// overriding with the fallback (covers null, undefined, empty string, and
// whitespace-only strings).
function isMissing(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

// Applies the fallback logo to a single brand row, only filling in fields
// that are actually empty/broken. Existing valid URLs from the DB are
// left untouched.
function withFallbackLogo(brand: Brand): Brand {
  const name = (brand as any).name ?? '';
  const fallbackUrl = getFallbackLogo(name);

  const next: any = { ...brand };

  if (isMissing(next.image_url)) next.image_url = fallbackUrl;
  if (isMissing(next.imageUrl)) next.imageUrl = fallbackUrl;
  if (isMissing(next.logo_url)) next.logo_url = fallbackUrl;

  return next as Brand;
}

export function useBrands(): { brands: Brand[]; loading: boolean; error: string | null } {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('brands')
          .select('*')
          .order('popularity', { ascending: false });
        if (!active) return;
        if (error) throw error;

        const rows = (data ?? []) as Brand[];
        const withLogos = rows.map(withFallbackLogo);

        setBrands(withLogos);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load brands');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { brands, loading, error };
}
