import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigationType, Routes, Route, Navigate } from 'react-router-dom';
import { CartProvider } from '@/context/CartContext';
import { CustomerAuthProvider } from '@/context/CustomerAuthContext';
import { ToastProvider } from '@/components/Toast';
import { AdminAuthProvider, useAdminAuth } from '@/context/AdminAuthContext';
import { useAuth } from '@/context/CustomerAuthContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import HomePage from '@/pages/HomePage';
import BrandsPage from '@/pages/BrandsPage';
import BrandProductPage from '@/pages/BrandProductPage';
import CorporatePage from '@/pages/CorporatePage';
import DashboardPage from '@/pages/DashboardPage';
import CheckoutPage from '@/pages/CheckoutPage';
import CartPage from '@/pages/CartPage';
import NotFoundPage from '@/pages/NotFoundPage';
import AdminLoginPage from '@/pages/AdminLoginPage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import ProfilePage from './pages/ProfilePage';
import OrdersPage from '@/pages/OrdersPage';
import ContactUs from '@/pages/ContactUs';
import TermsOfUse from '@/pages/TermsOfUse';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import FaqPage from '@/pages/FaqPage';
import OfferTerms from '@/pages/OfferTerms';
import AboutPage from '@/pages/AboutPage';
import HowItWorksPage from '@/pages/HowItWorksPage';
import CareersPage from '@/pages/CareersPage';


// We take over scroll restoration entirely ourselves (see ScrollManager
// below), because the browser's built-in 'auto' restoration has two
// problems in a client-rendered app like this one:
//  1. It fires before async content (data fetches, images) has finished
//     loading, so it often restores to the wrong spot on a page that's
//     still growing — which is why refreshing could still lose position.
//  2. It doesn't know the difference between "user clicked a link"
//     (should scroll to top) and "user pressed Back" (should restore),
//     so relying on it produces inconsistent, occasionally jerky results.
// Handing control to 'manual' lets us decide exactly what happens on
// every navigation, and back it with sessionStorage so it also survives
// a hard refresh.
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

const SCROLL_KEY_PREFIX = 'scrollpos:';

function readSavedScroll(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY_PREFIX + key);
    return raw === null ? null : Number(raw);
  } catch {
    return null; // sessionStorage unavailable (private browsing, etc.)
  }
}

function saveScroll(key: string, y: number) {
  try {
    sessionStorage.setItem(SCROLL_KEY_PREFIX + key, String(y));
  } catch {
    // storage full/unavailable — restoration just won't be perfect, no crash
  }
}

// Events that count as "the user has taken over scrolling". Deliberately
// input-device events, not 'scroll' itself — a 'scroll' event fires just
// as much from our own snap() calls as from the user, so it can't be used
// to distinguish the two. wheel/touchstart/keydown only fire from an
// actual person at the input device.
const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'keydown'] as const;

// Scrolls to `target` and keeps re-asserting it for as long as the page's
// own height keeps changing under us. This is what makes restoration
// reliable (and jerk-free) even on pages with async data fetches (e.g.
// HomePage's useBrands()) that resolve well after mount and grow the
// page — a single scrollTo call, or even a fixed handful of rAF retries,
// gets overridden by that late layout shift once it lands.
//
// IMPORTANT: the first write happens synchronously (not inside a rAF/RO
// callback). The caller always invokes this from a useLayoutEffect, which
// React guarantees runs after the DOM is updated but before the browser
// paints. Writing the scroll position synchronously there means the very
// first paint the user sees already has the correct position baked in —
// nothing to visibly snap to. Only the *follow-up* corrections (needed
// because async content can still grow the page after that first paint)
// are driven by ResizeObserver, since those genuinely have to wait for
// layout to change before they can do anything useful.
//
// USER-TAKEOVER: those follow-up ResizeObserver corrections used to be
// able to fire up to ~1-2s after load (whenever a late font/image/brand
// fetch resolves and shifts layout) with no awareness that the user had
// already scrolled away in the meantime — yanking them back to the stale
// `target` and producing a jarring down-then-up jerk. We now listen for
// the first real input-device event (wheel, touch, or key) and treat it
// as "the user has taken over": the moment one fires, we stop snapping
// and tear the observer down immediately, so restoration only ever
// fights layout shift and never fights the user.
function restoreScroll(target: number) {
  const root = document.documentElement;
  root.classList.add('disable-smooth-scroll');

  let settleTimer: number;
  let cancelled = false;
  let lastHeight = document.body.scrollHeight;

  const snap = () => {
    if (cancelled) return;
    window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
  };

  const finish = () => {
    if (cancelled) return;
    cancelled = true;
    ro.disconnect();
    clearTimeout(settleTimer);
    root.classList.remove('disable-smooth-scroll');
    USER_INPUT_EVENTS.forEach((evt) => window.removeEventListener(evt, finish));
  };

  const ro = new ResizeObserver(() => {
    // Previously this retried a fixed 10 animation frames (~160ms) and gave
    // up. That's fine for content that's already in the DOM, but pages with
    // a real network fetch (brand lists, product data, etc.) can easily grow
    // their height well past 160ms after mount, which let the old version
    // exhaust its retries before the fetch even resolved — the page would
    // then settle taller than the restored position, producing a visible
    // jump. Watching document.body directly removes the guesswork: we keep
    // re-snapping while the page is genuinely still growing, and only stop
    // once 400ms pass with no further growth — or the user starts
    // scrolling themselves, whichever comes first.
    //
    // GROWTH-ONLY GUARD: only call snap() when scrollHeight has actually
    // increased since the last check. A resize that shrinks or holds
    // steady (a skeleton settling into its final measured height, a card
    // row losing a couple of reserved pixels, etc.) does NOT make `target`
    // stale — there's nothing to correct. The browser's own scroll
    // anchoring already keeps the viewport visually stable for those
    // off-screen resizes; forcibly re-running scrollTo on top of that
    // fights the anchoring correction and is exactly what produced the
    // visible up/down jerk. Only real growth (late content pushing
    // `target` further down the page) needs an active re-snap.
    const newHeight = document.body.scrollHeight;
    const grew = newHeight > lastHeight;
    lastHeight = newHeight;

    if (grew) snap();
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(finish, 400);
  });

  // `finish` doubles as the input handler: the very first wheel/touch/key
  // event cancels all further snapping and cleans everything up. `once:
  // true` is just a belt-and-suspenders — finish() itself also removes
  // all three listeners on first call, however it was triggered.
  USER_INPUT_EVENTS.forEach((evt) =>
    window.addEventListener(evt, finish, { passive: true, once: true })
  );

  snap(); // synchronous first write — no visible jump
  ro.observe(document.body);
  settleTimer = window.setTimeout(finish, 400);
}

function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType(); // 'PUSH' | 'REPLACE' | 'POP'
  const isFirstRender = useRef(true);

  // Continuously persist the scroll position of the *current* entry (to
  // sessionStorage, not just memory) so it survives both in-app navigation
  // and a hard refresh of the tab.
  useLayoutEffect(() => {
    const key = location.key;
    let frame = 0;
    const persist = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => saveScroll(key, window.scrollY));
    };
    window.addEventListener('scroll', persist, { passive: true });
    // Also catch the final position right as the tab closes/reloads, in
    // case the last scroll event's rAF never got to run.
    window.addEventListener('beforeunload', persist);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', persist);
      window.removeEventListener('beforeunload', persist);
    };
  }, [location.key]);

  // Decide what to do with scroll position whenever the route changes —
  // including the very first render, which covers hard refreshes.
  useLayoutEffect(() => {
    const saved = readSavedScroll(location.key);

    if (isFirstRender.current) {
      isFirstRender.current = false;
      // Hard refresh (or very first load of the app): restore the exact
      // spot the user was at on this entry, if we have one saved.
      if (saved !== null) restoreScroll(saved);
      return;
    }

    if (navType === 'POP') {
      // Back/Forward: restore the exact position that entry had when the
      // user left it — this now works even if the entry we're returning
      // to was itself refreshed at some point, since it's read from
      // sessionStorage rather than an in-memory map.
      restoreScroll(saved ?? 0);
    } else {
      // Regular link click (PUSH) or a redirect (REPLACE): always start
      // the new page at the top.
      restoreScroll(0);
    }
  }, [location.pathname, location.key, navType]);

  return null;
}

function ProtectedAdminRoute({ children }: { children: ReactNode }) {
  const { admin } = useAdminAuth();
  if (!admin) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

// Guards customer-only pages (like /dashboard). Unauthenticated visitors
// are bounced to the homepage instead of seeing the protected page.
function ProtectedCustomerRoute({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');

  return (
    <ToastProvider>
      {/*
        CartProvider now wraps ScrollManager, the navbar/drawer, AND the
        <main>/<Routes> block below. Previously it only wrapped the
        navbar + drawer, so any page component (BrandProductPage,
        CartPage, CheckoutPage, etc.) that called useCart() would throw
        "useCart must be used within CartProvider" the moment it
        rendered outside that scope. Wrapping everything here fixes the
        crash for good.
      */}
      <CustomerAuthProvider>
        <CartProvider>
          <ScrollManager />
          {/*
            This div used to carry its own `min-h-screen`, duplicating the
            min-height: 100vh already declared on #root in index.css. Two
            separately-sized "100vh" boxes nested inside each other is what
            caused the bug: rounding/scrollbar-width differences between
            them let #root's own cream background peek out past this div's
            bottom edge — showing up as a cream-colored patch right above
            the footer, plus an empty gap below the footer on short pages.

            Now #root (in index.css) is the single owner of page height
            via `display:flex; flex-direction:column; min-height:100vh`.
            This div just uses `flex-1` to stretch and exactly fill
            whatever #root gives it — no duplicate height claim, no seam.
          */}
          <div className="flex flex-1 flex-col">
            {!isAdmin && <Navbar />}

            <main className="flex-1">
              <Routes>
                {/* Public marketplace */}
                <Route path="/" element={<HomePage />} />
                <Route path="/brands" element={<BrandsPage />} />
                <Route path="/brand/:slug" element={<BrandProductPage />} />
                <Route path="/corporate" element={<CorporatePage />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedCustomerRoute>
                      <DashboardPage />
                    </ProtectedCustomerRoute>
                  }
                />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/contact" element={<ContactUs />} />
                <Route path="/terms" element={<TermsOfUse />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/faq" element={<FaqPage />} />
                <Route path="/offer-terms" element={<OfferTerms />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/how-it-works" element={<HowItWorksPage />} />
                <Route path="/careers" element={<CareersPage />} />


                {/* Admin */}
                <Route
                  path="/admin"
                  element={
                    <AdminAuthProvider>
                      <AdminLoginPage />
                    </AdminAuthProvider>
                  }
                />
                <Route
                  path="/admin/dashboard"
                  element={
                    <AdminAuthProvider>
                      <ProtectedAdminRoute>
                        <AdminDashboardPage />
                      </ProtectedAdminRoute>
                    </AdminAuthProvider>
                  }
                />

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </main>

            {!isAdmin && <Footer />}
          </div>
        </CartProvider>
      </CustomerAuthProvider>
    </ToastProvider>
  );
}
