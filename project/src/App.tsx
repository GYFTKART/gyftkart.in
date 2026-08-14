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

// Scrolls to `target` and keeps re-asserting it for a few animation frames.
// This is what makes restoration reliable (and jerk-free) even while the
// page's content is still loading and its height keeps changing under us —
// a single scrollTo call would otherwise get overridden by layout shifts.
function restoreScroll(target: number) {
  let attempts = 0;
  const maxAttempts = 10;

  const attempt = () => {
    window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
    attempts += 1;
    const settled = Math.abs(window.scrollY - target) < 2;
    if (!settled && attempts < maxAttempts) {
      requestAnimationFrame(attempt);
    }
  };

  requestAnimationFrame(attempt);
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
          {!isAdmin && <Navbar />}

          <main className="min-h-screen">
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
        </CartProvider>
      </CustomerAuthProvider>
    </ToastProvider>
  );
}
