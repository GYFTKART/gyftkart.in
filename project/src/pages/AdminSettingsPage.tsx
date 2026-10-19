import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Settings,
  CreditCard,
  QrCode,
  Wallet,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Info,
  ChevronRight,
  Key,
} from 'lucide-react';
import { AdminTopBar, AdminBackButton } from '@/components/AdminHeader';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';
import {
  getAdminPaymentSettings,
  saveAdminPaymentSettings,
  type PaymentGatewaySettings,
  DEFAULT_PAYMENT_SETTINGS,
} from '@/lib/paymentSettings';

export default function AdminSettingsPage() {
  const { admin } = useAdminAuth();
  const { push } = useToast();
  const [searchParams] = useSearchParams();
  const razorpayRef = useRef<HTMLFormElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [settings, setSettings] = useState<PaymentGatewaySettings>(DEFAULT_PAYMENT_SETTINGS);

  useEffect(() => {
    if (searchParams.get('gateway') === 'razorpay' && razorpayRef.current) {
      razorpayRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [searchParams, loading]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminPaymentSettings();
      setSettings(data);
    } catch (err) {
      console.error('Failed to load payment settings:', err);
      push('Failed to load payment settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saveAdminPaymentSettings(settings);
      if (res.success) {
        push('Payment gateway settings saved successfully.', 'success');
      } else {
        push(res.error || 'Failed to save settings', 'error');
      }
    } catch (err) {
      console.error('Save settings error:', err);
      push('Failed to save payment settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
            <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
              Admin
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 font-semibold">Payment Settings</span>
          </nav>
          <div className="flex items-center gap-3">
            <AdminBackButton />
          </div>
        </div>

        {/* Page Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center h-11 w-11 rounded-2xl bg-brand-600 text-white shadow-glow-sm">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-extrabold text-slate-900">
                Payment Gateways &amp; Methods
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure active customer checkout channels, UPI Direct verification, and Razorpay integration.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadSettings()}
              disabled={loading || saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Active Payment Gateways Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {/* 1. UPI Direct Card */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="grid place-items-center h-9 w-9 rounded-xl bg-emerald-50 text-emerald-700">
                <QrCode className="h-5 w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> ACTIVE · DEFAULT
              </span>
            </div>
            <h3 className="font-display text-sm font-bold text-slate-900">UPI Direct (QR &amp; UTR)</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Native bank transfer via dynamic QR code and 12-digit UTR verification. 0% gateway transaction fees.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">Customer Checkout:</span>
              <span className="font-bold text-emerald-700">Always Visible</span>
            </div>
          </div>

          {/* 2. Wallet Balance Card */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="grid place-items-center h-9 w-9 rounded-xl bg-purple-50 text-purple-700">
                <Wallet className="h-5 w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> ACTIVE
              </span>
            </div>
            <h3 className="font-display text-sm font-bold text-slate-900">GyftKart Wallet Balance</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Instant 1-click checkout deducting directly from customer's double-entry digital wallet balance.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">Customer Checkout:</span>
              <span className="font-bold text-emerald-700">Always Visible</span>
            </div>
          </div>

          {/* 3. Razorpay Card */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="grid place-items-center h-9 w-9 rounded-xl bg-blue-50 text-blue-700">
                <CreditCard className="h-5 w-5" />
              </div>
              {settings.razorpay_enabled ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> ACTIVE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                  <XCircle className="h-3 w-3 text-slate-400" /> DISABLED / INACTIVE
                </span>
              )}
            </div>
            <h3 className="font-display text-sm font-bold text-slate-900">Razorpay PG (Cards &amp; Netbanking)</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Third-party gateway for credit cards, debit cards, and netbanking. Disabled by default.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">Customer Checkout:</span>
              <span className={`font-bold ${settings.razorpay_enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                {settings.razorpay_enabled ? 'Visible to Customers' : 'Hidden from Checkout'}
              </span>
            </div>
          </div>
        </div>

        {/* Configuration Form Card */}
        <form
          ref={razorpayRef}
          id="razorpay"
          onSubmit={handleSave}
          className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-card mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-brand-600" />
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Razorpay Gateway Integration
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Configure API keys and toggle customer visibility for Razorpay payment processing.
              </p>
            </div>

            {/* Gateway Status Toggle */}
            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-800">Enable Razorpay</span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.razorpay_enabled}
                onClick={() => setSettings((s) => ({ ...s, razorpay_enabled: !s.razorpay_enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                  settings.razorpay_enabled ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    settings.razorpay_enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Notice Alert */}
          <div className={`mt-6 rounded-2xl p-4 flex items-start gap-3 text-xs leading-relaxed ${
            settings.razorpay_enabled
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}>
            {settings.razorpay_enabled ? (
              <>
                <Info className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                <div>
                  <p className="font-bold">Razorpay is currently ENABLED</p>
                  <p className="mt-0.5 text-emerald-700">
                    Customers will see Razorpay as an active option on Checkout alongside UPI Direct and Wallet Balance.
                  </p>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-bold">Razorpay is DISABLED / INACTIVE (Recommended Default)</p>
                  <p className="mt-0.5 text-amber-800">
                    Razorpay is completely hidden from the customer checkout page. Customers will strictly only see 
                    <strong> UPI Direct</strong> and <strong>GyftKart Wallet Balance</strong> as payment methods.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Credentials Inputs */}
          <div className="mt-6 space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Razorpay Key ID (`razorpay_key_id`)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.razorpay_key_id}
                  onChange={(e) => setSettings((s) => ({ ...s, razorpay_key_id: e.target.value }))}
                  placeholder="rzp_live_... or rzp_test_..."
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-mono text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Your public API key identifier issued by Razorpay Dashboard (e.g. `rzp_live_TQ77emdbsixP9W`).
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Razorpay Key Secret (`razorpay_key_secret`)
              </label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={settings.razorpay_key_secret || ''}
                  onChange={(e) => setSettings((s) => ({ ...s, razorpay_key_secret: e.target.value }))}
                  placeholder="••••••••••••••••••••••••••••••••"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pr-10 text-xs font-mono text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title={showSecret ? 'Hide secret' : 'Show secret'}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Confidential server secret used strictly by Supabase Edge Functions to verify payment signatures. Masked by default.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Razorpay Webhook Secret (`razorpay_webhook_secret`)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.razorpay_webhook_secret || ''}
                  onChange={(e) => setSettings((s) => ({ ...s, razorpay_webhook_secret: e.target.value }))}
                  placeholder="whsec_..."
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-mono text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Optional HMAC webhook signature secret configured in Razorpay Webhook alerts for order reconciliation.
              </p>
            </div>
          </div>

          {/* Form Actions */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Settings are securely encrypted and synchronized across portal sessions.</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" /> Save Configuration
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Purged Gateways Audit Card */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <Key className="h-4 w-4 text-slate-400" />
            <h3 className="font-display text-sm font-bold text-slate-900">Gateway Architecture &amp; Deprecations</h3>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/60 text-xs text-slate-600 space-y-2">
            <p className="flex items-center gap-1.5 font-semibold text-slate-800">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> "YouPI UPI" Gateway Purge Status:
            </p>
            <p className="text-slate-500 leading-relaxed pl-5">
              YouPI gateway modules, SDK files, edge functions, and database columns have been completely excised from the repository. Zero residual hooks, buttons, or database flags remain.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
