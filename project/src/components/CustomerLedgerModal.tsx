import { useEffect, useState } from 'react';
import { X, Wallet, ArrowDownCircle, ArrowUpCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { inr, formatDateTime } from '@/lib/format';
import type { CustomerLedgerEntry } from '@/lib/types';

export interface LedgerCustomer {
  sessionId: string;
  name: string;
  email: string;
  registered: true;
}

export default function CustomerLedgerModal({
  customer,
  onClose,
}: {
  customer: LedgerCustomer;
  onClose: () => void;
}) {
  const { push } = useToast();
  const [entries, setEntries] = useState<CustomerLedgerEntry[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [entriesRes, balanceRes] = await Promise.all([
          supabase
            .from('customer_ledger')
            .select('*')
            .eq('user_id', customer.sessionId)
            .order('created_at', { ascending: false }),
          supabase.rpc('get_customer_wallet_balance', { p_user_id: customer.sessionId }),
        ]);
        if (!active) return;
        if (entriesRes.error) throw entriesRes.error;
        if (balanceRes.error) throw balanceRes.error;
        setEntries((entriesRes.data ?? []) as CustomerLedgerEntry[]);
        setBalance(Number(balanceRes.data ?? 0));
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Failed to load wallet ledger.';
        setLoadError(message);
        push(message, 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [customer.sessionId, push]);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white shadow-glow">
        <div className="sticky top-0 z-10 bg-gradient-to-r from-brand-600 to-brand-800 rounded-t-3xl px-6 py-6 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 grid place-items-center h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-12 w-12 rounded-2xl bg-white/15 text-white font-display font-bold uppercase">
              {(customer.name || customer.email || '?').charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg font-extrabold truncate">{customer.name || 'Unnamed'}</p>
              <p className="text-xs text-white/75 truncate">{customer.email}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-white/10 backdrop-blur-sm p-4 flex items-center gap-3">
            <span className="grid place-items-center h-10 w-10 rounded-xl bg-white/15">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                Wallet balance
              </p>
              <p className="font-display text-2xl font-extrabold">
                {loading ? '…' : inr(balance ?? 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
            Transaction history
          </h4>

          {loading ? (
            <div className="grid gap-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 rounded-2xl shimmer" />
              ))}
            </div>
          ) : loadError ? (
            <div className="flex items-start gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {loadError}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-400">No transactions yet for this customer.</p>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {entries.map((entry) => {
                const isCredit = entry.transaction_type === 'credit';
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3"
                  >
                    <span
                      className={`grid place-items-center h-9 w-9 rounded-xl shrink-0 ${
                        isCredit ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {isCredit ? (
                        <ArrowDownCircle className="h-4.5 w-4.5" />
                      ) : (
                        <ArrowUpCircle className="h-4.5 w-4.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{entry.description}</p>
                      <p className="text-[11px] text-slate-400">{formatDateTime(entry.created_at)}</p>
                    </div>
                    <span
                      className={`font-display font-bold whitespace-nowrap ${
                        isCredit ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {isCredit ? '+' : '−'}
                      {inr(Number(entry.amount))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
