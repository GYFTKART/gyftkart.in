import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Wallet,
  ChevronRight,
  RefreshCw,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Banknote,
  ShieldCheck,
  QrCode,
  Users,
  PlusCircle,
  SlidersHorizontal,
} from 'lucide-react';
import { AdminTopBar, AdminBackButton } from '@/components/AdminHeader';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { inrDecimal } from '@/lib/format';
import ManualWalletCreditModal, { type CustomerSummary } from '@/components/ManualWalletCreditModal';

interface WalletTxRow {
  id: string;
  user_id: string;
  user_email?: string;
  type: 'CREDIT' | 'DEBIT';
  category: string;
  amount: number; // in paise
  balance_after: number;
  reference_id?: string;
  order_id?: string;
  created_at: string;
}

export default function AdminWalletManagementPage() {
  const { admin } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'TOPUP' | 'VOUCHER_PURCHASE' | 'REFUND' | 'MANUAL_ADJUSTMENT'>('ALL');
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustCustomer, setAdjustCustomer] = useState<CustomerSummary | null>(null);

  const [metrics, setMetrics] = useState({
    totalWallets: 0,
    totalLiabilityRupees: 0,
    monthlyAddedRupees: 0,
    totalTransactions: 0,
  });

  const [transactions, setTransactions] = useState<WalletTxRow[]>([]);

  const loadWalletData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. Fetch Wallets summary
      const { data: walletsData, error: walletsErr } = await supabase
        .from('wallets')
        .select('balance, monthly_added_amount');

      if (walletsErr) throw walletsErr;

      const wallets = walletsData || [];
      const totalLiabilityPaise = wallets.reduce((sum, w) => sum + Number(w.balance || 0), 0);
      const monthlyAddedPaise = wallets.reduce((sum, w) => sum + Number(w.monthly_added_amount || 0), 0);

      // 2. Fetch recent transactions & profiles to map emails
      const [txRes, profilesRes] = await Promise.all([
        supabase
          .from('wallet_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('profiles').select('id, email, full_name'),
      ]);

      if (txRes.error) throw txRes.error;
      const profilesMap = new Map<string, string>();
      (profilesRes.data || []).forEach((p) => {
        profilesMap.set(p.id, p.email || p.full_name || 'Customer');
      });

      const rows: WalletTxRow[] = (txRes.data || []).map((t) => ({
        id: t.id,
        user_id: t.user_id,
        user_email: profilesMap.get(t.user_id) || 'Customer',
        type: t.type,
        category: t.category,
        amount: Number(t.amount || 0),
        balance_after: Number(t.balance_after || 0),
        reference_id: t.reference_id,
        order_id: t.order_id,
        created_at: t.created_at,
      }));

      setTransactions(rows);
      setMetrics({
        totalWallets: wallets.length,
        totalLiabilityRupees: totalLiabilityPaise / 100,
        monthlyAddedRupees: monthlyAddedPaise / 100,
        totalTransactions: rows.length,
      });

      if (isRefresh) push('Wallet balances refreshed', 'success');
    } catch (err) {
      console.error('Wallet management fetch error:', err);
      push('Failed to load wallet metrics', 'error');
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
    loadWalletData();
  }, [admin, navigate, loadWalletData]);

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      (tx.user_email && tx.user_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (tx.reference_id && tx.reference_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (tx.order_id && tx.order_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      tx.category.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      categoryFilter === 'ALL' ||
      (categoryFilter === 'MANUAL_ADJUSTMENT'
        ? tx.category === 'Manual Adjustment' || tx.category === 'ADJUSTMENT'
        : tx.category === categoryFilter);
    return matchesSearch && matchesCategory;
  });

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />

      <main className="mx-auto max-w-7xl 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
            <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
              Admin
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 font-semibold">Wallet Management</span>
          </nav>
          <div className="flex items-center gap-3">
            <AdminBackButton />
          </div>
        </div>

        {/* Page Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="grid place-items-center h-8 w-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-700 text-white shadow-xs">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-display text-base font-bold text-slate-900">
                GyftKart Wallet Management
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitor system wallet liabilities, customer credit balances, compliance caps, and ledger transactions.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setAdjustCustomer(null);
                setAdjustModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:from-emerald-700 hover:to-teal-800 transition"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Credit / Adjust Balance
            </button>
            <Link
              to="/admin/customer-ledger"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
            >
              <Banknote className="h-3.5 w-3.5 text-emerald-600" /> Customer Ledgers
            </Link>
            <Link
              to="/admin/upi-direct"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
            >
              <QrCode className="h-3.5 w-3.5 text-purple-600" /> Top-up UTRs
            </Link>
            <button
              onClick={() => void loadWalletData(true)}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 shadow-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-brand-600' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <span className="grid place-items-center h-10 w-10 rounded-2xl bg-purple-50 text-purple-700">
                <Wallet className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full">
                Liability
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">Customer Wallet Balance</p>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-1">
              {loading ? '…' : inrDecimal(metrics.totalLiabilityRupees)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Total platform deposit liability</p>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <span className="grid place-items-center h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-700">
                <Users className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                Accounts
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">Provisioned Wallets</p>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-1">
              {loading ? '…' : metrics.totalWallets}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Active customer digital wallets</p>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <span className="grid place-items-center h-10 w-10 rounded-2xl bg-blue-50 text-blue-700">
                <ArrowUpRight className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full">
                This Month
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">Monthly Top-Up Total</p>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-1">
              {loading ? '…' : inrDecimal(metrics.monthlyAddedRupees)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Cumulative balance additions</p>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <span className="grid place-items-center h-10 w-10 rounded-2xl bg-amber-50 text-amber-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full">
                RBI Compliant
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">User Monthly Cap</p>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-1">
              ₹10,000 / mo
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Enforced via DB check constraints</p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user, order ID, or reference..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {([
              { id: 'ALL', label: 'All Transactions' },
              { id: 'TOPUP', label: 'Top-ups' },
              { id: 'VOUCHER_PURCHASE', label: 'Voucher Purchases' },
              { id: 'REFUND', label: 'Refunds' },
              { id: 'MANUAL_ADJUSTMENT', label: 'Manual Adjustments' },
            ] as const).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                  categoryFilter === cat.id
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="rounded-3xl border border-slate-200/80 bg-white shadow-card overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-brand-600" />
              <span>Loading ledger transactions...</span>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-grid place-items-center h-12 w-12 rounded-2xl bg-slate-100 text-slate-400 mb-3">
                <Wallet className="h-6 w-6" />
              </div>
              <h3 className="font-display text-sm font-bold text-slate-800">No Transactions Found</h3>
              <p className="text-xs text-slate-400 mt-1">
                {searchQuery || categoryFilter !== 'ALL'
                  ? 'No wallet transactions match the current filters.'
                  : 'Customer top-ups, voucher purchases, and balance adjustments will be listed here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Type &amp; Category</th>
                    <th className="px-5 py-3.5">Reference / Order</th>
                    <th className="px-5 py-3.5 text-right">Amount</th>
                    <th className="px-5 py-3.5 text-right">Balance After</th>
                    <th className="px-5 py-3.5 text-right">Date &amp; Time</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-900">{tx.user_email}</p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-xs">{tx.user_id}</p>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {tx.type === 'CREDIT' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <ArrowDownLeft className="h-3 w-3" /> Credit
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <ArrowUpRight className="h-3 w-3" /> Debit
                            </span>
                          )}
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                              tx.category === 'Manual Adjustment' || tx.category === 'ADJUSTMENT'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {tx.category.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-[11px] text-slate-500">
                        {tx.order_id || tx.reference_id || '—'}
                      </td>
                      <td className="px-5 py-4 text-right font-display font-bold">
                        <span className={tx.type === 'CREDIT' ? 'text-emerald-700' : 'text-slate-800'}>
                          {tx.type === 'CREDIT' ? '+' : '-'}{inrDecimal(tx.amount / 100)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-display font-semibold text-slate-700">
                        {inrDecimal(tx.balance_after / 100)}
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap text-slate-400 text-[11px]">
                        {new Date(tx.created_at).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustCustomer({
                              id: tx.user_id,
                              email: tx.user_email,
                              wallet_balance: tx.balance_after / 100,
                            });
                            setAdjustModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs"
                          title="Adjust customer balance"
                        >
                          <SlidersHorizontal className="h-3 w-3 text-brand-600" />
                          Adjust
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Manual Wallet Credit / Adjust Balance Modal */}
      <ManualWalletCreditModal
        isOpen={adjustModalOpen}
        onClose={() => setAdjustModalOpen(false)}
        onSuccess={() => void loadWalletData(true)}
        initialCustomer={adjustCustomer}
      />
    </div>
  );
}
