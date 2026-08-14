import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ShieldCheck,
  Zap,
  Clock,
  Gift,
  Plus,
  Minus,
  Sparkles,
  TrendingUp,
  Info,
  CreditCard,
  User,
  ShoppingCart,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Brand } from '@/lib/types';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/CustomerAuthContext';
import { useToast } from '@/components/Toast';
import { inr } from '@/lib/format';

const occasions = ['Birthday', 'Wedding', 'Anniversary', 'Festival', 'Thank You', 'Congrats', 'New Baby', 'Apology'];

// -----------------------------------------------------------------------
// Cloud logo helper (mirrors src/hooks/useBrands.ts)
// -----------------------------------------------------------------------
// Same Google favicon CDN approach used in useBrands.ts, kept here too so
// FALLBACK_BRANDS below never needs a local file path.
// -----------------------------------------------------------------------
const BRAND_DOMAINS: Record<string, string> = {
  amazon: 'amazon.in',
  flipkart: 'flipkart.com',
  myntra: 'myntra.com',
  swiggy: 'swiggy.com',
  zomato: 'zomato.com',
  starbucks: 'starbucks.in',
  ajio: 'ajio.com',
  croma: 'croma.com',
};

function cloudLogoUrl(brandKey: string): string {
  const domain = BRAND_DOMAINS[brandKey] ?? `${brandKey}.com`;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

// -----------------------------------------------------------------------
// Local backup dataset
// -----------------------------------------------------------------------
// Used only when the Supabase request throws, times out, or returns a
// null/empty row for the requested slug. This keeps the page usable
// (instead of a blank screen) if the database is briefly unreachable or a
// row for this slug simply doesn't exist yet. Extend this object with
// more brands as needed — any slug not listed here still falls through
// to the normal "Brand not found" state.
// -----------------------------------------------------------------------
const STANDARD_DENOMINATIONS = [250, 500, 1000, 2000, 5000];

const FALLBACK_BRANDS: Record<string, Brand> = {
  amazon: {
    slug: 'amazon',
    name: 'Amazon',
    tagline: 'Shop everything, delivered fast.',
    description:
      "Amazon gift cards can be redeemed against millions of products across electronics, fashion, home, and more.",
    category: 'Shopping',
    color: '#232F3E',
    color2: '#37475A',
    text_on_color: 'light',
    denominations: STANDARD_DENOMINATIONS,
    min_amount: 100,
    max_amount: 10000,
    discount_percent: 0,
    trending: true,
    offer_badge: '',
    popularity: 100,
    image_url: cloudLogoUrl('amazon'),
    imageUrl: cloudLogoUrl('amazon'),
    logo_url: cloudLogoUrl('amazon'),
  } as unknown as Brand,
  flipkart: {
    slug: 'flipkart',
    name: 'Flipkart',
    tagline: 'India\u2019s favourite online store.',
    description:
      'Flipkart gift cards work across electronics, fashion, home essentials, and more with fast delivery.',
    category: 'Shopping',
    color: '#2874F0',
    color2: '#1A56C4',
    text_on_color: 'light',
    denominations: STANDARD_DENOMINATIONS,
    min_amount: 100,
    max_amount: 10000,
    discount_percent: 0,
    trending: true,
    offer_badge: '',
    popularity: 95,
    image_url: cloudLogoUrl('flipkart'),
    imageUrl: cloudLogoUrl('flipkart'),
    logo_url: cloudLogoUrl('flipkart'),
  } as unknown as Brand,
  myntra: {
    slug: 'myntra',
    name: 'Myntra',
    tagline: 'Fashion that fits your style.',
    description: 'Myntra gift cards unlock top fashion and lifestyle brands, all in one place.',
    category: 'Fashion',
    color: '#FF3F6C',
    color2: '#D42A54',
    text_on_color: 'light',
    denominations: STANDARD_DENOMINATIONS,
    min_amount: 100,
    max_amount: 10000,
    discount_percent: 0,
    trending: false,
    offer_badge: '',
    popularity: 80,
    image_url: cloudLogoUrl('myntra'),
    imageUrl: cloudLogoUrl('myntra'),
    logo_url: cloudLogoUrl('myntra'),
  } as unknown as Brand,
  swiggy: {
    slug: 'swiggy',
    name: 'Swiggy',
    tagline: 'Food, groceries, and more at your door.',
    description: 'Swiggy gift cards can be used for food delivery, Instamart groceries, and Dineout.',
    category: 'Food & Dining',
    color: '#FC8019',
    color2: '#E86F0C',
    text_on_color: 'dark',
    denominations: STANDARD_DENOMINATIONS,
    min_amount: 100,
    max_amount: 10000,
    discount_percent: 0,
    trending: true,
    offer_badge: '',
    popularity: 90,
    image_url: cloudLogoUrl('swiggy'),
    imageUrl: cloudLogoUrl('swiggy'),
    logo_url: cloudLogoUrl('swiggy'),
  } as unknown as Brand,
  zomato: {
    slug: 'zomato',
    name: 'Zomato',
    tagline: 'Order in, or dine out.',
    description: 'Zomato gift cards can be redeemed for food delivery and dining across thousands of restaurants.',
    category: 'Food & Dining',
    color: '#E23744',
    color2: '#C22530',
    text_on_color: 'light',
    denominations: STANDARD_DENOMINATIONS,
    min_amount: 100,
    max_amount: 10000,
    discount_percent: 0,
    trending: false,
    offer_badge: '',
    popularity: 85,
    image_url: cloudLogoUrl('zomato'),
    imageUrl: cloudLogoUrl('zomato'),
    logo_url: cloudLogoUrl('zomato'),
  } as unknown as Brand,
  starbucks: {
    slug: 'starbucks',
    name: 'Starbucks',
    tagline: 'Coffee, crafted for every moment.',
    description: 'Starbucks gift cards can be redeemed on coffee, food, and merchandise across every store.',
    category: 'Food & Dining',
    color: '#00704A',
    color2: '#00543A',
    text_on_color: 'light',
    denominations: STANDARD_DENOMINATIONS,
    min_amount: 100,
    max_amount: 10000,
    discount_percent: 0,
    trending: false,
    offer_badge: '',
    popularity: 70,
    image_url: cloudLogoUrl('starbucks'),
    imageUrl: cloudLogoUrl('starbucks'),
    logo_url: cloudLogoUrl('starbucks'),
  } as unknown as Brand,
  ajio: {
    slug: 'ajio',
    name: 'Ajio',
    tagline: 'Curated fashion, delivered your way.',
    description: 'Ajio gift cards unlock trending fashion and lifestyle labels across menswear, womenswear, and more.',
    category: 'Fashion',
    color: '#2C2C2C',
    color2: '#484848',
    text_on_color: 'light',
    denominations: STANDARD_DENOMINATIONS,
    min_amount: 100,
    max_amount: 10000,
    discount_percent: 0,
    trending: false,
    offer_badge: '',
    popularity: 65,
    image_url: cloudLogoUrl('ajio'),
    imageUrl: cloudLogoUrl('ajio'),
    logo_url: cloudLogoUrl('ajio'),
  } as unknown as Brand,
  croma: {
    slug: 'croma',
    name: 'Croma',
    tagline: 'Electronics and gadgets, sorted.',
    description: 'Croma gift cards can be redeemed on electronics, appliances, and gadgets in-store and online.',
    category: 'Shopping',
    color: '#1BA1E2',
    color2: '#0F7EB8',
    text_on_color: 'light',
    denominations: STANDARD_DENOMINATIONS,
    min_amount: 100,
    max_amount: 10000,
    discount_percent: 0,
    trending: false,
    offer_badge: '',
    popularity: 60,
    image_url: cloudLogoUrl('croma'),
    imageUrl: cloudLogoUrl('croma'),
    logo_url: cloudLogoUrl('croma'),
  } as unknown as Brand,
};

function getFallbackBrand(slug: string | undefined): Brand | null {
  if (!slug) return null;
  return FALLBACK_BRANDS[slug.toLowerCase()] ?? null;
}

export default function BrandProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { add } = useCart();
  const { session } = useAuth();
  const { push } = useToast();

  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [usingFallbackData, setUsingFallbackData] = useState(false);

  const [amount, setAmount] = useState<number | ''>('');
  const [quantity, setQuantity] = useState(1);
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [message, setMessage] = useState('');
  const [occasion, setOccasion] = useState('Birthday');
  const [touched, setTouched] = useState(false);

  // "Recipient details" vs "Buy for self" toggle. When set to 'self' and
  // the customer is logged in, the name/email fields are prefilled (and
  // locked) with their account details.
  const [giftFor, setGiftFor] = useState<'recipient' | 'self'>('recipient');

  const selectRecipientMode = () => {
    setGiftFor('recipient');
    setRecipientName('');
    setRecipientEmail('');
    setRecipientPhone('');
  };

  const selectSelfMode = () => {
    if (!session) {
      push('Please log in to buy a gift card for yourself', 'error');
      return;
    }
    setGiftFor('self');
    setRecipientName(session.name);
    setRecipientEmail(session.email);
    setRecipientPhone(session.phone ?? '');
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setUsingFallbackData(false);

    (async () => {
      if (!slug) {
        setLoading(false);
        setNotFound(true);
        return;
      }

      let resolvedBrand: Brand | null = null;

      try {
        const { data, error } = await supabase
          .from('brands')
          .select('*')
          .eq('slug', slug)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          resolvedBrand = data as Brand;
        } else {
          // Query succeeded but returned nothing for this slug — try the
          // local backup dictionary before giving up on the page.
          resolvedBrand = getFallbackBrand(slug);
          if (resolvedBrand && active) setUsingFallbackData(true);
        }
      } catch (err) {
        // Network error, Supabase outage, malformed row, unexpected
        // schema mismatch, etc. Don't let this blank-screen the page —
        // fall back to local data if we have it for this slug.
        console.error('Failed to load brand from Supabase, using fallback if available:', err);
        resolvedBrand = getFallbackBrand(slug);
        if (resolvedBrand && active) setUsingFallbackData(true);
      }

      if (!active) return;

      if (!resolvedBrand) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Guard against a row that's missing/empty denominations so the
      // amount picker below never crashes on an undefined array.
      const safeDenominations =
        Array.isArray(resolvedBrand.denominations) && resolvedBrand.denominations.length > 0
          ? resolvedBrand.denominations
          : STANDARD_DENOMINATIONS;

      setBrand({ ...resolvedBrand, denominations: safeDenominations });
      setAmount(safeDenominations[0]);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  const dark = brand?.text_on_color === 'dark';
  const fg = dark ? 'text-slate-900' : 'text-white';
  const subFg = dark ? 'text-slate-700/80' : 'text-white/80';

  const numericAmount = typeof amount === 'number' ? amount : 0;
  const total = numericAmount * quantity;

  const amountValid = numericAmount >= (brand?.min_amount ?? 0) && numericAmount <= (brand?.max_amount ?? 0);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail);
  const phoneValid = /^[0-9+\-\s]{7,15}$/.test(recipientPhone);
  const nameValid = recipientName.trim().length >= 2;

  const canAdd = amountValid && emailValid && phoneValid && nameValid && numericAmount > 0;

  const buildCartItem = () => ({
    brand_slug: brand!.slug,
    brand_name: brand!.name,
    brand_color: brand!.color,
    brand_color2: brand!.color2,
    category: brand!.category,
    amount: numericAmount,
    quantity,
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    recipient_phone: recipientPhone,
    message,
    occasion,
  });

  const handleAddToCart = () => {
    setTouched(true);
    if (!brand || !canAdd) {
      push('Please complete the recipient details and amount', 'error');
      return;
    }
    add(buildCartItem());
    push(`${brand.name} gift card added to cart`, 'success');
  };

  const handleBuyNow = () => {
    setTouched(true);
    if (!brand || !canAdd) {
      push('Please complete the recipient details and amount', 'error');
      return;
    }
    // Buy Now skips the cart entirely — checkout only sees this one item,
    // not whatever else might already be sitting in the cart.
    navigate('/checkout', {
      state: {
        buyNowItem: {
          ...buildCartItem(),
          id: `buynow-${Date.now()}`,
        },
      },
    });
  };

  if (loading) {
    return (
      <div className="pt-16 min-h-screen">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="h-6 w-40 shimmer rounded mb-6" />
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="h-80 rounded-3xl shimmer" />
            <div className="space-y-4">
              <div className="h-8 w-2/3 shimmer rounded" />
              <div className="h-4 w-1/2 shimmer rounded" />
              <div className="h-32 shimmer rounded-2xl" />
              <div className="h-12 shimmer rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !brand) {
    return (
      <div className="pt-16 min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <span className="grid place-items-center h-20 w-20 rounded-3xl bg-brand-100 text-brand-600 mx-auto">
            <Gift className="h-10 w-10" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold text-slate-900">Brand not found</h1>
          <p className="mt-2 text-slate-500">
            We couldn't find the gift card you were looking for.
          </p>
          <Link
            to="/brands"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to all brands
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 bg-gradient-to-b from-brand-50/40 to-transparent">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <Link to="/brands" className="hover:text-brand-700">Brands</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">{brand.name}</span>
        </nav>

        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-brand-700 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {usingFallbackData && (
          <div className="mb-6 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            We're showing cached details for this gift card while we reconnect to live pricing. Amounts and
            availability may be slightly out of date.
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* ===== LEFT: Glassmorphic gift card preview ===== */}
          <div className="lg:sticky lg:top-24 self-start">
            <div
              className="relative rounded-[32px] p-7 sm:p-9 overflow-hidden shadow-glow"
              style={{ background: `linear-gradient(135deg, ${brand.color}, ${brand.color2})` }}
            >
              {/* ambient glow blobs behind the glass */}
              <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10 blur-3xl pointer-events-none" />

              {/*
                Category text badge (e.g. "Shopping", "Food & Dining") is
                intentionally removed from the voucher face for a
                cleaner, more modern look. Trending stays, right-aligned.
              */}
              {brand.trending && (
                <div className="relative flex items-center justify-end">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/90 text-brand-700 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">
                    <TrendingUp className="h-3 w-3" /> Trending
                  </span>
                </div>
              )}

              {/* Glassmorphic voucher panel — the actual "card" surface */}
              <div className="relative mt-6 rounded-3xl border border-white/25 bg-white/10 backdrop-blur-xl p-6 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest ${subFg}`}>
                    <CreditCard className="h-4 w-4" /> Gift card
                  </span>
                  <span className={`font-mono tracking-widest text-xs ${subFg}`}>
                    •••• {brand.slug.slice(0, 4).toUpperCase()}
                  </span>
                </div>

                <h1 className={`mt-5 font-display text-3xl sm:text-4xl font-extrabold leading-none ${fg}`}>
                  {brand.name}
                </h1>
                <p className={`mt-1.5 text-sm ${subFg}`}>{brand.tagline}</p>

                <div className="mt-8">
                  <p className={`text-xs ${subFg}`}>Gift card value</p>
                  <p className={`font-display text-5xl font-extrabold tracking-tight ${fg}`}>
                    {inr(numericAmount || brand.denominations[0])}
                  </p>
                  {quantity > 1 && (
                    <p className={`mt-1 text-xs ${subFg}`}>
                      {quantity} cards · {inr(total)} total
                    </p>
                  )}
                </div>

                <div className="mt-7 flex items-center justify-between border-t border-white/20 pt-4">
                  <div className="min-w-0">
                    <p className={`text-[11px] uppercase tracking-widest ${subFg}`}>Issued to</p>
                    <p className={`mt-0.5 flex items-center gap-1.5 text-sm font-semibold truncate ${fg}`}>
                      <User className="h-3.5 w-3.5 shrink-0" />
                      {recipientName.trim() ? recipientName : 'Recipient name'}
                    </p>
                  </div>
                  <p className={`text-sm font-semibold shrink-0 ${subFg}`}>Valid 12 months</p>
                </div>
              </div>

            </div>

            {/* trust badges */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { icon: Zap, label: 'Instant delivery' },
                { icon: ShieldCheck, label: 'Secure payment' },
                { icon: Clock, label: 'Valid 12 months' },
              ].map((t) => (
                <div key={t.label} className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-soft">
                  <t.icon className="h-5 w-5 mx-auto text-brand-600" />
                  <p className="mt-1.5 text-[11px] font-semibold text-slate-600 leading-tight">{t.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
              <h3 className="font-display text-sm font-bold text-slate-900">About this gift card</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{brand.description}</p>
              <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 bg-brand-50/60 rounded-xl p-3">
                <Info className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />
                Redeemable on {brand.name}'s website and app. Valid for 12 months from purchase. Terms apply.
              </div>
            </div>
          </div>

          {/* ===== RIGHT: Configurator ===== */}
          <div className="rounded-[32px] border border-slate-100 bg-white p-6 sm:p-8 shadow-card">
            <h2 className="font-display text-2xl font-bold text-slate-900">Build your gift card</h2>
            <p className="text-sm text-slate-500 mt-1">Pick an amount, tell us who it's for, add a note.</p>

            {/* Amount */}
            <div className="mt-7">
              <label className="block text-sm font-bold text-slate-800">Choose an amount</label>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {brand.denominations.map((d) => (
                  <button
                    key={d}
                    onClick={() => setAmount(d)}
                    className={`relative rounded-2xl border-2 px-3 py-3 text-sm font-bold transition-all ${
                      amount === d
                        ? 'border-brand-600 bg-brand-50 text-brand-700 shadow-glow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'
                    }`}
                  >
                    {inr(d)}
                    {amount === d && (
                      <Check className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-brand-600 text-white p-1 shadow" />
                    )}
                  </button>
                ))}
              </div>

              {/* custom amount */}
              <div className="mt-3 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
                <input
                  type="number"
                  value={amount === '' ? '' : amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={`Custom amount (${inr(brand.min_amount)}–${inr(brand.max_amount)})`}
                  className={`w-full rounded-2xl border-2 bg-white pl-8 pr-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-colors ${
                    touched && !amountValid
                      ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
                      : 'border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
                  }`}
                />
              </div>
              {touched && !amountValid && (
                <p className="mt-1.5 text-xs text-rose-500">
                  Enter an amount between {inr(brand.min_amount)} and {inr(brand.max_amount)}.
                </p>
              )}
            </div>

            {/* Quantity */}
            <div className="mt-6 flex items-center justify-between">
              <label className="text-sm font-bold text-slate-800">Quantity</label>
              <div className="inline-flex items-center rounded-full border border-slate-200">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="grid place-items-center h-9 w-9 text-slate-600 hover:text-brand-600 transition-colors"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center font-bold text-slate-800">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                  className="grid place-items-center h-9 w-9 text-slate-600 hover:text-brand-600 transition-colors"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Occasion */}
            <div className="mt-6">
              <label className="block text-sm font-bold text-slate-800">Occasion</label>
              <div className="mt-3 flex flex-wrap gap-2">
                {occasions.map((o) => (
                  <button
                    key={o}
                    onClick={() => setOccasion(o)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      occasion === o
                        ? 'bg-brand-600 text-white shadow-glow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-brand-100 hover:text-brand-700'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient */}
            <div className="mt-6">
              <h3 className="font-display text-sm font-bold text-slate-800">Who is this for?</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={selectRecipientMode}
                  className={`flex items-center gap-2.5 rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                    giftFor === 'recipient'
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
                  }`}
                >
                  <span
                    className={`relative grid place-items-center h-4 w-4 shrink-0 rounded-full border-2 ${
                      giftFor === 'recipient' ? 'border-brand-600' : 'border-slate-300'
                    }`}
                  >
                    {giftFor === 'recipient' && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                  </span>
                  Recipient details
                </button>
                <button
                  type="button"
                  onClick={selectSelfMode}
                  className={`flex items-center gap-2.5 rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                    giftFor === 'self'
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
                  }`}
                >
                  <span
                    className={`relative grid place-items-center h-4 w-4 shrink-0 rounded-full border-2 ${
                      giftFor === 'self' ? 'border-brand-600' : 'border-slate-300'
                    }`}
                  >
                    {giftFor === 'self' && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                  </span>
                  Buy for self
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    readOnly={giftFor === 'self'}
                    placeholder="Recipient name"
                    className={`w-full rounded-2xl border-2 px-4 py-3 text-sm outline-none transition-colors ${
                      giftFor === 'self' ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white'
                    } ${
                      touched && !nameValid
                        ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
                        : 'border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
                    }`}
                  />
                  {touched && !nameValid && (
                    <p className="mt-1.5 text-xs text-rose-500">Please enter the recipient's name.</p>
                  )}
                </div>
                <div>
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    readOnly={giftFor === 'self'}
                    placeholder="Recipient email (where the gift card will be sent)"
                    className={`w-full rounded-2xl border-2 px-4 py-3 text-sm outline-none transition-colors ${
                      giftFor === 'self' ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white'
                    } ${
                      touched && !emailValid
                        ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
                        : 'border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
                    }`}
                  />
                  {touched && !emailValid && (
                    <p className="mt-1.5 text-xs text-rose-500">Enter a valid email address.</p>
                  )}
                </div>
                <div>
                  <input
                    type="tel"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    readOnly={giftFor === 'self' && Boolean(session?.phone)}
                    placeholder="Recipient phone"
                    className={`w-full rounded-2xl border-2 px-4 py-3 text-sm outline-none transition-colors ${
                      giftFor === 'self' && session?.phone
                        ? 'bg-slate-50 text-slate-500 cursor-not-allowed'
                        : 'bg-white'
                    } ${
                      touched && !phoneValid
                        ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
                        : 'border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
                    }`}
                  />
                  {touched && !phoneValid && (
                    <p className="mt-1.5 text-xs text-rose-500">Enter a valid phone number.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Message */}
            <div className="mt-6">
              <label className="block text-sm font-bold text-slate-800">
                Personalised message <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 250))}
                rows={3}
                placeholder="Write something heartfelt…"
                className="mt-2 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors resize-none"
              />
              <p className="mt-1 text-right text-[11px] text-slate-400">{message.length}/250</p>
            </div>

            {/* Summary + CTA */}
            <div className="mt-7 rounded-2xl bg-gradient-to-r from-brand-50 to-white border border-brand-100 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Subtotal</span>
                <span className="font-display text-2xl font-extrabold text-slate-900">{inr(total)}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={handleAddToCart}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-brand-600 bg-white px-5 py-4 text-sm font-bold text-brand-700 hover:bg-brand-50 transition-colors"
              >
                <ShoppingCart className="h-4 w-4" />
                Add to Cart
              </button>
              <button
                onClick={handleBuyNow}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-4 text-sm font-bold text-white hover:shadow-glow transition-shadow"
              >
                <Sparkles className="h-4 w-4" />
                Buy Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
