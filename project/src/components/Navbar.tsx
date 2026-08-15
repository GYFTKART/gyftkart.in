import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Gift,
  Search,
  ShoppingBag,
  Menu,
  X,
  Sparkles,
  Building2,
  LayoutDashboard,
  User,
  Mail,
  Lock,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  LogOut,
  UserCircle,
  Package,
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/CustomerAuthContext';

const navLinks = [
  { to: '/brands', label: 'Brands' },
  { to: '/corporate', label: 'Corporate' },
];

const navIcons: Record<string, typeof Gift> = {
  '/brands': Search,
  '/corporate': Building2,
};

type AuthMode = 'login' | 'signup' | 'forgot';

export default function Navbar() {
  const { count } = useCart();
  const { session, login, signup, logout, requestPasswordReset } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Search icon toggle — MOBILE ONLY. Desktop already shows the full
  // search input inline in the header (below), so we don't duplicate it
  // with an icon there. This button (and the expanding bar it opens)
  // carries the class `md:hidden` so it never renders at the `md`
  // breakpoint and up — the desktop header stays exactly as it was.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auth modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Login / Signup form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // Forgot password fields
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // useLayoutEffect (not useEffect) is deliberate here. ScrollManager (in
  // App.tsx) restores the page's scroll position from a layout effect too,
  // and — because it's declared earlier in the tree — its layout effect
  // fires first. By reading window.scrollY in a layout effect ourselves,
  // we pick up that already-restored position and compute the correct
  // `scrolled` value before the browser's first paint. With a plain
  // useEffect, the header would paint once in its transparent (unscrolled)
  // state, then flip to the glass/blurred state a frame later once this
  // effect finally ran — a visible pop-in on any refresh that lands you
  // partway down a page.
  useLayoutEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  useEffect(() => {
    document.body.style.overflow = showLoginModal ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [showLoginModal]);

  // Auto-dismiss the success toast after a few seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Close the user dropdown when clicking outside of it
  useEffect(() => {
    if (!userMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [userMenuOpen]);

  // Focus the mobile search input the moment the bar opens, and close on
  // outside click or Escape — same pattern as the account dropdown.
  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();

    const onClickOutside = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [searchOpen]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/brands?q=${encodeURIComponent(search.trim())}`);
    setMobileOpen(false);
    setSearchOpen(false);
  };

  const resetFormState = () => {
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setShowPassword(false);
    setFormError('');
    setForgotEmail('');
    setForgotSent(false);
  };

  const openLogin = () => {
    resetFormState();
    setAuthMode('login');
    setShowLoginModal(true);
    setMobileOpen(false);
  };

  const openSignup = () => {
    resetFormState();
    setAuthMode('signup');
    setShowLoginModal(true);
    setMobileOpen(false);
  };

  const closeModal = () => {
    setShowLoginModal(false);
    resetFormState();
  };

  const switchMode = (mode: AuthMode) => {
    setFormError('');
    setShowPassword(false);
    setForgotSent(false);
    setAuthMode(mode);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPhone || !password) {
      setFormError('Please fill in all fields.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (!/^[0-9+\-\s]{7,15}$/.test(trimmedPhone)) {
      setFormError('Please enter a valid phone number.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    const result = await signup(trimmedName, trimmedEmail, trimmedPhone, password);
    if (!result.ok) {
      setFormError(result.error ?? 'Something went wrong. Please try again.');
      return;
    }

    setToast(
      result.needsEmailConfirmation
        ? 'Account created! Check your email to confirm it, then log in.'
        : 'Account created! Please log in to continue.'
    );
    setEmail(trimmedEmail);
    setName('');
    setPhone('');
    setPassword('');
    setShowPassword(false);
    setAuthMode('login');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setFormError('Please enter your email and password.');
      return;
    }

    const result = await login(trimmedEmail, password);
    if (!result.ok) {
      setFormError(result.error ?? 'Incorrect email or password.');
      return;
    }

    setToast(`Welcome back, ${(result.name ?? '').split(' ')[0]}!`);
    setShowLoginModal(false);
    resetFormState();
    // User stays on the current page — no forced redirect.
  };

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    setToast('You have been logged out.');
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedEmail = forgotEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      setFormError('Please enter your email address.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    // Simulated recovery flow — no real email is sent.
    await requestPasswordReset(trimmedEmail);
    setForgotSent(true);
  };

  const goToDashboard = () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    navigate('/dashboard');
  };

  const goToProfile = () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    navigate('/profile');
  };

  const goToOrders = () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    navigate('/orders');
  };

  const firstName = session?.name?.split(' ')[0] ?? '';

  return (
    <header
      className={`fixed top-0 inset-x-0 z-[100] transition-all duration-300 ${
        scrolled ? 'glass shadow-soft border-b border-slate-100/70' : 'bg-transparent'
      }`}
    >
      {/* Success toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-y-0 -translate-x-1/2 z-[999] flex items-center justify-center bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-xl space-x-2 animate-bounce-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="text-sm font-semibold whitespace-nowrap">{toast}</span>
        </div>
      )}

      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center shrink-0" onClick={() => setMobileOpen(false)}>
            <span className="font-display text-xl font-extrabold tracking-tight text-[#F26722]">
              GyftKart
            </span>
          </Link>

          {/* Search (desktop) — unchanged, always visible from md up.
              This is the ONLY search entry point on desktop; no icon is
              added next to the cart there. */}
          <form
            onSubmit={submitSearch}
            className="hidden md:flex items-center flex-1 max-w-2xl relative ml-2"
          >
            <Search className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brands…"
              className="w-full rounded-full border border-gray-300 bg-transparent pl-11 pr-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition"
            />
          </form>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-1 shrink-0">
            {navLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `relative px-4 py-2 text-sm font-semibold rounded-full transition-colors ${
                    isActive
                      ? 'text-brand-700'
                      : 'text-slate-600 hover:text-slate-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {l.label}
                    {isActive && (
                      <span className="absolute inset-0 -z-10 rounded-full bg-brand-100/80" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1.5">
            {session ? (
              <div className="relative hidden sm:block" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 pl-2 pr-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                  aria-label="Account menu"
                  aria-expanded={userMenuOpen}
                >
                  <span className="grid place-items-center h-7 w-7 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 text-xs font-bold uppercase">
                    {firstName.slice(0, 1) || <User className="h-4 w-4" />}
                  </span>
                  Hi, {firstName}
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                      userMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-card animate-pop">
                    <button
                      onClick={goToDashboard}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </button>
                    <button
                      onClick={goToProfile}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <UserCircle className="h-4 w-4" />
                      Profile
                    </button>
                    <button
                      onClick={goToOrders}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Package className="h-4 w-4" />
                      Orders
                    </button>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={openLogin}
                className="hidden sm:inline-flex items-center gap-2 rounded-full border border-gray-300 bg-transparent pl-2 pr-4 py-1.5 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                aria-label="Login or sign up"
              >
                <span className="grid place-items-center h-7 w-7 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700">
                  <User className="h-4 w-4" />
                </span>
                Login
              </button>
            )}

            {/* Search icon — MOBILE / TABLET ONLY (md:hidden). Sits right
                next to the cart icon. Desktop (md and up) relies solely
                on the inline search bar above and never shows this. */}
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className={`md:hidden grid place-items-center h-10 w-10 rounded-full transition-colors ${
                searchOpen
                  ? 'bg-brand-50 text-brand-700'
                  : 'hover:bg-brand-50 text-slate-700 hover:text-brand-700'
              }`}
              aria-label={searchOpen ? 'Close search' : 'Search'}
              aria-expanded={searchOpen}
            >
              {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </button>

            <button
              onClick={() => navigate('/cart')}
              className="relative grid place-items-center h-10 w-10 rounded-full hover:bg-brand-50 text-slate-700 hover:text-brand-700 transition-colors"
              aria-label="Go to cart"
            >
              <ShoppingBag className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid place-items-center h-5 min-w-[20px] px-1 rounded-full bg-brand-600 text-white text-[11px] font-bold ring-2 ring-white animate-pop">
                  {count}
                </span>
              )}
            </button>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden grid place-items-center h-10 w-10 rounded-full hover:bg-brand-50 text-slate-700 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Expanding mobile search bar — toggled by the search icon above.
          md:hidden so it can never appear on desktop, matching the icon
          that opens it. Collapsed to max-h-0 so it animates open/closed
          rather than popping in. */}
      <div
        ref={searchWrapRef}
        aria-hidden={!searchOpen}
        className={`md:hidden overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
          searchOpen
            ? 'max-h-24 opacity-100 border-t border-slate-100/70'
            : 'max-h-0 opacity-0 border-t-0'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <form onSubmit={submitSearch} className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              ref={searchInputRef}
              tabIndex={searchOpen ? 0 : -1}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brands…"
              className="w-full rounded-full border border-gray-300 bg-white pl-11 pr-11 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition"
            />
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              tabIndex={searchOpen ? 0 : -1}
              className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center h-6 w-6 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Close search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`lg:hidden overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
          mobileOpen ? 'max-h-[560px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="mx-4 mb-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-card">
          <div className="grid gap-1">
            {navLinks.map((l) => {
              const Icon = navIcons[l.to];
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {l.label}
                </NavLink>
              );
            })}
          </div>

          {/* Login / Signup (mobile) */}
          {session ? (
            <div className="mt-3 rounded-2xl border border-slate-100 p-3">
              <div className="flex items-center gap-2.5 px-1 pb-2 mb-1 border-b border-slate-100">
                <span className="grid place-items-center h-8 w-8 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 text-xs font-bold uppercase">
                  {firstName.slice(0, 1) || <User className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">Hi, {firstName}</p>
                  <p className="text-xs text-slate-500 truncate">{session.email}</p>
                </div>
              </div>
              <button
                onClick={goToDashboard}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </button>
              <button
                onClick={goToProfile}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <UserCircle className="h-4 w-4" />
                Profile
              </button>
              <button
                onClick={goToOrders}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Package className="h-4 w-4" />
                Orders
              </button>
              <button
                onClick={() => {
                  handleLogout();
                  setMobileOpen(false);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={openLogin}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-colors"
              >
                <User className="h-4 w-4" />
                Login
              </button>
              <button
                onClick={openSignup}
                className="flex items-center justify-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                Sign up
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Login / Signup / Forgot password modal */}
      {showLoginModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-md rounded-3xl bg-white shadow-card p-6 sm:p-8 animate-pop">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 grid place-items-center h-9 w-9 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>

            {/* ---------- FORGOT PASSWORD VIEW ---------- */}
            {authMode === 'forgot' ? (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm">
                    <Lock className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-display text-xl font-extrabold text-slate-900">
                      Reset your password
                    </h2>
                    <p className="text-sm text-slate-500">
                      {forgotSent
                        ? 'Check your inbox for next steps.'
                        : "We'll send you recovery instructions."}
                    </p>
                  </div>
                </div>

                {forgotSent ? (
                  <div className="grid gap-4">
                    <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        If an account exists for <strong>{forgotEmail.trim()}</strong>, we've
                        sent a (simulated) password recovery link.
                      </span>
                    </div>
                    <button
                      onClick={() => switchMode('login')}
                      className="flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-glow-sm hover:shadow-glow transition-shadow"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to login
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} className="grid gap-3">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="Email address"
                        className="w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition"
                      />
                    </div>

                    {formError && (
                      <div className="flex items-start gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-2.5 text-sm text-red-600">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        {formError}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="mt-1 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-glow-sm hover:shadow-glow transition-shadow"
                    >
                      Send recovery link
                      <ArrowRight className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back to login
                    </button>
                  </form>
                )}
              </>
            ) : (
              <>
                {/* ---------- LOGIN / SIGNUP VIEW ---------- */}
                <div className="flex items-center gap-3 mb-6">
                  <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm">
                    <User className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-display text-xl font-extrabold text-slate-900">
                      {authMode === 'signup' ? 'Create your account' : 'Welcome back'}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {authMode === 'signup'
                        ? 'Join GyftKart to send gifts in seconds.'
                        : 'Login to manage your gifts.'}
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={authMode === 'signup' ? handleSignup : handleLogin}
                  className="grid gap-3"
                >
                  {authMode === 'signup' && (
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Full name"
                        className="w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition"
                      />
                    </div>
                  )}
                  {authMode === 'signup' && (
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Phone number"
                        className="w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition"
                      />
                    </div>
                  )}
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-11 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-600 transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {authMode === 'login' && (
                    <div className="flex justify-end -mt-1">
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs font-semibold text-brand-700 hover:text-brand-800"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {formError && (
                    <div className="flex items-start gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-2.5 text-sm text-red-600">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      {formError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="mt-1 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-glow-sm hover:shadow-glow transition-shadow"
                  >
                    {authMode === 'signup' ? 'Create account' : 'Login'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>

                <p className="mt-5 text-center text-sm text-slate-500">
                  {authMode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button
                    onClick={() => switchMode(authMode === 'signup' ? 'login' : 'signup')}
                    className="font-semibold text-brand-700 hover:text-brand-800"
                  >
                    {authMode === 'signup' ? 'Login' : 'Sign up'}
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
