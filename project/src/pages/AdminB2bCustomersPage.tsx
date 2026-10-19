import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Building2,
  Plus,
  Search,
  Wallet,
  ShieldCheck,
  TrendingUp,
  FileSpreadsheet,
  Edit,
  SlidersHorizontal,
  Copy,
  Check,
  X,
  Loader2,
  Mail,
  Phone,
  MapPin,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { AdminTopBar, AdminBackButton } from '@/components/AdminHeader';
import { inr } from '@/lib/format';
import { useToast } from '@/components/Toast';

export interface B2bCustomer {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  customer_type: 'B2C' | 'B2B';
  company_name: string | null;
  brand_trade_name: string | null;
  gstin: string | null;
  pan: string | null;
  billing_address: string | null;
  billing_state: string | null;
  billing_city: string | null;
  billing_pincode: string | null;
  contact_person_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  credit_limit: number;
  status: 'active' | 'inactive';
  created_at: string;
  wallet_balance_paise?: number;
}

export default function AdminB2bCustomersPage() {
  const { admin } = useAdminAuth();
  const navigate = useNavigate();
  const { push } = useToast();

  useEffect(() => {
    if (!admin) {
      navigate('/admin', { replace: true });
    }
  }, [admin, navigate]);

  const [customers, setCustomers] = useState<B2bCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<B2bCustomer | null>(null);
  const [adjustingCustomer, setAdjustingCustomer] = useState<B2bCustomer | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    password: string;
    companyName: string;
    loginUrl: string;
  } | null>(null);

  const fetchB2bCustomers = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch profiles where customer_type = 'B2B'
      const { data: profs, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .eq('customer_type', 'B2B')
        .order('created_at', { ascending: false });

      if (profError) throw profError;

      const profileList = (profs || []) as B2bCustomer[];

      if (profileList.length === 0) {
        setCustomers([]);
        setLoading(false);
        return;
      }

      // 2. Fetch wallets for balances
      const userIds = profileList.map((p) => p.id);
      const { data: wallets, error: wError } = await supabase
        .from('wallets')
        .select('user_id, balance')
        .in('user_id', userIds);

      if (wError) console.warn('Could not fetch wallets:', wError);

      const walletMap = new Map<string, number>();
      wallets?.forEach((w) => walletMap.set(w.user_id, Number(w.balance || 0)));

      const merged = profileList.map((p) => ({
        ...p,
        wallet_balance_paise: walletMap.get(p.id) ?? 0,
      }));

      setCustomers(merged);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch B2B customers';
      console.error(err);
      push(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    if (admin) {
      void fetchB2bCustomers();
    }
  }, [admin, fetchB2bCustomers]);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    push(`Copied: ${text}`, 'success');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Filtered List
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (c.company_name?.toLowerCase().includes(q) ?? false) ||
        (c.brand_trade_name?.toLowerCase().includes(q) ?? false) ||
        (c.gstin?.toLowerCase().includes(q) ?? false) ||
        (c.pan?.toLowerCase().includes(q) ?? false) ||
        (c.contact_person_name?.toLowerCase().includes(q) ?? false) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.toLowerCase().includes(q) ?? false) ||
        (c.billing_city?.toLowerCase().includes(q) ?? false) ||
        (c.billing_state?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [customers, searchQuery, statusFilter]);

  // Aggregate Stats
  const stats = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => c.status === 'active').length;
    const totalBalancePaise = customers.reduce((sum, c) => sum + (c.wallet_balance_paise || 0), 0);
    const totalCreditLimit = customers.reduce((sum, c) => sum + Number(c.credit_limit || 0), 0);
    return {
      total,
      active,
      totalBalanceRs: totalBalancePaise / 100,
      totalCreditLimit,
    };
  }, [customers]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <AdminTopBar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Breadcrumb Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
            <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
              Admin
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 font-semibold">B2B Customers</span>
          </nav>
          <div className="flex items-center gap-3">
            <AdminBackButton />
          </div>
        </div>

        {/* Title & Top Action Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-100 text-brand-700">
                <Users className="h-4 w-4" />
              </span>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                B2B Corporate Customers
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Provision, manage, and audit registered corporate entities, GST accounts, and credit limits.
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => void fetchB2bCustomers()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-xs"
              title="Refresh Customer Directory"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              to="/admin/b2b-ledger"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-brand-600" />
              B2B Ledger
            </Link>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add B2B Customer
            </button>
          </div>
        </div>

        {/* Credentials Confirmation Card (if newly created) */}
        {createdCredentials && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center h-8 w-8 rounded-lg bg-emerald-600 text-white">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-emerald-950">
                    B2B Customer Account Successfully Provisioned!
                  </h3>
                  <p className="text-xs text-emerald-700">
                    Account created for <strong>{createdCredentials.companyName}</strong>. Copy these credentials to share with the client.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCreatedCredentials(null)}
                className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold"
              >
                Dismiss
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-white rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Login Email</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs font-mono font-bold text-slate-800">{createdCredentials.email}</span>
                  <button
                    onClick={() => handleCopy('new-email', createdCredentials.email)}
                    className="text-slate-400 hover:text-brand-600 p-1"
                    title="Copy Email"
                  >
                    {copiedKey === 'new-email' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Temporary Password</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs font-mono font-bold text-brand-700">{createdCredentials.password}</span>
                  <button
                    onClick={() => handleCopy('new-pw', createdCredentials.password)}
                    className="text-slate-400 hover:text-brand-600 p-1"
                    title="Copy Password"
                  >
                    {copiedKey === 'new-pw' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Customer Portal URL</span>
                  <span className="text-xs font-medium text-slate-700">/profile or /orders</span>
                </div>
                <button
                  onClick={() => {
                    const text = `GyftKart Corporate Login Details:\nEntity: ${createdCredentials.companyName}\nEmail: ${createdCredentials.email}\nTemporary Password: ${createdCredentials.password}\nLogin at: ${window.location.origin}/profile`;
                    handleCopy('all-creds', text);
                  }}
                  className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition"
                >
                  {copiedKey === 'all-creds' ? 'Copied Details!' : 'Copy Full Details'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Financial & Account Summary KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total B2B Clients</span>
              <span className="p-2 rounded-xl bg-brand-50 text-brand-700">
                <Building2 className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">{stats.total}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{stats.active} Active Corporate Accounts</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Status</span>
              <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-600">{stats.active}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{stats.total - stats.active} Inactive / Suspended</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Corporate Wallet Balance</span>
              <span className="p-2 rounded-xl bg-blue-50 text-blue-700">
                <Wallet className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">{inr(stats.totalBalanceRs)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Prepaid balance across accounts</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Credit Line</span>
              <span className="p-2 rounded-xl bg-purple-50 text-purple-700">
                <TrendingUp className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">{inr(stats.totalCreditLimit)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Approved B2B credit terms</p>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search company, GSTIN, trade name, contact..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs">
              {(['all', 'active', 'inactive'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg font-semibold capitalize transition ${
                    statusFilter === st
                      ? 'bg-white text-brand-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Customers Directory Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
              <p className="text-xs font-medium">Loading corporate accounts…</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Building2 className="mx-auto h-10 w-10 text-slate-300 stroke-[1.5]" />
              <p className="mt-3 text-sm font-bold text-slate-800">No B2B customers found</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search query or status filter.'
                  : 'Get started by creating your first B2B enterprise customer.'}
              </p>
              {!searchQuery && statusFilter === 'all' && (
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-brand-600 rounded-xl hover:bg-brand-700 transition"
                >
                  <Plus className="h-4 w-4" />
                  Add B2B Customer
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4 w-12 text-center">S.No.</th>
                    <th className="py-3.5 px-4 min-w-[220px]">Firm / Legal Entity</th>
                    <th className="py-3.5 px-4 min-w-[150px]">Tax Identifiers (GSTIN / PAN)</th>
                    <th className="py-3.5 px-4 min-w-[180px]">Contact Person</th>
                    <th className="py-3.5 px-4 min-w-[140px] text-right">Wallet Balance</th>
                    <th className="py-3.5 px-4 min-w-[120px] text-right">Credit Line</th>
                    <th className="py-3.5 px-4 text-center min-w-[100px]">Status</th>
                    <th className="py-3.5 px-4 min-w-[200px] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredCustomers.map((c, index) => {
                    const balanceRs = (c.wallet_balance_paise || 0) / 100;
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 text-center text-slate-400 font-mono text-[11px]">
                          {index + 1}
                        </td>

                        {/* Firm / Entity */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-sm">
                            {c.company_name || '—'}
                          </div>
                          {c.brand_trade_name && (
                            <div className="text-[11px] text-slate-500 font-medium">
                              T/A: {c.brand_trade_name}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[200px]">
                              {[c.billing_city, c.billing_state].filter(Boolean).join(', ') || 'No location set'}
                            </span>
                          </div>
                        </td>

                        {/* GSTIN & PAN */}
                        <td className="py-3.5 px-4 space-y-1">
                          {c.gstin ? (
                            <div className="flex items-center gap-1">
                              <span className="px-1.5 py-0.5 rounded bg-brand-50 border border-brand-200 text-brand-800 font-mono text-[10px] font-bold">
                                {c.gstin}
                              </span>
                              <button
                                onClick={() => handleCopy(`gstin-${c.id}`, c.gstin!)}
                                className="text-slate-400 hover:text-brand-600 p-0.5"
                                title="Copy GSTIN"
                              >
                                {copiedKey === `gstin-${c.id}` ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">No GSTIN</span>
                          )}

                          {c.pan && (
                            <div className="flex items-center gap-1">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                                PAN: {c.pan}
                              </span>
                              <button
                                onClick={() => handleCopy(`pan-${c.id}`, c.pan!)}
                                className="text-slate-400 hover:text-brand-600 p-0.5"
                                title="Copy PAN"
                              >
                                {copiedKey === `pan-${c.id}` ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Contact Person */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800">
                            {c.contact_person_name || c.full_name || '—'}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Mail className="h-3 w-3 text-slate-400" />
                            <span className="truncate max-w-[150px]">{c.email}</span>
                          </div>
                          {c.phone && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Phone className="h-3 w-3 text-slate-400" />
                              <span>{c.phone}</span>
                            </div>
                          )}
                        </td>

                        {/* Wallet Balance */}
                        <td className="py-3.5 px-4 text-right">
                          <div className={`font-mono font-bold text-sm ${balanceRs > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                            {inr(balanceRs)}
                          </div>
                          <div className="text-[10px] text-slate-400">Prepaid balance</div>
                        </td>

                        {/* Credit Line */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="font-mono font-semibold text-slate-800">
                            {inr(Number(c.credit_limit || 0))}
                          </div>
                          <div className="text-[10px] text-slate-400">Limit</div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              c.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${c.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {c.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <Link
                              to={`/admin/b2b-ledger?customer=${c.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
                              title="View B2B Ledger statement"
                            >
                              <FileSpreadsheet className="h-3 w-3" />
                              Ledger
                            </Link>
                            <button
                              onClick={() => setAdjustingCustomer(c)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                              title="Adjust Wallet Balance (Credit / Debit)"
                            >
                              <SlidersHorizontal className="h-3 w-3" />
                              Adjust
                            </button>
                            <button
                              onClick={() => setEditingCustomer(c)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                              title="Edit Firm Details"
                            >
                              <Edit className="h-3 w-3" />
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ───────────────── Modal: Create B2B Customer ───────────────── */}
      {isCreateOpen && (
        <CreateB2bCustomerModal
          onClose={() => setIsCreateOpen(false)}
          onSuccess={(creds) => {
            setIsCreateOpen(false);
            setCreatedCredentials(creds);
            void fetchB2bCustomers();
          }}
        />
      )}

      {/* ───────────────── Modal: Edit Firm Details ───────────────── */}
      {editingCustomer && (
        <EditB2bCustomerModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSuccess={() => {
            setEditingCustomer(null);
            push('Customer details updated successfully', 'success');
            void fetchB2bCustomers();
          }}
        />
      )}

      {/* ───────────────── Modal: Adjust Wallet Balance ───────────────── */}
      {adjustingCustomer && (
        <AdjustCustomerBalanceModal
          customer={adjustingCustomer}
          onClose={() => setAdjustingCustomer(null)}
          onSuccess={() => {
            setAdjustingCustomer(null);
            push('Balance adjusted successfully', 'success');
            void fetchB2bCustomers();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Create New B2B Customer (Admin Provisioning)
// ─────────────────────────────────────────────────────────────────────────────
function CreateB2bCustomerModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (creds: { email: string; password: string; companyName: string; loginUrl: string }) => void;
}) {
  const { push } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [brandTradeName, setBrandTradeName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [contactPersonName, setContactPersonName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [autoGenPassword, setAutoGenPassword] = useState(true);
  const [creditLimit, setCreditLimit] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('Uttar Pradesh');
  const [billingPincode, setBillingPincode] = useState('');

  // Auto-generate random secure password on mount
  useEffect(() => {
    if (autoGenPassword) {
      const generated = 'GK' + Math.random().toString(36).slice(-6) + '!9';
      setPassword(generated);
    }
  }, [autoGenPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedCompany = companyName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedCompany) {
      setErrorMsg('Company/Firm name is required.');
      return;
    }
    if (!trimmedEmail || !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setErrorMsg('A valid login email address is required.');
      return;
    }
    if (!trimmedPassword || trimmedPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (gstin.trim() && gstin.trim().length !== 15) {
      setErrorMsg('GSTIN must be exactly 15 alphanumeric characters if provided.');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase.rpc('admin_create_b2b_customer', {
        p_email: trimmedEmail,
        p_password: trimmedPassword,
        p_company_name: trimmedCompany,
        p_brand_trade_name: brandTradeName.trim() || null,
        p_gstin: gstin.trim().toUpperCase() || null,
        p_pan: pan.trim().toUpperCase() || null,
        p_contact_person_name: contactPersonName.trim() || null,
        p_contact_phone: phone.trim() || null,
        p_billing_address: billingAddress.trim() || null,
        p_billing_state: billingState.trim() || null,
        p_billing_city: billingCity.trim() || null,
        p_billing_pincode: billingPincode.trim() || null,
        p_credit_limit: creditLimit ? Number(creditLimit) : 0,
      });

      if (error) throw error;

      onSuccess({
        email: trimmedEmail,
        password: trimmedPassword,
        companyName: trimmedCompany,
        loginUrl: `${window.location.origin}/profile`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to provision B2B customer';
      setErrorMsg(msg);
      push(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-600 text-white">
              <Building2 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Create New B2B Customer</h2>
              <p className="text-[11px] text-slate-500">Corporate identity &amp; credentials provisioning</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Company Details */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Firm / Company Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Company / Legal Name *</label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Enterprise Pvt. Ltd."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Brand / Trade Name (Optional)</label>
                <input
                  type="text"
                  value={brandTradeName}
                  onChange={(e) => setBrandTradeName(e.target.value)}
                  placeholder="e.g. Acme Solutions"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">GSTIN (15 Alphanumeric)</label>
                <input
                  type="text"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setGstin(val);
                    if (val.length >= 12 && !pan) {
                      setPan(val.slice(2, 12));
                    }
                  }}
                  placeholder="e.g. 09ABCDE1234F1Z5"
                  className="w-full px-3 py-2 font-mono uppercase rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">PAN (10 Alphanumeric)</label>
                <input
                  type="text"
                  maxLength={10}
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  placeholder="e.g. ABCDE1234F"
                  className="w-full px-3 py-2 font-mono uppercase rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Contact Person Details */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Primary Contact Person</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Contact Person Name</label>
                <input
                  type="text"
                  value={contactPersonName}
                  onChange={(e) => setContactPersonName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Contact Mobile Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Account Credentials */}
          <div className="space-y-3 pt-2 border-t border-slate-100 bg-brand-50/50 p-3.5 rounded-xl border border-brand-100">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-brand-900">
              Account Credentials (For Customer Portal)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Login Email Address *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@company.com"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">Password *</label>
                  <label className="flex items-center gap-1 text-[11px] text-brand-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoGenPassword}
                      onChange={(e) => setAutoGenPassword(e.target.checked)}
                      className="rounded text-brand-600"
                    />
                    Auto-generate
                  </label>
                </div>
                <input
                  type="text"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setAutoGenPassword(false);
                  }}
                  className="w-full px-3 py-2 bg-white font-mono rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Billing Address & Credit Limit */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Billing Address &amp; Terms</h3>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Street Address</label>
              <input
                type="text"
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
                placeholder="e.g. Unit 402, Signature Tower, Outer Ring Road"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">City</label>
                <input
                  type="text"
                  value={billingCity}
                  onChange={(e) => setBillingCity(e.target.value)}
                  placeholder="e.g. Lucknow"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">State / UT</label>
                <input
                  type="text"
                  value={billingState}
                  onChange={(e) => setBillingState(e.target.value)}
                  placeholder="e.g. Uttar Pradesh"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Pincode</label>
                <input
                  type="text"
                  maxLength={6}
                  value={billingPincode}
                  onChange={(e) => setBillingPincode(e.target.value)}
                  placeholder="e.g. 226001"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Approved Credit Limit (₹)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="0 for 100% advance / prepaid"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition shadow-sm disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? 'Creating Account…' : 'Create B2B Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Edit Existing B2B Customer
// ─────────────────────────────────────────────────────────────────────────────
function EditB2bCustomerModal({
  customer,
  onClose,
  onSuccess,
}: {
  customer: B2bCustomer;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { push } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [companyName, setCompanyName] = useState(customer.company_name || '');
  const [brandTradeName, setBrandTradeName] = useState(customer.brand_trade_name || '');
  const [gstin, setGstin] = useState(customer.gstin || '');
  const [pan, setPan] = useState(customer.pan || '');
  const [contactPersonName, setContactPersonName] = useState(customer.contact_person_name || '');
  const [phone, setPhone] = useState(customer.phone || customer.contact_phone || '');
  const [billingAddress, setBillingAddress] = useState(customer.billing_address || '');
  const [billingCity, setBillingCity] = useState(customer.billing_city || '');
  const [billingState, setBillingState] = useState(customer.billing_state || 'Uttar Pradesh');
  const [billingPincode, setBillingPincode] = useState(customer.billing_pincode || '');
  const [creditLimit, setCreditLimit] = useState(String(customer.credit_limit || 0));
  const [status, setStatus] = useState<'active' | 'inactive'>(customer.status);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!companyName.trim()) {
      setErrorMsg('Company name cannot be blank.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('admin_update_b2b_customer', {
        p_customer_id: customer.id,
        p_company_name: companyName.trim(),
        p_brand_trade_name: brandTradeName.trim() || null,
        p_gstin: gstin.trim().toUpperCase() || null,
        p_pan: pan.trim().toUpperCase() || null,
        p_contact_person_name: contactPersonName.trim() || null,
        p_contact_phone: phone.trim() || null,
        p_billing_address: billingAddress.trim() || null,
        p_billing_state: billingState.trim() || null,
        p_billing_city: billingCity.trim() || null,
        p_billing_pincode: billingPincode.trim() || null,
        p_credit_limit: creditLimit ? Number(creditLimit) : 0,
        p_status: status,
      });

      if (error) throw error;
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update details';
      setErrorMsg(msg);
      push(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-100 text-brand-700">
              <Edit className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Edit B2B Customer Details</h2>
              <p className="text-[11px] text-slate-500 font-mono">{customer.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Company / Legal Name</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Trade Name (Optional)</label>
              <input
                type="text"
                value={brandTradeName}
                onChange={(e) => setBrandTradeName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">GSTIN</label>
              <input
                type="text"
                maxLength={15}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 font-mono uppercase rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">PAN</label>
              <input
                type="text"
                maxLength={10}
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 font-mono uppercase rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Contact Person Name</label>
              <input
                type="text"
                value={contactPersonName}
                onChange={(e) => setContactPersonName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Contact Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Billing Street Address</label>
            <input
              type="text"
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">City</label>
              <input
                type="text"
                value={billingCity}
                onChange={(e) => setBillingCity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">State</label>
              <input
                type="text"
                value={billingState}
                onChange={(e) => setBillingState(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Pincode</label>
              <input
                type="text"
                value={billingPincode}
                onChange={(e) => setBillingPincode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Credit Limit (₹)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Account Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive / Suspended</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition shadow-sm disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Adjust Customer Wallet Balance
// ─────────────────────────────────────────────────────────────────────────────
function AdjustCustomerBalanceModal({
  customer,
  onClose,
  onSuccess,
}: {
  customer: B2bCustomer;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { push } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [amountRs, setAmountRs] = useState('');
  const [category, setCategory] = useState<'TOPUP' | 'ADJUSTMENT' | 'REFUND' | 'OFFLINE_PURCHASE'>('TOPUP');
  const [remark, setRemark] = useState('');

  const currentBalanceRs = (customer.wallet_balance_paise || 0) / 100;
  const numAmount = Number(amountRs) || 0;
  const newBalanceRs = type === 'CREDIT' ? currentBalanceRs + numAmount : currentBalanceRs - numAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (numAmount <= 0) {
      setErrorMsg('Adjustment amount must be greater than zero.');
      return;
    }

    if (type === 'DEBIT' && currentBalanceRs < numAmount) {
      setErrorMsg(`Insufficient wallet balance. Current balance is ${inr(currentBalanceRs)}.`);
      return;
    }

    setSubmitting(true);
    try {
      const amountPaise = Math.round(numAmount * 100);
      const { error } = await supabase.rpc('admin_adjust_customer_balance', {
        p_customer_id: customer.id,
        p_amount_paise: amountPaise,
        p_type: type,
        p_category: category,
        p_remark: remark.trim() || `Admin balance adjustment (${type})`,
      });

      if (error) throw error;
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to adjust balance';
      setErrorMsg(msg);
      push(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-blue-100 text-blue-700">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Adjust Corporate Balance</h2>
              <p className="text-[11px] text-slate-500 truncate max-w-[240px]">{customer.company_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Current Balance Card */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Current Balance</span>
              <span className="text-base font-black text-slate-900">{inr(currentBalanceRs)}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">After Adjustment</span>
              <span className={`text-base font-black ${newBalanceRs >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {inr(newBalanceRs)}
              </span>
            </div>
          </div>

          {/* Type Toggle */}
          <div>
            <label className="font-semibold text-slate-700 block mb-1.5">Adjustment Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('CREDIT')}
                className={`py-2 px-3 rounded-xl font-bold border transition ${
                  type === 'CREDIT'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-2 ring-emerald-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                + Credit (Add Funds)
              </button>
              <button
                type="button"
                onClick={() => setType('DEBIT')}
                className={`py-2 px-3 rounded-xl font-bold border transition ${
                  type === 'DEBIT'
                    ? 'bg-rose-50 border-rose-300 text-rose-800 ring-2 ring-rose-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                - Debit (Deduct Funds)
              </button>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Amount (₹) *</label>
            <input
              type="number"
              min="1"
              step="any"
              required
              value={amountRs}
              onChange={(e) => setAmountRs(e.target.value)}
              placeholder="e.g. 50000"
              className="w-full px-3 py-2 text-sm font-mono font-bold rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
            >
              <option value="TOPUP">Bank Transfer / NEFT / RTGS Top-up</option>
              <option value="ADJUSTMENT">Accounting Adjustment</option>
              <option value="REFUND">Refund / Reversal</option>
              <option value="OFFLINE_PURCHASE">Offline Purchase Debit</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Voucher / UTR / Reference Remark</label>
            <input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="e.g. NEFT Bank Ref: HDFC12345678, Order invoice"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
            />
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl transition shadow-sm disabled:opacity-60 ${
                type === 'CREDIT' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? 'Processing…' : `Confirm ${type === 'CREDIT' ? 'Credit' : 'Debit'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
