import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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
  HelpCircle,
  CreditCard,
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

  // 6 Primary Module Hubs according to specification
  const primaryModuleHubs = [
    {
      id: 'customers',
      title: 'Customers',
      desc: 'Manage retail B2C users, corporate B2B clients, verification, and access controls.',
      icon: Users,
      accent: 'from-blue-600 to-indigo-700',
      badge: `${stats.customerCount} Accounts`,
      subModules: [
        {
          name: 'B2C Customers',
          desc: 'Retail accounts, block/unblock, password reset',
          to: '/admin/customers',
          icon: Users,
        },
        {
          name: 'B2B Customers',
          desc: 'Corporate accounts, manual onboarding, GSTIN/PAN records',
          to: '/admin/b2b-customers',
          icon: Building2,
        },
      ],
    },
    {
      id: 'brands',
      title: 'Brands',
      desc: 'Brand catalogue management, margins, denominations, and availability.',
      icon: Tag,
      accent: 'from-brand-600 to-brand-800',
      badge: 'Brand Catalog',
      subModules: [
        {
          name: 'Manage Brands',
          desc: 'Catalogue management, margin tiers, denominations & availability',
          to: '/admin/brands',
          icon: Tag,
        },
      ],
    },
    {
      id: 'accounting',
      title: 'Accounting & Ledgers',
      desc: 'Double-entry books, customer statement reconciliation, and financial audit logs.',
      icon: Scale,
      accent: 'from-emerald-600 to-teal-700',
      badge: 'Ledger Suites',
      subModules: [
        {
          name: 'Customer Ledger',
          desc: 'B2C user ledger statements & wallet audit',
          to: '/admin/customer-ledger',
          icon: Banknote,
        },
        {
          name: 'B2B Ledger',
          desc: 'Corporate client accounts & GST statements',
          to: '/admin/b2b-ledger',
          icon: Building2,
        },
        {
          name: 'Company Ledger',
          desc: 'Platform P&L, sales revenue, and payouts',
          to: '/admin/company-ledger',
          icon: Scale,
        },
      ],
    },
    {
      id: 'orders',
      title: 'Orders',
      desc: 'Gift card issuance records, delivery status, voucher codes, and invoices.',
      icon: ShoppingBag,
      accent: 'from-fuchsia-600 to-purple-700',
      badge: `${stats.orderCount} Orders`,
      subModules: [
        {
          name: 'Gift Card Sales',
          desc: 'Gift card issuance records, delivery status, voucher codes, and invoices',
          to: '/admin/gift-card-sales',
          icon: ShoppingBag,
        },
      ],
    },
    {
      id: 'inquiries',
      title: 'Inquiries',
      desc: 'Customer communications, corporate bulk quote requests, and support tickets.',
      icon: HelpCircle,
      accent: 'from-amber-500 to-amber-700',
      badge: `${stats.pendingInquiries} New Leads`,
      subModules: [
        {
          name: 'Corporate Inquiries',
          desc: 'Corporate communications, corporate bulk quote requests',
          to: '/admin/corporate-inquiries',
          icon: Building2,
        },
        {
          name: 'General Enquiries',
          desc: 'Customer communications, support desk & ticket resolution',
          to: '/admin/general-inquiries',
          icon: HelpCircle,
        },
      ],
    },
    {
      id: 'payments',
      title: 'Payments & Gateways',
      desc: 'Manage gateway integrations, direct UPI verification, and wallet balances.',
      icon: Wallet,
      accent: 'from-violet-600 to-purple-800',
      badge: 'Gateways & Balances',
      subModules: [
        {
          name: 'UPI Direct',
          desc: 'Direct QR / UTR verification flow & payment approvals',
          to: '/admin/upi-direct',
          icon: Wallet,
        },
        {
          name: 'GyftKart Wallet',
          desc: 'Wallet management, aggregate liabilities & balance compliance',
          to: '/admin/wallet-management',
          icon: Banknote,
        },
        {
          name: 'Razorpay',
          desc: 'Card, Netbanking, webhook credentials & gateway status',
          to: '/admin/payment-settings?gateway=razorpay',
          icon: CreditCard,
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />

      <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Title & Refresh */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-brand-50 text-brand-700 border border-brand-100 shadow-sm">
                <LayoutDashboard className="h-5 w-5" />
              </span>
              Executive Overview
            </h1>
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

        {/* 6 Category Hubs (Admin Modules) */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900">Admin Modules</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {primaryModuleHubs.map((hub) => {
              const HubIcon = hub.icon;
              return (
                <div
                  key={hub.id}
                  className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-soft hover:shadow-card transition-all"
                >
                  <div>
                    {/* Hub Top Bar */}
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br ${hub.accent} text-white shadow-sm shrink-0`}
                        >
                          <HubIcon className="h-5 w-5" />
                        </span>
                        <div>
                          <h3 className="font-display text-base font-bold text-slate-900 tracking-tight">
                            {hub.title}
                          </h3>
                          <span className="text-[11px] font-semibold text-slate-400">
                            {hub.subModules.length} {hub.subModules.length === 1 ? 'Sub-module' : 'Sub-modules'}
                          </span>
                        </div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                        {hub.badge}
                      </span>
                    </div>

                    {/* Hub Description */}
                    <p className="text-xs text-slate-500 leading-relaxed mb-5">
                      {hub.desc}
                    </p>

                    {/* Sub-cards Container */}
                    <div className="space-y-2.5">
                      {hub.subModules.map((sub) => {
                        const SubIcon = sub.icon;
                        return (
                          <Link
                            key={sub.to}
                            to={sub.to}
                            className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-brand-300 hover:shadow-sm px-3.5 py-3 transition-all"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="grid place-items-center h-8 w-8 rounded-xl bg-white border border-slate-200/60 text-slate-600 group-hover:text-brand-600 group-hover:border-brand-200 transition-colors shrink-0">
                                <SubIcon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 group-hover:text-brand-700 transition-colors truncate">
                                  {sub.name}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {sub.desc}
                                </p>
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-1 transition-all shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
