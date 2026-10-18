import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  ExternalLink,
  ShoppingBag,
  Building2,
  Tag,
  Users,
  Banknote,
  Wallet,
} from 'lucide-react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';

export type AdminTabId = 'overview' | 'sales' | 'inquiries' | 'brands' | 'customers' | 'ledger' | 'payments';

const ADMIN_TABS: { id: AdminTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'sales', label: 'Gift Card Sales', icon: ShoppingBag },
  { id: 'inquiries', label: 'Corporate Inquiries', icon: Building2 },
  { id: 'brands', label: 'Manage Brands', icon: Tag },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'ledger', label: 'Company Ledger', icon: Banknote },
  { id: 'payments', label: 'UPI Direct', icon: Wallet },
];

export function AdminTopBar() {
  const { admin, logout } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    push('Signed out of admin console', 'info');
    navigate('/admin', { replace: true });
  };

  if (!admin) return null;

  return (
    <header className="sticky top-0 z-40 glass border-b border-slate-200/70">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center h-10 w-10 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm">
            <LayoutDashboard className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-lg font-extrabold text-slate-900 leading-none">
              GyftKart <span className="text-gradient">Admin</span>
            </p>
            <p className="text-[11px] text-slate-500">Signed in as {admin.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="hidden md:inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-[11px] font-medium text-slate-500"
            title="Currently signed-in admin identity"
          >
            Signed in: <span className="font-mono text-slate-700">{admin.email || '—'}</span>
          </span>
          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View site
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

        if (t.id === 'payments') {
          return (
            <Link key={t.id} to="/admin/upi-direct" className={className}>
              <Icon className="h-4 w-4" />
              {t.label}
              {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600 rounded-full" />}
            </Link>
          );
        }

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
