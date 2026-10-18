import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  ShoppingBag,
  Building2,
  Tag,
  Users,
  Banknote,
  Wallet,
} from 'lucide-react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';

export type AdminTabId = 'overview' | 'sales' | 'inquiries' | 'brands' | 'customers' | 'ledger';

const ADMIN_TABS: { id: AdminTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'sales', label: 'Gift Card Sales', icon: ShoppingBag },
  { id: 'inquiries', label: 'Corporate Inquiries', icon: Building2 },
  { id: 'brands', label: 'Manage Brands', icon: Tag },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'ledger', label: 'Company Ledger', icon: Banknote },
];

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

  const isUpiDirect = location.pathname.startsWith('/admin/upi-direct');
  const isCustomerLedger = location.pathname.startsWith('/admin/customer-ledger');

  return (
    <header className="sticky top-0 z-40 glass border-b border-slate-200/70">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/admin/dashboard" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <span className="grid place-items-center h-10 w-10 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm">
            <LayoutDashboard className="h-5 w-5" />
          </span>
          <p className="font-display text-lg font-extrabold text-slate-900 leading-none">
            GyftKart <span className="text-gradient">Admin</span>
          </p>
        </Link>
        <div className="flex items-center gap-2">
          <span
            className="hidden md:inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-[11px] font-medium text-slate-500"
            title="Currently signed-in admin identity"
          >
            Signed in: <span className="font-mono text-slate-700">{admin.email || '—'}</span>
          </span>
          <Link
            to="/admin/customer-ledger"
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              isCustomerLedger
                ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'
            }`}
          >
            <Banknote className="h-3.5 w-3.5" /> Customer Ledger
          </Link>
          <Link
            to="/admin/upi-direct"
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              isUpiDirect
                ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'
            }`}
          >
            <Wallet className="h-3.5 w-3.5" /> UPI Direct
          </Link>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

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

        const targetUrl = t.id === 'overview' ? '/admin/dashboard' : `/admin/dashboard?tab=${t.id}`;
        return (
          <Link key={t.id} to={targetUrl} className={className}>
            <Icon className="h-4 w-4" />
            {t.label}
            {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600 rounded-full" />}
          </Link>
        );
      })}
    </div>
  );
}
