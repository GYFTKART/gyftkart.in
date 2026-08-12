import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, User, Eye, EyeOff, ShieldCheck, ArrowRight, ArrowLeft, Gift } from 'lucide-react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';

export default function AdminLoginPage() {
  const { login } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      push('Enter your email and password', 'error');
      return;
    }
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.ok) {
      push('Welcome back, admin', 'success');
      navigate('/admin/dashboard', { replace: true });
    } else {
      push(res.error ?? 'Login failed', 'error');
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left visual panel */}
      <div className="relative hidden lg:flex flex-col justify-between bg-brand-950 text-white p-12 overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-[0.08] pointer-events-none" />
        <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-brand-600/40 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -right-20 h-96 w-96 rounded-full bg-gold-400/20 blur-3xl pointer-events-none" />

        <Link to="/" className="relative flex items-center gap-2.5 w-fit">
          <span className="grid place-items-center h-10 w-10 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white">
            <Gift className="h-5 w-5" />
          </span>
          <span className="font-display text-xl font-extrabold">
            Gyft<span className="text-gradient">Kart</span>
          </span>
        </Link>

        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-brand-200 border border-white/10">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin Console
          </span>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight">
            Run your marketplace,<br />one dashboard away.
          </h1>
          <p className="mt-4 text-brand-100 max-w-md leading-relaxed">
            Track gift card sales, review corporate inquiries and manage your
            marketplace — all from a single secure admin panel.
          </p>

          <div className="mt-10 space-y-3">
            {[
              'Real-time sales analytics',
              'Corporate inquiry pipeline',
              'Customer & order management',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-brand-100">
                <span className="grid place-items-center h-6 w-6 rounded-full bg-white/15">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-brand-300">
          © {new Date().getFullYear()} GyftKart Technologies. Authorized access only.
        </p>
      </div>

      {/* Right login form */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-gradient-to-b from-brand-50/40 to-white">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-700 mb-8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to site
          </Link>

          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <span className="grid place-items-center h-10 w-10 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white">
              <Gift className="h-5 w-5" />
            </span>
            <span className="font-display text-xl font-extrabold text-slate-900">
              Gyft<span className="text-gradient">Kart</span>
            </span>
          </div>

          <h2 className="font-display text-3xl font-extrabold text-slate-900">Admin sign in</h2>
          <p className="mt-2 text-sm text-slate-500">
            Enter your credentials to access the GyftKart admin console.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="block text-sm font-bold text-slate-800 mb-2">Email</span>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="gyftkart@gmail.com"
                  autoComplete="username"
                  className="w-full rounded-2xl border-2 border-slate-200 bg-white pl-11 pr-4 py-3.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors"
                />
              </div>
            </label>

            <label className="block">
              <span className="block text-sm font-bold text-slate-800 mb-2">Password</span>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border-2 border-slate-200 bg-white pl-11 pr-12 py-3.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-4 text-sm font-bold text-white hover:shadow-glow transition-shadow disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in to console <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-xs text-slate-600">
            <p className="font-bold text-brand-700 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Official credentials
            </p>
            <p className="mt-1.5">
              Email: <span className="font-mono font-bold text-slate-800">gyftkart@gmail.com</span>
              <br />
              Password: <span className="font-mono font-bold text-slate-800">sA@9450257575</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
