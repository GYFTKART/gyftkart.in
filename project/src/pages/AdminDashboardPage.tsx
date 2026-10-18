import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  IndianRupee,
  Gift,
  Users,
  Building2,
  ShoppingBag,
  Tag,
  Scale,
  Wallet,
  ArrowRight,
  RefreshCw,
  HelpCircle,
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

  // 6 Primary Category Hubs for the 2-step Drill-Down architecture
  const primaryCategories = [
    {
      id: 'customers',
      title: 'Customers',
      desc: 'Manage retail B2C users, corporate B2B clients, account status, and verification credentials.',
      icon: Users,
      accent: 'from-blue-600 to-indigo-700',
      badge: `${stats.customerCount} Accounts`,
      to: '/admin/customers-hub',
      subModuleCount: 2,
    },
    {
      id: 'brands',
      title: 'Brands',
      desc: 'Brand catalogue management, commission margins, gift card denominations, and availability controls.',
      icon: Tag,
      accent: 'from-brand-600 to-brand-800',
      badge: 'Brand Catalog',
      to: '/admin/brands-hub',
      subModuleCount: 1,
    },
    {
      id: 'accounting',
      title: 'Accounting & Ledgers',
      desc: 'Double-entry books, customer statement reconciliation, corporate tax ledgers, and platform P&L.',
      icon: Scale,
      accent: 'from-emerald-600 to-teal-700',
      badge: 'Ledger Suites',
      to: '/admin/accounting-hub',
      subModuleCount: 3,
    },
    {
      id: 'orders',
      title: 'Orders',
      desc: 'Gift card issuance records, delivery status, voucher codes, tracking IDs, and customer tax invoices.',
      icon: ShoppingBag,
      accent: 'from-fuchsia-600 to-purple-700',
      badge: `${stats.orderCount} Orders`,
      to: '/admin/orders-hub',
      subModuleCount: 1,
    },
    {
      id: 'inquiries',
      title: 'Inquiries',
      desc: 'Corporate bulk quote inquiries, customer helpdesk communications, and general support tickets.',
      icon: HelpCircle,
      accent: 'from-amber-500 to-amber-700',
      badge: `${stats.pendingInquiries} New Leads`,
      to: '/admin/inquiries-hub',
      subModuleCount: 2,
    },
    {
      id: 'payments',
      title: 'Payments & Gateways',
      desc: 'Direct UPI verification, digital wallet reserve management, and third-party payment gateway settings.',
      icon: Wallet,
      accent: 'from-violet-600 to-purple-800',
      badge: 'Gateways & Balances',
      to: '/admin/payments-hub',
      subModuleCount: 3,
    },
  ];


  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />

      <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Title & Refresh */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="font-display text-lg font-bold text-slate-900">
            Executive Overview
          </h1>

          <button
            onClick={() => loadKpis(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
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

        {/* 6 Category Hubs (Admin Modules) */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900">Admin Modules</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {primaryCategories.map((cat) => {
              const CatIcon = cat.icon;
              return (
                <Link
                  key={cat.id}
                  to={cat.to}
                  className="group flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-soft hover:shadow-card hover:border-brand-300 transition-all cursor-pointer"
                >
                  <div>
                    {/* Top Bar: Icon + Badge */}
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <span
                        className={`grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br ${cat.accent} text-white shadow-sm shrink-0 group-hover:scale-105 transition-transform`}
                      >
                        <CatIcon className="h-6 w-6" />
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                        {cat.badge}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-display text-lg font-bold text-slate-900 group-hover:text-brand-700 transition-colors">
                      {cat.title}
                    </h3>

                    {/* Description */}
                    <p className="text-xs text-slate-500 leading-relaxed mt-2">
                      {cat.desc}
                    </p>
                  </div>

                  {/* Bottom Action */}
                  <div className="pt-5 border-t border-slate-100 mt-6 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                      {cat.subModuleCount} {cat.subModuleCount === 1 ? 'Sub-module' : 'Sub-modules'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 group-hover:text-brand-700 group-hover:translate-x-1 transition-all">
                      Open Hub <ArrowRight className="h-3.5 w-3.5" />
                    </span>
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
