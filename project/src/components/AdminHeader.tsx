import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  ShoppingBag,
  Building2,
  Tag,
  Banknote,
  Wallet,
  Scale,
  Users,
  Settings,
} from 'lucide-react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';

export type AdminTabId = 'overview' | 'sales' | 'inquiries' | 'brands' | 'customers';

export function AdminTopBar() {
  const { admin, logout } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    push('Signed out of admin console', 'info');
    navigate('/admin', { replace: true });
  };

  if (!admin) return null;

  const pathname = location.pathname;

  const navItems = [
    {
      to: '/admin/dashboard',
      label: 'Overview / Dashboard',
      icon: LayoutDashboard,
      isActive: pathname === '/admin/dashboard' || pathname === '/admin',
    },
    {
      to: '/admin/customers',
      label: 'B2C Customers',
      icon: Users,
      isActive: pathname.startsWith('/admin/customers'),
    },
    {
      to: '/admin/gift-card-sales',
      label: 'Gift Card Sales',
      icon: ShoppingBag,
      isActive: pathname.startsWith('/admin/gift-card-sales'),
    },
    {
      to: '/admin/brands',
      label: 'Manage Brands',
      icon: Tag,
      isActive: pathname.startsWith('/admin/brands'),
    },
    {
      to: '/admin/corporate-inquiries',
      label: 'Corporate Inquiries',
      icon: Building2,
      isActive: pathname.startsWith('/admin/corporate-inquiries'),
    },
    {
      to: '/admin/customer-ledger',
      label: 'Customer Ledger',
      icon: Banknote,
      isActive: pathname.startsWith('/admin/customer-ledger'),
    },
    {
      to: '/admin/b2b-customers',
      label: 'B2B Customers',
      icon: Users,
      isActive: pathname.startsWith('/admin/b2b-customers'),
    },
    {
      to: '/admin/company-ledger',
      label: 'Company Ledger',
      icon: Scale,
      isActive: pathname.startsWith('/admin/company-ledger') || pathname.startsWith('/admin/b2b-ledger'),
    },
    {
      to: '/admin/upi-direct',
      label: 'UPI Direct',
      icon: Wallet,
      isActive: pathname.startsWith('/admin/upi-direct') || pathname.startsWith('/admin/payments'),
    },
    {
      to: '/admin/settings',
      label: 'Payment Settings',
      icon: Settings,
      isActive: pathname.startsWith('/admin/settings'),
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md shadow-xs">
      {/* ───── TIER 1: Top Bar (Branding & Global Actions) ───── */}
      <div>
        <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Left: Brand Identity */}
          <Link
            to="/admin/dashboard"
            className="flex items-center gap-3 hover:opacity-90 transition-opacity shrink-0"
          >
            <span className="grid place-items-center h-10 w-10 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm shrink-0">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <span className="text-base font-extrabold text-slate-900 tracking-tight leading-tight">
              GyftKart Admin
            </span>
          </Link>

          {/* Right: Signed-in context + Clean Red Sign Out Button */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-gray-500 font-medium">
              Signed in as {admin.email || 'gyftkart@gmail.com'}
            </span>
            <button
              onClick={handleLogout}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200/80 px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors shadow-xs"
              title="Sign out of admin console"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>

      {/* ───── TIER 2: Dedicated Horizontal Sub-Navigation Bar ───── */}
      <div className="bg-slate-50/70 border-b border-slate-200">
        <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                    item.isActive
                      ? 'bg-brand-600 text-white shadow-sm ring-1 ring-brand-700'
                      : 'border border-slate-200/80 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50/40 shadow-xs'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${item.isActive ? 'text-white' : 'text-slate-500'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}

const ADMIN_TABS: { id: AdminTabId; label: string; icon: React.ComponentType<{ className?: string }>; path: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/admin/dashboard' },
  { id: 'customers', label: 'B2C Customers', icon: Users, path: '/admin/customers' },
  { id: 'sales', label: 'Gift Card Sales', icon: ShoppingBag, path: '/admin/gift-card-sales' },
  { id: 'inquiries', label: 'Corporate Inquiries', icon: Building2, path: '/admin/corporate-inquiries' },
  { id: 'brands', label: 'Manage Brands', icon: Tag, path: '/admin/brands' },
];

export function AdminNavTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: AdminTabId;
  onTabChange?: (tab: AdminTabId) => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto no-scrollbar">
      {ADMIN_TABS.map((t) => {
        const isActive = activeTab === t.id;
        const Icon = t.icon;
        const className = `relative inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors whitespace-nowrap ${
          isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
        }`;

        if (onTabChange) {
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={className}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600 rounded-full" />}
            </button>
          );
        }

        return (
          <Link key={t.id} to={t.path} className={className}>
            <Icon className="h-4 w-4" />
            {t.label}
            {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600 rounded-full" />}
          </Link>
        );
      })}
    </div>
  );
}
