import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Loader2, RefreshCw, Wallet } from 'lucide-react';
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
  category: 'TOPUP' | 'VOUCHER_PURCHASE' | 'REFUND';
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

const MONTHLY_TOPUP_CAP_PAISE = 10_000_000; // ₹10,000

const categoryLabel: Record<LedgerRow['category'], string> = {
  TOPUP: 'Top-up',
  VOUCHER_PURCHASE: 'Purchase',
  REFUND: 'Refund',
};

const currentMonthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

export default function WalletLedgerPanel() {
  const { session: authSession } = useAuth();
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
    if (!authSession?.token) return;
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
  }, [authSession?.token]);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  // Top-up requests (upi_payment_sessions, category TOPUP) — read under
  // the CUSTOMER'S OWN session; the owner-select RLS policy
  // ('owner reads own upi session') authorizes user_id = auth.uid() via
  // the shared singleton. No admin-token reuse, no manual headers.
  const loadTopups = useCallback(async () => {
    if (!authSession?.token) return;
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
  }, [authSession?.token]);

  useEffect(() => {
    void loadTopups();
  }, [loadTopups]);

  // Status mapping for the top-up request block:
  // CONFIRMED→Confirmed; REJECTED→Rejected (+admin_remark reason);
  // CANCELLED→Cancelled; ACTIVE+UTR→Pending verification (UTR shown);
  // ACTIVE no UTR→Awaiting your payment; anything else → raw status.
  const topupStatus = (t: TopupRow): { label: string; cls: string } => {
    if (t.status === 'CONFIRMED') return { label: 'Confirmed', cls: 'bg-emerald-100 text-emerald-700' };
    if (t.status === 'REJECTED') return { label: 'Rejected', cls: 'bg-rose-100 text-rose-700' };
    if (t.status === 'CANCELLED') return { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' };
    if (t.status === 'ACTIVE') {
      return t.customer_utr
        ? { label: 'Pending verification', cls: 'bg-amber-100 text-amber-700' }
        : { label: 'Awaiting your payment', cls: 'bg-amber-100 text-amber-700' };
    }
    return { label: t.status, cls: 'bg-slate-100 text-slate-500' };
  };

  const rupees = Number(amountInput);
  const toUpPaise = Math.round(rupees * 100);
  const topUpValid =
    Number.isFinite(rupees) && rupees > 0 && toUpPaise >= 1 && toUpPaise <= quotaLeft && toUpPaise <= MONTHLY_TOPUP_CAP_PAISE;

  return (
    <div className="space-y-6">
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

      {/* Top-up requests (upi_payment_sessions / owner-RLS) */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-slate-900">Top-up requests</h3>
          <button
            onClick={() => void loadTopups()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {topupsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>

        {topups !== null && topups.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            No top-up requests yet — Add Balance to start.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {(topups ?? []).map((t) => {
              const st = topupStatus(t);
              return (
                <div key={t.id} className="rounded-xl border border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold text-slate-900">
                      {inr(Number(t.amount_paise) / 100)}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(t.created_at)}</p>
                  {t.customer_utr && (
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-600">UTR: {t.customer_utr}</p>
                  )}
                  {t.status === 'REJECTED' && t.admin_remark && (
                    <p className="mt-1 text-[11px] font-semibold text-rose-600">Reason: {t.admin_remark}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Wallet transaction history (ledger) */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-slate-900">Wallet Transaction History</h3>
          <button
            onClick={() => void loadLedger()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {ledgerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>

        {ledger !== null && ledger.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            No wallet activity yet — add balance to get started.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Date</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Type</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Category</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Amount</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Reference</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(ledger ?? []).map((t) => {
                  const amountRs = Number(t.amount) / 100;
                  const credit = t.type === 'CREDIT';
                  return (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{formatDateTime(t.created_at)}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            credit ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {credit ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                          {t.type}
                        </span>
                      </td>
                      <td className="flex items-center gap-1 whitespace-nowrap px-3 py-2.5 text-slate-600">
                        <ArrowLeftRight className="h-3 w-3 text-slate-300" />
                        {categoryLabel[t.category] ?? t.category}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2.5 font-semibold ${
                          credit ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {credit ? '+' : '−'}
                        {inr(amountRs)}
                      </td>
                      <td className="break-all px-3 py-2.5 font-mono text-[11px] text-slate-500">
                        {t.order_id ?? t.reference_id ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">
                        {inr(Number(t.balance_after) / 100)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>
      )}
    </div>
  );
}
