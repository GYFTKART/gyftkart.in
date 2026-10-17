import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { inr, formatDateTime } from '@/lib/format';

type UpSession = {
  id: string;
  order_id: string;
  user_id: string;
  amount_paise: number | string;
  status: string;
  bank_ref: string | null;
  verification_level: string | null;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
};

const statusStyle: Record<string, string> = {
  SUCCESS: 'bg-emerald-100 text-emerald-800',
  ACTIVE: 'bg-amber-100 text-amber-800',
  INITIATED: 'bg-slate-100 text-slate-700',
  EXPIRED: 'bg-slate-100 text-slate-500',
  FAILED: 'bg-rose-100 text-rose-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
};

export default function AdminPaymentsTab() {
  const [sessions, setSessions] = useState<UpSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [utrDrafts, setUtrDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('upi_payment_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setMessage({ kind: 'err', text: `Load failed: ${error.message}` });
    }
    setSessions((data ?? []) as UpSession[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async (s: UpSession) => {
    const utr = (utrDrafts[s.id] ?? '').trim();
    if (utr.length < 6) {
      setMessage({ kind: 'err', text: 'Enter the bank reference / UTR first.' });
      return;
    }
    setConfirmingId(s.id);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke('upi-manual-confirm', {
      body: {
        payment_id: s.id,
        order_id: s.order_id,
        bank_ref: utr,
        amount_rupees: Number(s.amount_paise) / 100,
      },
    });
    setConfirmingId(null);
    if (error) {
      setMessage({ kind: 'err', text: error.message });
      return;
    }
    if (data?.error) {
      setMessage({ kind: 'err', text: data.error });
      return;
    }
    setMessage({ kind: 'ok', text: `Confirmed ${s.order_id} against UTR ${utr}. Order recorded.` });
    void load();
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-emerald-600" /> UPI Direct Payments
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Confirm a session when you've seen the credit in your bank — paste the bank reference (UTR). razorpay stays the default; this only applies to "UPI Direct" sessions.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 px-3 py-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {message && (
        <p
          className={`mt-3 text-xs font-semibold rounded-lg px-3 py-2 ${
            message.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}
        >
          {message.text}
        </p>
      )}

      {loading ? (
        <div className="grid gap-2 mt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl shimmer" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">No direct-UP sessions yet.</p>
      ) : (
        <div className="mt-4 divide-y divide-slate-100">
          {sessions.map((s) => (
            <div key={s.id} className="py-3 flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {s.order_id}
                  <span
                    className={`ml-2 align-middle rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      statusStyle[s.status] ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {s.status}
                    {s.verification_level === 'MANUAL' ? ' · manual' : s.verification_level === 'GMAIL' ? ' · observer' : ''}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {inr(Number(s.amount_paise) / 100)} · {formatDateTime(s.created_at)}
                  {s.bank_ref ? ` · UTR ${s.bank_ref}` : ''}
                  {s.status === 'ACTIVE' ? ` · expires ${formatDateTime(s.expires_at)}` : ''}
                </p>
              </div>
              {(s.status === 'ACTIVE' || s.status === 'INITIATED') && (
                <div className="flex items-center gap-2">
                  <input
                    value={utrDrafts[s.id] ?? ''}
                    onChange={(e) =>
                      setUtrDrafts((d) => ({ ...d, [s.id]: e.target.value }))
                    }
                    placeholder="Bank ref / UTR"
                    className="w-36 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                  />
                  <button
                    onClick={() => void confirm(s)}
                    disabled={confirmingId === s.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {confirmingId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Confirm
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
