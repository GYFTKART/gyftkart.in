import { useEffect, useRef, type ReactNode } from 'react';
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


// Ensure the browser (not React) owns scroll restoration on hard reloads.
// This must run once, as early as possible, before the browser paints.
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'auto';
}

// Remembers the scroll position of every visited history entry (keyed by
// React Router's per-navigation `location.key`) so it can be restored when
// the user comes back to that entry via the browser's Back/Forward buttons.
// Module-level so it survives re-renders and persists for the whole tab
// session, the same way native browser scroll restoration would.
const scrollPositions = new Map<string, number>();

function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType(); // 'PUSH' | 'REPLACE' | 'POP'
  const isFirstRender = useRef(true);

  // Continuously record the scroll position for the *current* entry so that
  // whenever the user navigates away, we already know where they left off.
  useEffect(() => {
    const key = location.key;
    const handleScroll = () => {
      scrollPositions.set(key, window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.key]);

  useEffect(() => {
    // On the very first render — which covers both the initial app load
    // and a hard refresh of any route — skip scrolling. Forcing scroll
    // here would override the browser's native scroll restoration on
    // reload. We only want to manage scroll on genuine in-app navigations
    // that happen after the app has already mounted.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (navType === 'POP') {
      // Back/forward navigation: restore the scroll position this entry
      // had when the user left it (e.g. scrolled to the footer, clicked a
      // link, then hit Back).
      const saved = scrollPositions.get(location.key);
      window.scrollTo({ top: saved ?? 0, behavior: 'instant' as ScrollBehavior });
    } else {
      // Regular link navigation (PUSH) or a redirect (REPLACE): start the
      // new page at the top, same as before.
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
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
