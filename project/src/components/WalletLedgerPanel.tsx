import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Search,
  Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/CustomerAuthContext';
import { inr, inrDecimal, formatDateTime } from '@/lib/format';
import UpiDirectCheckoutButton from '@/components/UpiDirectCheckoutButton';

type WalletRow = {
  balance: number | string;
  monthly_added_amount: number | string;
  last_reset_month: string;
};

type LedgerRow = {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  category: 'TOPUP' | 'VOUCHER_PURCHASE' | 'REFUND' | 'ADJUSTMENT' | 'ROLLBACK';
  amount: number | string;
  balance_after: number | string;
  reference_id: string | null;
  order_id: string | null;
  created_at: string;
};

type TopupRow = {
  id: string;
  amount_paise: number | string;
  status: string;
  customer_utr: string | null;
  admin_remark: string | null;
  created_at: string;
};

// ₹10,000/month in paise — kept in LOCKSTEP with the wallet_credit RPC
// cap (migration 20261018090000_wallet_cap_10k.sql fixed the RPC from a
// 10x-paise 10_000_000; both layers must read ₹10,000, never ₹100,000).
const MONTHLY_TOPUP_CAP_PAISE = 1_000_000;

// Display ref for top-up rows: TOP-XXXXXXXX derived from the session id.
const topupRef = (s: Pick<TopupRow, 'id'>) => `TOP-${s.id.slice(0, 8).toUpperCase()}`;

const categoryLabel: Record<LedgerRow['category'], string> = {
  TOPUP: 'Top-up',
  VOUCHER_PURCHASE: 'Purchase',
  REFUND: 'Return',
  ADJUSTMENT: 'Return',
  ROLLBACK: 'Return',
};

const currentMonthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

// Status mapping for the top-up request block:
// CONFIRMED→Confirmed; REJECTED→Rejected (+admin_remark reason);
// REVERTED→Reverted; CANCELLED→Cancelled; ACTIVE+UTR→Pending verification (UTR shown);
// ACTIVE no UTR→Awaiting your payment; anything else → raw status.
const topupStatus = (t: TopupRow): { label: string; cls: string } => {
  if (t.status === 'REVERTED') return { label: 'Reverted', cls: 'bg-slate-100 text-slate-600 border border-slate-200' };
  if (t.status === 'CONFIRMED' || t.status === 'SUCCESS') return { label: 'Confirmed', cls: 'bg-emerald-100 text-emerald-700' };
  if (t.status === 'REJECTED') return { label: 'Rejected', cls: 'bg-rose-100 text-rose-700' };
  if (t.status === 'CANCELLED') return { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' };
  if (t.status === 'ACTIVE') {
    return t.customer_utr
      ? { label: 'Pending Verification', cls: 'bg-amber-100 text-amber-700' }
      : { label: 'Awaiting your payment', cls: 'bg-amber-100 text-amber-700' };
  }
  return { label: t.status, cls: 'bg-slate-100 text-slate-500' };
};

export default function WalletLedgerPanel() {
  const { session: authSession, authReady } = useAuth();
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [topupKey, setTopupKey] = useState(0);
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [topups, setTopups] = useState<TopupRow[] | null>(null);
  const [topupsLoading, setTopupsLoading] = useState(false);
  // Dual-tab toggle: which of the two wallet tables renders.
  const [walletTab, setWalletTab] = useState<'topups' | 'ledger'>('topups');

  // Search + status filter + pagination (shared across both tabs; page
  // resets whenever the tab, page size, or status filter changes).
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'pending' | 'rejected'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [walletTab, pageSize, statusFilter]);

  const q = searchQuery.trim().toLowerCase();

  const matchesSearch = (t: TopupRow | LedgerRow) => {
    if (!q) return true;
    if ('customer_utr' in t) {
      return topupRef(t).toLowerCase().includes(q) || (t.customer_utr ?? '').toLowerCase().includes(q);
    }
    return (t.order_id ?? t.reference_id ?? '').toLowerCase().includes(q);
  };

  const matchesStatus = (t: TopupRow | LedgerRow) => {
    if (statusFilter === 'all') return true;
    if ('customer_utr' in t) {
      const label = topupStatus(t).label;
      if (statusFilter === 'confirmed') return label === 'Confirmed';
      if (statusFilter === 'rejected') return label === 'Rejected' || label === 'Reverted';
      return label === 'Pending Verification' || label === 'Awaiting your payment';
    }
    const credit = t.type === 'CREDIT';
    if (statusFilter === 'confirmed') return credit;
    if (statusFilter === 'rejected') return !credit;
    return false;
  };

  const activeData = (walletTab === 'topups' ? topups : ledger) ?? [];
  const filtered = activeData.filter((t) => matchesSearch(t) && matchesStatus(t));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageStart = (page - 1) * pageSize;
  const paginated = filtered.slice(pageStart, pageStart + pageSize);

  // Remaining monthly top-up quota in paise (the RPC applies rollover at
  // credit time; mirror the same arithmetic for the display).
  const quotaLeft = (() => {
    if (!wallet) return MONTHLY_TOPUP_CAP_PAISE;
    const used =
      wallet.last_reset_month === currentMonthStart()
        ? Number(wallet.monthly_added_amount) || 0
        : 0;
    return Math.max(0, MONTHLY_TOPUP_CAP_PAISE - used);
  })();

  const loadWallet = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('ensure_wallet');
    if (err) {
      setError(err.message || 'Could not load wallet.');
      setLoading(false);
      return;
    }
    setWallet(data as unknown as WalletRow);
    setLoading(false);
  }, []);

  const loadLedger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setLedger([]);
      setLedgerLoading(false);
      return;
    }
    setLedgerLoading(true);
    const { data, error: err } = await supabase
      .from('wallet_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) {
      setError(err.message || 'Could not load wallet history.');
    } else {
      setLedger((data ?? []) as LedgerRow[]);
    }
    setLedgerLoading(false);
  }, []);

  const loadTopups = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setTopups([]);
      setTopupsLoading(false);
      return;
    }
    setTopupsLoading(true);
    const { data, error: err } = await supabase
      .from('upi_payment_sessions')
      .select('id, amount_paise, status, customer_utr, admin_remark, created_at')
      .eq('category', 'TOPUP')
      .order('created_at', { ascending: false })
      .limit(20);
    if (err) {
      setError(err.message || 'Could not load top-up requests.');
    } else {
      setTopups((data ?? []) as TopupRow[]);
    }
    setTopupsLoading(false);
  }, []);

  const fetchWalletData = useCallback(async (userId?: string) => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('ensure_wallet');
    if (err) {
      setError(err.message || 'Could not load wallet.');
      setLoading(false);
      return;
    }
    setWallet(data as unknown as WalletRow);
    setLoading(false);
    void loadLedger();
    void loadTopups();
  }, [loadLedger, loadTopups]);

  useEffect(() => {
    const initWallet = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await fetchWalletData(session.user.id);
      } else {
        setLoading(false);
      }
    };
    void initWallet();
  }, [fetchWalletData]);

  useEffect(() => {
    if (!authReady) return;
    if (authSession?.id) {
      void fetchWalletData(authSession.id);
    } else {
      setLoading(false);
    }
  }, [authReady, authSession?.id, fetchWalletData]);

  const rupees = Number(amountInput);
  const toUpPaise = Math.round(rupees * 100);
  const topUpValid =
    Number.isFinite(rupees) && rupees > 0 && toUpPaise >= 1 && toUpPaise <= quotaLeft && toUpPaise <= MONTHLY_TOPUP_CAP_PAISE;

  return (
    <div id="wallet" className="scroll-mt-24 space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Balance card */}
        <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white shadow-glow-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              <Wallet className="h-3.5 w-3.5" /> GyftKart Wallet
            </span>
            <button
              onClick={() => void loadWallet()}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-white/10 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>
          <p className="mt-6 text-xs text-white/70">Real wallet balance (spendable at checkout)</p>
          <p className="font-display text-4xl font-extrabold">
            {wallet ? inrDecimal(Number(wallet.balance) / 100) : '—'}
          </p>
          <p className="mt-4 text-[11px] leading-snug text-white/70">
            Balance moves land here when a top-up is verified or a purchase/refund is recorded — and every movement is
            listed in the full history below.
          </p>
        </div>

        {/* Add Balance card (UPI Direct pipeline reused) */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
          <h3 className="font-display text-lg font-bold text-slate-900">Add Balance</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Paid the same way as UPI Direct orders: scan the QR or open your UPI app, then confirm with your UTR /
            screenshot for manual verification.
          </p>
          <label className="mt-4 block text-xs font-semibold text-slate-600">
            Amount (₹)
            <input
              type="number"
              min={1}
              max={Math.floor(quotaLeft / 100)}
              step="1"
              inputMode="decimal"
              value={amountInput}
              disabled={!authSession?.token}
              onChange={(e) => {
                setAmountInput(e.target.value);
                setAmountError(null);
              }}
              placeholder="e.g. 500"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Remaining limit this month: <span className="font-bold text-slate-700">{inr(quotaLeft / 100)}</span>
            {' '}· cap ₹10,000/month
          </p>
          {amountError && <p className="mt-1 text-[11px] font-semibold text-rose-600">{amountError}</p>}
          {!authSession?.token ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
              Sign in to add balance.
            </p>
          ) : wallet && topUpValid ? (
            <div className="mt-3">
              <UpiDirectCheckoutButton
                key={topupKey}
                category="TOPUP"
                amount={rupees}
                topUpAmountPaise={toUpPaise}
                buyerName={authSession?.name ?? ''}
                buyerEmail={authSession?.email ?? ''}
                onError={setAmountError}
                onTopUpCompleted={() => {
                  void loadWallet();
                  void loadLedger();
                  void loadTopups();
                  setTopupKey((k) => k + 1);
                }}
                onCancel={() => setTopupKey((k) => k + 1)}
                label={`Add ${inr(rupees)} via UPI`}
              />
              <p className="mt-2 text-[11px] text-amber-700">
                Top-up pending verification — your balance is credited only after manual verification, never on
                proof submission alone.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-slate-400">
              Enter a valid amount to start the top-up.
            </p>
          )}
        </div>
      </div>

      {/* Wallet tables — dual-tab toggle (Top-up requests | Wallet
          Transaction History); only the active tab renders. */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
            <button
              onClick={() => setWalletTab('topups')}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                walletTab === 'topups'
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Top-up requests
            </button>
            <button
              onClick={() => setWalletTab('ledger')}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                walletTab === 'ledger'
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Wallet Transaction History
            </button>
          </div>
          <div className="flex items-center gap-2 flex-1 max-w-xl">
            <div className="relative flex items-center w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Order ID, UTR…"
                className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-[11px] outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 transition-colors"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'confirmed' | 'pending' | 'rejected')
              }
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
            >
              <option value="all">All Status</option>
              <option value="confirmed">Success / Confirmed</option>
              <option value="pending">Pending Verification</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
            >
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
            <button
              onClick={() => void (walletTab === 'topups' ? loadTopups() : loadLedger())}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {(walletTab === 'topups' ? topupsLoading : ledgerLoading) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </button>
          </div>
        </div>

        {walletTab === 'topups' ? (
          <>
            {topups !== null && topups.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">
                No top-up requests yet — Add Balance to start.
              </p>
            ) : (
              <>
                {filtered.length === 0 && (topups ?? []).length > 0 ? (
                  <p className="mt-6 text-sm text-slate-500">No matching results</p>
                ) : (
                  <>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-xs">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Sr No.
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Order ID
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Amount
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Date &amp; Time
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              UTR
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map((t, i) => {
                            const tr = t as TopupRow;
                            const st = topupStatus(tr);
                            return (
                              <tr key={tr.id} className="border-t border-slate-100">
                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                                  {pageStart + i + 1}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] font-semibold text-slate-900">
                                  {topupRef(tr)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">
                                  {inr(Number(tr.amount_paise) / 100)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                                  {formatDateTime(tr.created_at)}
                                </td>
                                <td className="break-all px-3 py-2.5 font-mono text-[11px] text-slate-600">
                                  {tr.customer_utr ?? '—'}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>
                                    {st.label}
                                  </span>
                                  {(tr.status === 'REJECTED' || tr.status === 'REVERTED') && tr.admin_remark && (
                                    <p className={`mt-0.5 text-[10px] font-semibold ${tr.status === 'REJECTED' ? 'text-rose-600' : 'text-slate-500'}`}>
                                      {tr.admin_remark.startsWith('Reverted by') ? tr.admin_remark : `Reason: ${tr.admin_remark}`}
                                    </p>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
                      <span>
                        Showing {pageStart + 1} to{' '}
                        {Math.min(pageStart + pageSize, filtered.length)} of {filtered.length} results
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPage((p) => p - 1)}
                          disabled={page === 1}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                        >
                          ‹ Previous
                        </button>
                        {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                              p === page
                                ? 'bg-brand-600 border-brand-600 text-white'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                        <button
                          onClick={() => setPage((p) => p + 1)}
                          disabled={page === pageCount}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                        >
                          Next ›
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {ledger !== null && ledger.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">
                No wallet activity yet — add balance to get started.
              </p>
            ) : (
              <>
                {filtered.length === 0 && (ledger ?? []).length > 0 ? (
                  <p className="mt-6 text-sm text-slate-500">No matching results</p>
                ) : (
                  <>
                    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full min-w-[680px] text-left text-xs">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Sr No.
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Date
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Type
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Category
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Amount
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Order ID / Reference
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Balance
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map((t, i) => {
                            const tl = t as LedgerRow;
                            const amountRs = Number(tl.amount) / 100;
                            const credit = tl.type === 'CREDIT';
                            return (
                              <tr key={tl.id} className="border-t border-slate-100">
                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                                  {pageStart + i + 1}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                                  {formatDateTime(tl.created_at)}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      credit ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                    }`}
                                  >
                                    {credit ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                                    {tl.type}
                                  </span>
                                </td>
                                <td className="flex items-center gap-1 whitespace-nowrap px-3 py-2.5 text-slate-600">
                                  <ArrowLeftRight className="h-3 w-3 text-slate-300" />
                                  {categoryLabel[tl.category] ?? tl.category}
                                </td>
                                <td
                                  className={`whitespace-nowrap px-3 py-2.5 font-semibold ${
                                    credit ? 'text-emerald-700' : 'text-rose-700'
                                  }`}
                                >
                                  {credit ? '+' : '−'}{inr(amountRs)}
                                </td>
                                <td className="break-all px-3 py-2.5 font-mono text-[11px] text-slate-500">
                                  {tl.order_id ?? tl.reference_id ?? '—'}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">
                                  {inr(Number(tl.balance_after) / 100)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
                      <span>
                        Showing {pageStart + 1} to{' '}
                        {Math.min(pageStart + pageSize, filtered.length)} of {filtered.length} results
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPage((p) => p - 1)}
                          disabled={page === 1}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                        >
                          ‹ Previous
                        </button>
                        {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                              p === page
                                ? 'bg-brand-600 border-brand-600 text-white'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                        <button
                          onClick={() => setPage((p) => p + 1)}
                          disabled={page === pageCount}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                        >
                          Next ›
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>
      )}
    </div>
  );
}
