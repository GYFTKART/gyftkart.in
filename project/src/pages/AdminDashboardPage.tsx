import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  ShoppingBag,
  Building2,
  Users,
  TrendingUp,
  IndianRupee,
  Gift,
  Receipt,
  Mail,
  Phone,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Search,
  X,
  ExternalLink,
  Sparkles,
  Eye,
  Tag,
  Banknote,
  Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';
import { inr, inrDecimal, formatDateTime } from '@/lib/format';
import BrandManager from '@/components/BrandManager';
import CompanyLedgerTab from '@/components/CompanyLedgerTab';
import CustomerLedgerModal, { type LedgerCustomer } from '@/components/CustomerLedgerModal';
import type { CompanyLedgerEntry } from '@/lib/types';

type Purchase = {
  id: string;
  session_id: string;
  brand_name: string;
  brand_color: string;
  brand_color2: string;
  amount: number;
  quantity: number;
  recipient_name: string;
  recipient_email: string;
  recipient_phone: string;
  occasion: string;
  gift_card_code: string;
  status: string;
  balance: number;
  created_at: string;
};

type Inquiry = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  employee_count: string;
  budget: string;
  occasions: string;
  message: string;
  status: string;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  created_at: string;
};

type PurchaseStat = { orders: number; spent: number; lastOrder: string; name: string };

type Tab = 'overview' | 'sales' | 'inquiries' | 'brands' | 'customers' | 'ledger';

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'sales', label: 'Gift Card Sales', icon: ShoppingBag },
  { id: 'inquiries', label: 'Corporate Inquiries', icon: Building2 },
  { id: 'brands', label: 'Manage Brands', icon: Tag },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'ledger', label: 'Company Ledger', icon: Banknote },
];

export default function AdminDashboardPage() {
  const { admin, logout } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('overview');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [companyLedger, setCompanyLedger] = useState<CompanyLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [salesSearch, setSalesSearch] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [inqFilter, setInqFilter] = useState<'all' | 'new' | 'contacted' | 'closed'>('all');
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [updatingInq, setUpdatingInq] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<LedgerCustomer | null>(null);

  useEffect(() => {
    if (!admin) {
      navigate('/admin', { replace: true });
      return;
    }
    let active = true;
    (async () => {
      try {
        const [p, i, pr, cl] = await Promise.all([
          supabase
            .from('purchases')
            .select('*')
            .order('created_at', { ascending: false }),
          supabase
            .from('corporate_inquiries')
            .select('*')
            .order('created_at', { ascending: false }),
          supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false }),
          supabase
            .from('company_ledger')
            .select('*')
            .order('created_at', { ascending: false }),
        ]);
        if (!active) return;
        if (p.error) throw p.error;
        if (i.error) throw i.error;
        if (pr.error) throw pr.error;
        if (cl.error) throw cl.error;
        setPurchases((p.data ?? []) as Purchase[]);
        setInquiries((i.data ?? []) as Inquiry[]);
        setProfiles((pr.data ?? []) as Profile[]);
        setCompanyLedger((cl.data ?? []) as CompanyLedgerEntry[]);
      } catch (err) {
        push(err instanceof Error ? err.message : 'Failed to load admin data', 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [admin, navigate, push]);

  const stats = useMemo(() => {
    const totalRevenue = purchases.reduce((s, p) => s + Number(p.amount) * p.quantity, 0);
    const totalCards = purchases.reduce((s, p) => s + p.quantity, 0);
    const uniqueSessions = new Set(purchases.map((p) => p.session_id)).size;
    const newInquiries = inquiries.filter((i) => i.status === 'new').length;
    return { totalRevenue, totalCards, uniqueSessions, newInquiries, orderCount: purchases.length };
  }, [purchases, inquiries]);

  // top brands by revenue
  const topBrands = useMemo(() => {
    const map: Record<string, { revenue: number; count: number; color: string; color2: string }> = {};
    purchases.forEach((p) => {
      const key = p.brand_name;
      if (!map[key]) map[key] = { revenue: 0, count: 0, color: p.brand_color, color2: p.brand_color2 };
      map[key].revenue += Number(p.amount) * p.quantity;
      map[key].count += p.quantity;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [purchases]);

  const maxBrandRevenue = topBrands[0]?.revenue ?? 1;

  // recent orders
  const recentOrders = purchases.slice(0, 6);

  const filteredSales = useMemo(() => {
    if (!salesSearch.trim()) return purchases;
    const q = salesSearch.trim().toLowerCase();
    return purchases.filter(
      (p) =>
        p.brand_name.toLowerCase().includes(q) ||
        p.recipient_name.toLowerCase().includes(q) ||
        p.recipient_email.toLowerCase().includes(q) ||
        p.gift_card_code.toLowerCase().includes(q)
    );
  }, [purchases, salesSearch]);

  const filteredInquiries = useMemo(() => {
    if (inqFilter === 'all') return inquiries;
    return inquiries.filter((i) => i.status === inqFilter);
  }, [inquiries, inqFilter]);

  // Purchase stats (orders, spend) grouped by recipient email, so they can
  // be attached to registered users even if the order's session_id differs
  // from their account (e.g. gifting to someone else, or buying as guest
  // then signing up later with the same email).
  const purchaseStatsByEmail = useMemo(() => {
    const map: Record<string, PurchaseStat> = {};
    purchases.forEach((p) => {
      const key = p.recipient_email.trim().toLowerCase();
      if (!key) return;
      if (!map[key]) map[key] = { orders: 0, spent: 0, lastOrder: p.created_at, name: p.recipient_name };
      map[key].orders += 1;
      map[key].spent += Number(p.amount) * p.quantity;
      if (p.created_at > map[key].lastOrder) map[key].lastOrder = p.created_at;
    });
    return map;
  }, [purchases]);

  // Customers = every registered account (from Supabase Auth via the
  // `profiles` table), enriched with their purchase stats if any. Guests
  // who bought a gift card without creating an account still show up
  // underneath, keyed by their recipient email, so no order data is lost.
  const customers = useMemo(() => {
    const seenEmails = new Set<string>();
    const fromProfiles = profiles.map((pf) => {
      const key = pf.email.trim().toLowerCase();
      seenEmails.add(key);
      const stats = purchaseStatsByEmail[key];
      return {
        sessionId: pf.id,
        email: pf.email,
        name: pf.full_name || stats?.name || 'Unnamed',
        orders: stats?.orders ?? 0,
        spent: stats?.spent ?? 0,
        lastOrder: stats?.lastOrder ?? pf.created_at,
        registered: true,
      };
    });

    const guestOnly = (Object.entries(purchaseStatsByEmail) as [string, PurchaseStat][])
      .filter(([email]) => !seenEmails.has(email))
      .map(([email, stats]) => ({
        sessionId: email,
        email,
        name: stats.name,
        orders: stats.orders,
        spent: stats.spent,
        lastOrder: stats.lastOrder,
        registered: false,
      }));

    return [...fromProfiles, ...guestOnly].sort((a, b) => b.spent - a.spent);
  }, [profiles, purchaseStatsByEmail]);

  const filteredCustomers = useMemo(() => {
    if (!custSearch.trim()) return customers;
    const q = custSearch.trim().toLowerCase();
    return customers.filter(
      (c) => c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [customers, custSearch]);

  const updateInquiryStatus = async (id: string, status: string) => {
    setUpdatingInq(id);
    try {
      const { error } = await supabase
        .from('corporate_inquiries')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
      setSelectedInquiry((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
      push('Inquiry status updated', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setUpdatingInq(null);
    }
  };

  const handleLogout = () => {
    logout();
    push('Signed out of admin console', 'info');
    navigate('/admin', { replace: true });
  };

  if (!admin) return null;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      new: 'bg-gold-100 text-gold-700',
      contacted: 'bg-brand-100 text-brand-700',
      closed: 'bg-emerald-100 text-emerald-700',
      active: 'bg-emerald-100 text-emerald-700',
    };
    return map[status] ?? 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
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

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Stat cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            icon={IndianRupee}
            label="Total revenue"
            value={inrDecimal(stats.totalRevenue)}
            sub={`${stats.orderCount} orders`}
            accent="from-brand-600 to-brand-800"
          />
          <StatCard
            icon={Gift}
            label="Gift cards sold"
            value={String(stats.totalCards)}
            sub="across all brands"
            accent="from-fuchsia-500 to-purple-700"
          />
          <StatCard
            icon={Users}
            label="Customers"
            value={String(customers.length)}
            sub="registered + guests"
            accent="from-emerald-500 to-teal-700"
          />
          <StatCard
            icon={Building2}
            label="New inquiries"
            value={String(stats.newInquiries)}
            sub={`${inquiries.length} total`}
            accent="from-gold-400 to-gold-600"
          />
        </div>

        {/* Tabs */}
        <div className="mt-8 flex items-center gap-2 border-b border-slate-200 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors whitespace-nowrap ${
                tab === t.id ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600 rounded-full" />}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-3xl shimmer" />
              ))}
            </div>
          ) : tab === 'overview' ? (
            <OverviewTab
              recentOrders={recentOrders}
              topBrands={topBrands}
              maxBrandRevenue={maxBrandRevenue}
              inquiries={inquiries.slice(0, 4)}
              statusBadge={statusBadge}
              onViewInquiry={setSelectedInquiry}
            />
          ) : tab === 'sales' ? (
            <SalesTab
              purchases={filteredSales}
              search={salesSearch}
              setSearch={setSalesSearch}
              statusBadge={statusBadge}
            />
          ) : tab === 'inquiries' ? (
            <InquiriesTab
              inquiries={filteredInquiries}
              filter={inqFilter}
              setFilter={setInqFilter}
              statusBadge={statusBadge}
              onView={setSelectedInquiry}
              onUpdate={updateInquiryStatus}
              updating={updatingInq}
            />
          ) : tab === 'brands' ? (
            <BrandManager />
          ) : tab === 'ledger' ? (
            <CompanyLedgerTab entries={companyLedger} />
          ) : (
            <CustomersTab
              customers={filteredCustomers}
              search={custSearch}
              setSearch={setCustSearch}
              onSelectCustomer={setSelectedCustomer}
            />
          )}
        </div>
      </div>

      {/* Inquiry detail modal */}
      {selectedInquiry && (
        <InquiryModal
          inquiry={selectedInquiry}
          onClose={() => setSelectedInquiry(null)}
          onUpdate={updateInquiryStatus}
          updating={updatingInq === selectedInquiry.id}
          statusBadge={statusBadge}
        />
      )}

      {/* Customer wallet ledger modal */}
      {selectedCustomer && (
        <CustomerLedgerModal customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
      )}
    </div>
  );
}

/* ---------- shared bits ---------- */

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-soft hover:shadow-card transition-shadow">
      <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-brand-100/50 blur-2xl pointer-events-none" />
      <span className={`grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br ${accent} text-white shadow-glow-sm`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-xs text-slate-500 font-medium">{label}</p>
      <p className="font-display text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

/* ---------- overview tab ---------- */

function OverviewTab({
  recentOrders,
  topBrands,
  maxBrandRevenue,
  inquiries,
  statusBadge,
  onViewInquiry,
}: {
  recentOrders: Purchase[];
  topBrands: { name: string; revenue: number; count: number; color: string; color2: string }[];
  maxBrandRevenue: number;
  inquiries: Inquiry[];
  statusBadge: (s: string) => string;
  onViewInquiry: (i: Inquiry) => void;
}) {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Top brands */}
      <div className="lg:col-span-2 rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
        <div className="flex items-center gap-2.5">
          <TrendingUp className="h-5 w-5 text-brand-600" />
          <h3 className="font-display text-lg font-bold text-slate-900">Top brands by revenue</h3>
        </div>
        {topBrands.length === 0 ? (
          <EmptyMini text="No sales yet." />
        ) : (
          <div className="mt-5 space-y-4">
            {topBrands.map((b) => {
              const pct = Math.round((b.revenue / maxBrandRevenue) * 100);
              return (
                <div key={b.name}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="flex items-center gap-2.5">
                      <span
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-white font-display font-bold text-[9px]"
                        style={{ background: `linear-gradient(135deg, ${b.color}, ${b.color2})` }}
                      >
                        {b.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-semibold text-slate-800">{b.name}</span>
                      <span className="text-[11px] text-slate-400">{b.count} sold</span>
                    </span>
                    <span className="font-display font-bold text-slate-900">{inr(b.revenue)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${b.color}, ${b.color2})`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent inquiries */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
        <div className="flex items-center gap-2.5">
          <Building2 className="h-5 w-5 text-brand-600" />
          <h3 className="font-display text-lg font-bold text-slate-900">Latest inquiries</h3>
        </div>
        {inquiries.length === 0 ? (
          <EmptyMini text="No inquiries yet." />
        ) : (
          <ul className="mt-4 space-y-3">
            {inquiries.map((i) => (
              <li key={i.id}>
                <button
                  onClick={() => onViewInquiry(i)}
                  className="w-full text-left rounded-2xl border border-slate-100 p-3.5 hover:border-brand-200 hover:shadow-soft transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900 text-sm truncate">{i.company_name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${statusBadge(i.status)}`}>
                      {i.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 truncate">{i.contact_name} · {i.email}</p>
                  <p className="text-[11px] text-brand-600 mt-1.5 flex items-center gap-1 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                    <Eye className="h-3 w-3" /> View details
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent orders */}
      <div className="lg:col-span-3 rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
        <div className="flex items-center gap-2.5 mb-4">
          <Receipt className="h-5 w-5 text-brand-600" />
          <h3 className="font-display text-lg font-bold text-slate-900">Recent orders</h3>
        </div>
        {recentOrders.length === 0 ? (
          <EmptyMini text="No orders yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="pb-3 pr-4">Brand</th>
                  <th className="pb-3 pr-4">Recipient</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-4">Code</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentOrders.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-2.5">
                        <span
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-display font-bold text-[9px] shrink-0"
                          style={{ background: `linear-gradient(135deg, ${p.brand_color}, ${p.brand_color2})` }}
                        >
                          {p.brand_name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-semibold text-slate-800 truncate">{p.brand_name}</span>
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-600 truncate max-w-[160px]">{p.recipient_name}</td>
                    <td className="py-3 pr-4 font-display font-bold text-slate-900">{inr(Number(p.amount) * p.quantity)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-700">{p.gift_card_code}</td>
                    <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">{formatDateTime(p.created_at)}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${statusBadge(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- sales tab ---------- */

function SalesTab({
  purchases,
  search,
  setSearch,
  statusBadge,
}: {
  purchases: Purchase[];
  search: string;
  setSearch: (s: string) => void;
  statusBadge: (s: string) => string;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h3 className="font-display text-lg font-bold text-slate-900">All gift card sales</h3>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand, recipient, code…"
            className="w-full rounded-full border border-slate-200 bg-white pl-9 pr-9 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {purchases.length === 0 ? (
        <EmptyMini text={search ? 'No sales match your search.' : 'No sales recorded yet.'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="pb-3 pr-4">Brand</th>
                <th className="pb-3 pr-4">Recipient</th>
                <th className="pb-3 pr-4">Contact</th>
                <th className="pb-3 pr-4">Amount</th>
                <th className="pb-3 pr-4">Qty</th>
                <th className="pb-3 pr-4">Code</th>
                <th className="pb-3 pr-4">Balance</th>
                <th className="pb-3 pr-4">Date</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {purchases.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2.5">
                      <span
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-display font-bold text-[9px] shrink-0"
                        style={{ background: `linear-gradient(135deg, ${p.brand_color}, ${p.brand_color2})` }}
                      >
                        {p.brand_name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-semibold text-slate-800 whitespace-nowrap">{p.brand_name}</span>
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{p.recipient_name || '—'}</td>
                  <td className="py-3 pr-4 text-slate-500 whitespace-nowrap max-w-[180px] truncate">
                    <span className="block text-xs">{p.recipient_email}</span>
                    <span className="block text-[11px] text-slate-400">{p.recipient_phone}</span>
                  </td>
                  <td className="py-3 pr-4 font-display font-bold text-slate-900 whitespace-nowrap">{inr(Number(p.amount) * p.quantity)}</td>
                  <td className="py-3 pr-4 text-slate-600">{p.quantity}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-700 whitespace-nowrap">{p.gift_card_code}</td>
                  <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{inrDecimal(Number(p.balance))}</td>
                  <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">{formatDateTime(p.created_at)}</td>
                  <td className="py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${statusBadge(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- inquiries tab ---------- */

function InquiriesTab({
  inquiries,
  filter,
  setFilter,
  statusBadge,
  onView,
  onUpdate,
  updating,
}: {
  inquiries: Inquiry[];
  filter: 'all' | 'new' | 'contacted' | 'closed';
  setFilter: (f: 'all' | 'new' | 'contacted' | 'closed') => void;
  statusBadge: (s: string) => string;
  onView: (i: Inquiry) => void;
  onUpdate: (id: string, status: string) => void;
  updating: string | null;
}) {
  const filters: { id: 'all' | 'new' | 'contacted' | 'closed'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'new', label: 'New' },
    { id: 'contacted', label: 'Contacted' },
    { id: 'closed', label: 'Closed' },
  ];

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h3 className="font-display text-lg font-bold text-slate-900">Corporate bulk-order inquiries</h3>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                filter === f.id
                  ? 'bg-brand-600 text-white shadow-glow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-brand-100 hover:text-brand-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {inquiries.length === 0 ? (
        <EmptyMini text="No inquiries in this filter." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {inquiries.map((i) => (
            <div key={i.id} className="rounded-2xl border border-slate-100 p-5 hover:shadow-soft transition-shadow flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display font-bold text-slate-900 truncate">{i.company_name}</p>
                  <p className="text-xs text-slate-500 truncate">{i.contact_name}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize shrink-0 ${statusBadge(i.status)}`}>
                  {i.status}
                </span>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                <p className="flex items-center gap-2 truncate">
                  <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" /> {i.email}
                </p>
                <p className="flex items-center gap-2 truncate">
                  <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" /> {i.phone}
                </p>
                <p className="flex items-center gap-2 truncate">
                  <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" /> {i.employee_count || '—'} employees
                </p>
                <p className="flex items-center gap-2 truncate">
                  <IndianRupee className="h-3.5 w-3.5 text-slate-400 shrink-0" /> {i.budget || '—'}
                </p>
              </div>

              {i.occasions && (
                <p className="mt-2.5 text-[11px] text-slate-400 truncate">
                  <Sparkles className="h-3 w-3 inline mr-1" />
                  {i.occasions}
                </p>
              )}

              <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between gap-2 mt-auto">
                <button
                  onClick={() => onView(i)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100 transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" /> View
                </button>
                <div className="flex items-center gap-1.5">
                  {i.status !== 'contacted' && (
                    <button
                      onClick={() => onUpdate(i.id, 'contacted')}
                      disabled={updating === i.id}
                      className="rounded-full bg-brand-100 px-2.5 py-1.5 text-[11px] font-bold text-brand-700 hover:bg-brand-200 transition-colors disabled:opacity-50"
                    >
                      {updating === i.id ? '…' : 'Contacted'}
                    </button>
                  )}
                  {i.status !== 'closed' && (
                    <button
                      onClick={() => onUpdate(i.id, 'closed')}
                      disabled={updating === i.id}
                      className="rounded-full bg-emerald-100 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                    >
                      {updating === i.id ? '…' : 'Close'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- customers tab ---------- */

function CustomersTab({
  customers,
  search,
  setSearch,
  onSelectCustomer,
}: {
  customers: {
    sessionId: string;
    email: string;
    name: string;
    orders: number;
    spent: number;
    lastOrder: string;
    registered: boolean;
  }[];
  search: string;
  setSearch: (s: string) => void;
  onSelectCustomer: (c: LedgerCustomer) => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h3 className="font-display text-lg font-bold text-slate-900">Customers</h3>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-full border border-slate-200 bg-white pl-9 pr-9 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {customers.length === 0 ? (
        <EmptyMini text={search ? 'No customers match your search.' : 'No customers yet.'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="pb-3 pr-4">Customer</th>
                <th className="pb-3 pr-4">Contact</th>
                <th className="pb-3 pr-4">Account</th>
                <th className="pb-3 pr-4">Orders</th>
                <th className="pb-3 pr-4">Total spent</th>
                <th className="pb-3 pr-4">Avg. order</th>
                <th className="pb-3 pr-4">Last activity</th>
                <th className="pb-3">Wallet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {customers.map((c) => (
                <tr key={c.sessionId} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2.5">
                      <span className="grid place-items-center h-9 w-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white font-display font-bold text-xs shrink-0">
                        {(c.name || c.email || '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="font-semibold text-slate-800 truncate">{c.name || 'Unknown'}</span>
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-500 truncate max-w-[200px]">{c.email}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        c.registered ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {c.registered ? 'Registered' : 'Guest'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{c.orders}</td>
                  <td className="py-3 pr-4 font-display font-bold text-slate-900">{inr(c.spent)}</td>
                  <td className="py-3 pr-4 text-slate-600">{c.orders ? inr(Math.round(c.spent / c.orders)) : '—'}</td>
                  <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">
                    {c.lastOrder ? formatDateTime(c.lastOrder) : '—'}
                  </td>
                  <td className="py-3">
                    {c.registered ? (
                      <button
                        onClick={() =>
                          onSelectCustomer({
                            sessionId: c.sessionId,
                            name: c.name,
                            email: c.email,
                            registered: true,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100 transition-colors whitespace-nowrap"
                      >
                        <Wallet className="h-3.5 w-3.5" /> View wallet
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Guest</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- inquiry modal ---------- */

function InquiryModal({
  inquiry,
  onClose,
  onUpdate,
  updating,
  statusBadge,
}: {
  inquiry: Inquiry;
  onClose: () => void;
  onUpdate: (id: string, status: string) => void;
  updating: boolean;
  statusBadge: (s: string) => string;
}) {
  return (
    <div className="fixed inset-0 z-[150] grid place-items-center p-4">
      <div className="absolute inset-0 bg-brand-950/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-glow animate-scale-in max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white">
              <Building2 className="h-6 w-6" />
            </span>
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900">{inquiry.company_name}</h3>
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize mt-1 ${statusBadge(inquiry.status)}`}>
                {inquiry.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center h-9 w-9 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Detail label="Contact person" value={inquiry.contact_name} icon={Users} />
            <Detail label="Email" value={inquiry.email} icon={Mail} />
            <Detail label="Phone" value={inquiry.phone} icon={Phone} />
            <Detail label="Employees" value={inquiry.employee_count || '—'} icon={Users} />
            <Detail label="Budget" value={inquiry.budget || '—'} icon={IndianRupee} />
            <Detail label="Submitted" value={formatDateTime(inquiry.created_at)} icon={Calendar} />
          </div>

          {inquiry.occasions && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Occasions</p>
              <div className="flex flex-wrap gap-2">
                {inquiry.occasions.split(',').map((o) => (
                  <span key={o} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                    {o.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {inquiry.message && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Message</p>
              <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 leading-relaxed italic">
                "{inquiry.message}"
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex items-center justify-between gap-3">
          <a
            href={`mailto:${inquiry.email}?subject=Re: Corporate gifting inquiry - ${inquiry.company_name}`}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 transition-colors"
          >
            <Mail className="h-4 w-4" /> Reply by email
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdate(inquiry.id, 'contacted')}
              disabled={updating || inquiry.status === 'contacted'}
              className="rounded-full bg-brand-100 px-4 py-2.5 text-xs font-bold text-brand-700 hover:bg-brand-200 transition-colors disabled:opacity-40"
            >
              <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" /> Mark contacted
            </button>
            <button
              onClick={() => onUpdate(inquiry.id, 'closed')}
              disabled={updating || inquiry.status === 'closed'}
              className="rounded-full bg-emerald-100 px-4 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-40"
            >
              <Clock className="h-3.5 w-3.5 inline mr-1" /> Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Mail }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-800 break-words">{value}</p>
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}
