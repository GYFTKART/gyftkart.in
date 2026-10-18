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
  ];

  return (
    <header className="sticky top-0 z-40 glass border-b border-slate-200/70">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Logo / Brand */}
        <Link to="/admin/dashboard" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity shrink-0">
          <span className="grid place-items-center h-10 w-10 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm">
            <LayoutDashboard className="h-5 w-5" />
          </span>
          <p className="font-display text-lg font-extrabold text-slate-900 leading-none hidden sm:block">
            GyftKart <span className="text-gradient">Admin</span>
          </p>
        </Link>

        {/* Top Navbar Links */}
        <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  item.isActive
                    ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Section: Identity & Sign Out */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="hidden xl:inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-500"
            title="Currently signed-in admin identity"
          >
            Signed in: <span className="font-mono text-slate-700 ml-1">{admin.email || '—'}</span>
          </span>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> <span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}

const ADMIN_TABS: { id: AdminTabId; label: string; icon: React.ComponentType<{ className?: string }>; path: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/admin/dashboard' },
  { id: 'sales', label: 'Gift Card Sales', icon: ShoppingBag, path: '/admin/dashboard?tab=sales' },
  { id: 'inquiries', label: 'Corporate Inquiries', icon: Building2, path: '/admin/dashboard?tab=inquiries' },
  { id: 'brands', label: 'Manage Brands', icon: Tag, path: '/admin/dashboard?tab=brands' },
  { id: 'customers', label: 'Customers', icon: Users, path: '/admin/dashboard?tab=customers' },
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
