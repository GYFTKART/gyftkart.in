import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  ShoppingBag,
  Building2,
  Tag,
  Users,
} from 'lucide-react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';

export type AdminTabId = 'overview' | 'sales' | 'inquiries' | 'brands' | 'customers';

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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md shadow-xs border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: GyftKart Admin Logo and Title */}
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

        {/* Right: Signed in context + Red Sign Out Button */}
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
