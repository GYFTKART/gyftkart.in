import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  IndianRupee,
  Gift,
  Users,
  Building2,
  ShoppingBag,
  Tag,
  Banknote,
  Scale,
  Wallet,
  ArrowRight,
  RefreshCw,
  LayoutDashboard,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';
import { inrDecimal } from '@/lib/format';
import { AdminTopBar } from '@/components/AdminHeader';

export default function AdminDashboardPage() {
  const { admin } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // High-level KPI states
  const [stats, setStats] = useState({
    totalRevenue: 0,
    orderCount: 0,
    totalCards: 0,
    customerCount: 0,
    pendingInquiries: 0,
  });

  // Handle legacy ?tab= query parameter redirects
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'sales') {
      navigate('/admin/gift-card-sales', { replace: true });
    } else if (t === 'inquiries') {
      navigate('/admin/corporate-inquiries', { replace: true });
    } else if (t === 'brands') {
      navigate('/admin/brands', { replace: true });
    } else if (t === 'customers') {
      navigate('/admin/customers', { replace: true });
    } else if (t === 'payments') {
      navigate('/admin/upi-direct', { replace: true });
    } else if (t === 'ledger') {
      navigate('/admin/company-ledger', { replace: true });
    }
  }, [searchParams, navigate]);

  const loadKpis = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [purchasesRes, inquiriesRes, profilesRes] = await Promise.all([
        supabase.from('purchases').select('amount, quantity, recipient_email'),
        supabase.from('corporate_inquiries').select('id, status'),
        supabase.from('profiles').select('id, email'),
      ]);

      if (purchasesRes.error) throw purchasesRes.error;
      if (inquiriesRes.error) throw inquiriesRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const purchases = purchasesRes.data ?? [];
      const inquiries = inquiriesRes.data ?? [];
      const profiles = profilesRes.data ?? [];

      const totalRevenue = purchases.reduce(
        (sum, p) => sum + Number(p.amount || 0) * (p.quantity || 1),
        0
      );
      const totalCards = purchases.reduce((sum, p) => sum + (p.quantity || 1), 0);
      const orderCount = purchases.length;

      // Unique customer accounts (profiles + distinct recipient emails)
      const customerEmails = new Set<string>();
      profiles.forEach((pf) => {
        if (pf.email) customerEmails.add(pf.email.trim().toLowerCase());
      });
      purchases.forEach((p) => {
        if (p.recipient_email) customerEmails.add(p.recipient_email.trim().toLowerCase());
      });

      const pendingInquiries = inquiries.filter(
        (i) => (i.status || '').toLowerCase() === 'new'
      ).length;

      setStats({
        totalRevenue,
        orderCount,
        totalCards,
        customerCount: customerEmails.size || profiles.length,
        pendingInquiries,
      });

      if (isRefresh) push('Dashboard KPIs refreshed', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to load dashboard metrics', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [push]);

  useEffect(() => {
    if (!admin) {
      navigate('/admin', { replace: true });
      return;
    }
    loadKpis();
  }, [admin, navigate, loadKpis]);

  if (!admin) return null;

  const quickNavCards = [
    {
      title: 'Customers',
      desc: 'Oversee B2C and B2B user accounts, verification flags, security blocks/suspensions, and password resets.',
      to: '/admin/customers',
      icon: Users,
      accent: 'from-blue-600 to-indigo-700',
      badge: `${stats.customerCount} Accounts`,
    },
    {
      title: 'Gift Card Sales',
      desc: 'Browse all issued gift cards, voucher codes, recipient details, and GST tax invoices.',
      to: '/admin/gift-card-sales',
      icon: ShoppingBag,
      accent: 'from-fuchsia-600 to-purple-700',
      badge: `${stats.orderCount} Orders`,
    },
    {
      title: 'Manage Brands',
      desc: 'Add, update, or reorganize brand catalogs, commission discounts, and denomination values.',
      to: '/admin/brands',
      icon: Tag,
      accent: 'from-brand-600 to-brand-800',
      badge: 'Brand Catalog',
    },
    {
      title: 'Corporate Inquiries',
      desc: 'Track B2B corporate bulk gifting inquiries, company budgets, and lead follow-up status.',
      to: '/admin/corporate-inquiries',
      icon: Building2,
      accent: 'from-amber-500 to-gold-600',
      badge: `${stats.pendingInquiries} New Leads`,
    },
    {
      title: 'Customer Ledger',
      desc: 'Audit individual customer balances, double-entry ledgers, and statement accounting records.',
      to: '/admin/customer-ledger',
      icon: Banknote,
      accent: 'from-emerald-600 to-teal-700',
      badge: `${stats.customerCount} Customers`,
    },
    {
      title: 'B2B Customers',
      desc: 'Provision corporate accounts, maintain GSTIN/PAN records, and manage enterprise credit lines.',
      to: '/admin/b2b-customers',
      icon: Users,
      accent: 'from-brand-600 to-indigo-700',
      badge: 'B2B Accounts',
    },
    {
      title: 'B2B Ledger',
      desc: 'Corporate accounting, double-entry client ledger statements, and GSTR-1 compliant CSV returns.',
      to: '/admin/b2b-ledger',
      icon: Building2,
      accent: 'from-amber-600 to-orange-700',
      badge: 'GSTR-1 Ready',
    },
    {
      title: 'Company Ledger',
      desc: 'View double-entry company books, platform cash inflows, outflows, and accounting vouchers.',
      to: '/admin/company-ledger',
      icon: Scale,
      accent: 'from-blue-600 to-indigo-700',
      badge: 'Financial Audit',
    },
    {
      title: 'UPI Direct',
      desc: 'Review, approve, or reject manual UPI transactions, UTR submissions, and wallet top-ups.',
      to: '/admin/upi-direct',
      icon: Wallet,
      accent: 'from-violet-600 to-purple-800',
      badge: 'Payment Sessions',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Title & Refresh */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-brand-50 text-brand-700 border border-brand-100 shadow-sm">
                <LayoutDashboard className="h-5 w-5" />
              </span>
              Executive Overview
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              High-level real-time KPI overview and direct access to dedicated management modules.
            </p>
          </div>

          <button
            onClick={() => loadKpis(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 self-start md:self-auto rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-brand-600 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>

        {/* 4 High-Level KPI Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {/* Revenue */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-soft hover:shadow-card transition-shadow">
            <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-brand-100/40 blur-2xl pointer-events-none" />
            <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm">
              <IndianRupee className="h-5 w-5" />
            </span>
            <p className="mt-4 text-xs text-slate-500 font-medium">Total Revenue</p>
            <p className="font-display text-2xl font-extrabold text-slate-900">
              {loading ? '…' : inrDecimal(stats.totalRevenue)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{stats.orderCount} total orders</p>
          </div>

          {/* Orders */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-soft hover:shadow-card transition-shadow">
            <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-purple-100/40 blur-2xl pointer-events-none" />
            <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-700 text-white shadow-glow-sm">
              <Gift className="h-5 w-5" />
            </span>
            <p className="mt-4 text-xs text-slate-500 font-medium">Gift Cards Sold</p>
            <p className="font-display text-2xl font-extrabold text-slate-900">
              {loading ? '…' : String(stats.totalCards)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Across all brands</p>
          </div>

          {/* Active Customers */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-soft hover:shadow-card transition-shadow">
            <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-emerald-100/40 blur-2xl pointer-events-none" />
            <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-glow-sm">
              <Users className="h-5 w-5" />
            </span>
            <p className="mt-4 text-xs text-slate-500 font-medium">Active Customers</p>
            <p className="font-display text-2xl font-extrabold text-slate-900">
              {loading ? '…' : String(stats.customerCount)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Registered &amp; guest users</p>
          </div>

          {/* Pending Inquiries */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-soft hover:shadow-card transition-shadow">
            <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-amber-100/40 blur-2xl pointer-events-none" />
            <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-400 to-gold-600 text-white shadow-glow-sm">
              <Building2 className="h-5 w-5" />
            </span>
            <p className="mt-4 text-xs text-slate-500 font-medium">Pending Inquiries</p>
            <p className="font-display text-2xl font-extrabold text-slate-900">
              {loading ? '…' : String(stats.pendingInquiries)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Awaiting corporate contact</p>
          </div>
        </div>

        {/* Dedicated Admin Modules Navigation Grid */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Admin Modules</h2>
              <p className="text-xs text-slate-500">
                Direct access to standalone management portals and financial accounting suites.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {quickNavCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.to}
                  to={card.to}
                  className="group relative rounded-3xl border border-slate-100 bg-white p-6 shadow-soft hover:shadow-card hover:border-brand-200 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <span
                        className={`grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br ${card.accent} text-white shadow-sm`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 group-hover:bg-brand-50 group-hover:text-brand-700 transition-colors">
                        {card.badge}
                      </span>
                    </div>

                    <h3 className="font-display text-base font-bold text-slate-900 group-hover:text-brand-700 transition-colors">
                      {card.title}
                    </h3>
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                      {card.desc}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-50 flex items-center justify-between text-xs font-bold text-brand-600 group-hover:text-brand-700">
                    <span>Open Module</span>
                    <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
