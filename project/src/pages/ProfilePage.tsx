import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Info,
  ArrowLeft,
  Save,
} from 'lucide-react';
import { useAuth } from '@/context/CustomerAuthContext';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { session, updateProfile } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync the form fields from the real logged-in session whenever it
  // changes (login, logout, or a profile update elsewhere). This is what
  // was broken before: the old version read from a local mock
  // ("gyftkart_users") that nothing ever wrote to, so fields stayed
  // blank even while the person was genuinely logged in.
  useEffect(() => {
    if (session) {
      setName(session.name);
      setEmail(session.email);
      setMobile(session.phone);
    } else {
      setName('');
      setEmail('');
      setMobile('');
    }
    setPassword('');
    setFormError('');
    setSuccessMsg('');
  }, [session]);

  // Auto-dismiss the success banner
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4500);
    return () => clearTimeout(t);
  }, [successMsg]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedMobile = mobile.trim();

    if (!trimmedName || !trimmedEmail) {
      setFormError('Name and email cannot be empty.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (trimmedMobile && !/^[0-9+\-\s]{7,15}$/.test(trimmedMobile)) {
      setFormError('Please enter a valid mobile number.');
      return;
    }
    if (password && password.length < 6) {
      setFormError('New password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    const result = await updateProfile({
      name: trimmedName,
      phone: trimmedMobile,
      email: trimmedEmail,
      password: password || undefined,
    });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error ?? 'Something went wrong. Please try again.');
      return;
    }

    setPassword('');
    setSuccessMsg(
      result.needsEmailConfirmation
        ? 'Profile updated! Check your new email inbox to confirm the address change.'
        : 'Profile updated successfully!'
    );
  };

  if (!session) {
    return (
      <div className="pt-32 pb-16 px-4 flex items-start justify-center bg-gradient-to-b from-brand-50/40 to-transparent">
        <div className="w-full max-w-md rounded-3xl bg-white shadow-card border border-slate-100 p-8 text-center">
          <span className="mx-auto mb-4 grid place-items-center h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm">
            <User className="h-6 w-6" />
          </span>
          <h1 className="font-display text-xl font-extrabold text-slate-900 mb-2">
            You're not logged in
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            Please log in to view and manage your account details.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-3 text-sm font-semibold text-white shadow-glow-sm hover:shadow-glow transition-shadow"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-16 px-4 bg-gradient-to-b from-brand-50/40 to-transparent">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="rounded-3xl bg-white shadow-card border border-slate-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-600 to-brand-800 px-6 sm:px-8 py-8 text-white">
            <div className="flex items-center gap-4">
              <span className="grid place-items-center h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm text-white text-lg font-bold uppercase ring-2 ring-white/30">
                {name.slice(0, 1) || <User className="h-6 w-6" />}
              </span>
              <div>
                <h1 className="font-display text-2xl font-extrabold tracking-tight">
                  My Account
                </h1>
                <p className="text-sm text-white/80">
                  Manage your personal details and login credentials.
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleUpdate} className="p-6 sm:p-8 grid gap-5">
            {successMsg && (
              <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700 animate-pop">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {successMsg}
              </div>
            )}
            {formError && (
              <div className="flex items-start gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {formError}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-5">
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Full name
                </label>
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
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Mobile number
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Email address
              </label>
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
              {email.trim().toLowerCase() !== session.email && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 mt-0.5">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Changing your email will require confirming the new address before it takes effect.
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                New password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep your current password"
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
              <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Your account is managed securely — only enter a new password here if you want to change it.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-3.5 text-sm font-semibold text-white shadow-glow-sm hover:shadow-glow transition-shadow sm:w-fit disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              {submitting ? 'Saving…' : 'Update Profile'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
