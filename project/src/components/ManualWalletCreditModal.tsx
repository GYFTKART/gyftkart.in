import { useState, useEffect, useCallback, useId } from 'react';
import {
  X,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { inrDecimal } from '@/lib/format';

export interface CustomerSummary {
  id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  wallet_balance?: number; // in Rupees
  customer_type?: 'B2C' | 'B2B';
  company_name?: string | null;
}

export type TargetCustomer = CustomerSummary;

interface ManualWalletCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialCustomer?: CustomerSummary | null;
}

const CREDIT_PRESETS = [100, 250, 500, 1000, 2000, 5000];
const DEBIT_PRESETS = [50, 100, 250, 500, 1000];

const CREDIT_REASONS = [
  'Promotional Goodwill Credit',
  'Offline Payment Received',
  'Dispute Resolution / Refund',
  'Loyalty Reward Bonus',
  'Account Reconciliation Correction',
];

const DEBIT_REASONS = [
  'Accidental Overcredit Reversal',
  'Order Cancellation Adjustment',
  'Manual Charge Deduction',
  'Dispute Resolution Reversal',
];

export default function ManualWalletCreditModal({
  isOpen,
  onClose,
  onSuccess,
  initialCustomer = null,
}: ManualWalletCreditModalProps) {
  const searchInputId = useId();
  const { push } = useToast();

  const [customer, setCustomer] = useState<CustomerSummary | null>(initialCustomer);
  const [customerSearch, setCustomerSearch] = useState('');
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<CustomerSummary[]>([]);

  const [actionType, setActionType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [amountStr, setAmountStr] = useState('');
  const [adminReason, setAdminReason] = useState('Promotional Goodwill Credit');
  const [referenceNote, setReferenceNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Live balance fetch for customer
  const fetchLiveBalance = useCallback(async (userId: string) => {
    setLoadingBalance(true);
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('Could not fetch wallet balance:', error.message);
      } else {
        const liveBalanceRs = Number(data?.balance || 0) / 100;
        setCustomer((prev) => (prev ? { ...prev, wallet_balance: liveBalanceRs } : null));
      }
    } catch (err) {
      console.error('Failed to fetch live balance:', err);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  // Sync state on modal open
  useEffect(() => {
    if (isOpen) {
      setCustomer(initialCustomer);
      setActionType('CREDIT');
      setAmountStr('');
      setAdminReason('Promotional Goodwill Credit');
      setReferenceNote('');
      setErrorMsg(null);
      setCustomerSearch('');
      setCustomerOptions([]);

      if (initialCustomer?.id) {
        void fetchLiveBalance(initialCustomer.id);
      }
    }
  }, [isOpen, initialCustomer, fetchLiveBalance]);

  // Customer search across profiles
  useEffect(() => {
    if (customer || !customerSearch.trim() || customerSearch.trim().length < 2) {
      setCustomerOptions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingCustomers(true);
      try {
        const query = customerSearch.trim();
        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, customer_type, company_name')
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%,company_name.ilike.%${query}%`)
          .limit(8);

        if (pErr) throw pErr;

        // Fetch balances
        const userIds = (profiles || []).map((p) => p.id);
        const { data: wallets } = await supabase
          .from('wallets')
          .select('user_id, balance')
          .in('user_id', userIds);

        const walletMap = new Map<string, number>();
        (wallets || []).forEach((w) => {
          walletMap.set(w.user_id, Number(w.balance || 0) / 100);
        });

        const list: CustomerSummary[] = (profiles || []).map((p) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          customer_type: p.customer_type,
          company_name: p.company_name,
          wallet_balance: walletMap.get(p.id) ?? 0,
        }));

        setCustomerOptions(list);
      } catch (err) {
        console.error('Customer search failed:', err);
      } finally {
        setSearchingCustomers(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [customerSearch, customer]);

  const handleSelectCustomer = (c: CustomerSummary) => {
    setCustomer(c);
    setCustomerSearch('');
    setCustomerOptions([]);
    void fetchLiveBalance(c.id);
  };

  const handleClearCustomer = () => {
    setCustomer(null);
    setCustomerSearch('');
  };

  const numAmount = parseFloat(amountStr) || 0;
  const currentBalance = customer?.wallet_balance ?? 0;
  const isDebit = actionType === 'DEBIT';
  const newBalance = isDebit ? currentBalance - numAmount : currentBalance + numAmount;
  const isDebitOverdraw = isDebit && numAmount > currentBalance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!customer?.id) {
      setErrorMsg('Please select a customer to proceed.');
      return;
    }

    if (numAmount <= 0) {
      setErrorMsg('Please enter a valid amount greater than ₹0.');
      return;
    }

    if (isDebitOverdraw) {
      setErrorMsg(
        `Insufficient balance. Current balance is ${inrDecimal(currentBalance)}, cannot deduct ${inrDecimal(numAmount)}.`
      );
      return;
    }

    if (!adminReason.trim()) {
      setErrorMsg('Please provide an administrative reason for this adjustment.');
      return;
    }

    setSubmitting(true);
    try {
      const generatedRef =
        referenceNote.trim() ||
        `MANUAL-${actionType === 'CREDIT' ? 'CR' : 'DR'}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // 1. Try atomic admin_credit_customer_wallet RPC
      const { data: rpcData, error } = await supabase.rpc('admin_credit_customer_wallet', {
        target_user_id: customer.id,
        credit_amount: numAmount,
        action_type: actionType,
        admin_reason: adminReason.trim(),
        reference_note: generatedRef,
      });

      if (error) {
        console.warn('admin_credit_customer_wallet error, falling back to admin_adjust_customer_balance:', error.message);
        const amountPaise = Math.round(numAmount * 100);
        const { error: fallbackErr } = await supabase.rpc('admin_adjust_customer_balance', {
          p_customer_id: customer.id,
          p_amount_paise: amountPaise,
          p_type: actionType,
          p_category: 'ADJUSTMENT',
          p_remark: `${adminReason.trim()} · Ref: ${generatedRef}`,
        });

        if (fallbackErr) {
          throw new Error(fallbackErr.message || error.message || 'Failed to adjust balance');
        }
      }

      const successBalance = rpcData?.new_balance ?? newBalance;
      push(
        `Successfully ${actionType === 'CREDIT' ? 'credited' : 'debited'} ${inrDecimal(numAmount)} for ${customer.company_name || customer.full_name || customer.email}. New Balance: ${inrDecimal(successBalance)}.`,
        'success'
      );

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Failed to adjust wallet balance:', err);
      const msg = err instanceof Error ? err.message : 'Failed to adjust wallet balance';
      setErrorMsg(msg);
      push(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <span
              className={`grid place-items-center h-10 w-10 rounded-2xl ${
                actionType === 'CREDIT'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-rose-100 text-rose-700'
              }`}
            >
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <h2 id="modal-title" className="text-base font-bold text-slate-900">
                Manual Wallet Adjustment
              </h2>
              <p className="text-xs text-slate-500">
                Direct balance credit or debit with atomic ledger audit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl flex items-center gap-2.5 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Type Toggle */}
          <div>
            <label className="block text-slate-700 font-bold mb-1.5">Action Type</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => setActionType('CREDIT')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-all ${
                  actionType === 'CREDIT'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowDownLeft className="h-4 w-4" /> Credit (+) Add Balance
              </button>
              <button
                type="button"
                onClick={() => setActionType('DEBIT')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-all ${
                  actionType === 'DEBIT'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowUpRight className="h-4 w-4" /> Debit (-) Deduct
              </button>
            </div>
          </div>

          {/* Customer Selection */}
          <div>
            <label htmlFor={searchInputId} className="block text-slate-700 font-bold mb-1.5">Target Customer</label>

            {customer ? (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900 truncate">
                      {customer.company_name || customer.full_name || customer.email || 'Customer'}
                    </p>
                    {customer.customer_type && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 text-slate-700">
                        {customer.customer_type}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                    {customer.email || customer.phone || customer.id}
                  </p>
                  <p className="text-xs font-semibold text-brand-700 mt-1 flex items-center gap-1">
                    Current Wallet Balance:{' '}
                    {loadingBalance ? (
                      <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                    ) : (
                      <span className="font-bold text-slate-900">{inrDecimal(currentBalance)}</span>
                    )}
                  </p>
                </div>
                {!initialCustomer && (
                  <button
                    type="button"
                    onClick={handleClearCustomer}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition shrink-0"
                  >
                    Change
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    id={searchInputId}
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customer by name, email, phone, or company..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs"
                  />
                  {searchingCustomers && (
                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-brand-600" />
                  )}
                </div>

                {customerOptions.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1.5 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl z-20 divide-y divide-slate-100">
                    {customerOptions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className="w-full text-left p-3 hover:bg-slate-50 flex items-center justify-between gap-3 transition"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">
                            {c.company_name || c.full_name || c.email || 'Customer'}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono truncate">{c.email || c.phone}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                            {inrDecimal(c.wallet_balance ?? 0)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-slate-700 font-bold">Adjustment Amount (₹)</label>
              {customer && (
                <span className="text-[11px] text-slate-400">
                  Current: {inrDecimal(currentBalance)}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs"
                required
              />
            </div>

            {/* Quick preset chips */}
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
              {(actionType === 'CREDIT' ? CREDIT_PRESETS : DEBIT_PRESETS).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmountStr(preset.toString())}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                >
                  {actionType === 'CREDIT' ? `+₹${preset}` : `-₹${preset}`}
                </button>
              ))}
              {actionType === 'DEBIT' && currentBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmountStr(currentBalance.toString())}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition"
                >
                  Clear All ({inrDecimal(currentBalance)})
                </button>
              )}
            </div>
          </div>

          {/* Real-time Balance Preview */}
          {customer && numAmount > 0 && (
            <div
              className={`p-3.5 rounded-2xl border ${
                isDebitOverdraw
                  ? 'bg-rose-50/80 border-rose-200 text-rose-800'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">Current Balance:</span>
                <span className="font-semibold text-slate-700">{inrDecimal(currentBalance)}</span>
              </div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-500">
                  {actionType === 'CREDIT' ? 'Credit Addition:' : 'Debit Deduction:'}
                </span>
                <span className={`font-bold ${actionType === 'CREDIT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {actionType === 'CREDIT' ? `+${inrDecimal(numAmount)}` : `-${inrDecimal(numAmount)}`}
                </span>
              </div>
              <div className="pt-1.5 border-t border-slate-200/80 flex items-center justify-between font-bold text-xs">
                <span>Resulting Balance:</span>
                <span className={isDebitOverdraw ? 'text-rose-600' : 'text-slate-900 font-extrabold text-sm'}>
                  {isDebitOverdraw ? 'Insufficient Funds' : inrDecimal(newBalance)}
                </span>
              </div>
            </div>
          )}

          {/* Admin Reason */}
          <div>
            <label className="block text-slate-700 font-bold mb-1.5">
              Reason / Remarks <span className="text-slate-400 font-normal">(Recorded in Ledger)</span>
            </label>
            <input
              type="text"
              value={adminReason}
              onChange={(e) => setAdminReason(e.target.value)}
              placeholder="e.g. Promotional Goodwill Credit, offline payment"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs"
              required
            />
            {/* Quick reason chips */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {(actionType === 'CREDIT' ? CREDIT_REASONS : DEBIT_REASONS).map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setAdminReason(reason)}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          {/* Reference Note (Optional) */}
          <div>
            <label className="block text-slate-700 font-bold mb-1.5">
              Reference Note <span className="text-slate-400 font-normal">(Optional ticket or transaction ID)</span>
            </label>
            <input
              type="text"
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
              placeholder="e.g. MANUAL-REF-8902 or OFFLINE-UPI"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs"
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !customer || numAmount <= 0 || isDebitOverdraw}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed ${
                actionType === 'CREDIT'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {actionType === 'CREDIT' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {actionType === 'CREDIT'
                    ? `Confirm Credit ${numAmount > 0 ? inrDecimal(numAmount) : ''}`
                    : `Confirm Debit ${numAmount > 0 ? inrDecimal(numAmount) : ''}`}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
