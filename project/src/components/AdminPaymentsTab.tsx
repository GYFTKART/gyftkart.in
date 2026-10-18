import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Loader2, RefreshCw, Search, Smartphone, XCircle } from 'lucide-react';
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
  buyer: { name?: string; email?: string } | null;
  customer_utr: string | null;
  admin_remark: string | null;
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
  REJECTED: 'bg-rose-100 text-rose-700',
};

const REJECT_REASONS = ['Invalid UTR', 'Amount mismatch', 'Screenshot unreadable'];

const isLocalToday = (iso: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

// CSV cells must stay single-line: the multiline-JSON trap chokes the
// escaper and splits rows, so every value is flattened first.
const csvCell = (v: unknown) => {
  const flat = String(v ?? '').replace(/\r?\n|\r/g, ' ').trim();
  return `"${flat.replace(/"/g, '""')}"`;
};

function buyerOf(b: UpSession['buyer']) {
  return { name: b?.name ?? '', email: b?.email ?? '' };
}

export default function AdminPaymentsTab() {
  const [sessions, setSessions] = useState<UpSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [utrDrafts, setUtrDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<UpSession | null>(null);
  const [rejectRemark, setRejectRemark] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('upi_payment_sessions')
      .select('*')
      .or('customer_utr.not.is.null,proof_path.not.is.null')
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

  const openReject = (s: UpSession) => {
    setRejectTarget(s);
    setRejectRemark('');
    setRejectError(null);
  };

  const submitReject = async () => {
    const remark = rejectRemark.trim();
    if (!rejectTarget) return;
    if (remark.length < 3) {
      setRejectError('Rejection remark is mandatory (min 3 chars).');
      return;
    }
    if (remark.length > 500) {
      setRejectError('Rejection remark too long (max 500 chars).');
      return;
    }
    setRejecting(true);
    setRejectError(null);
    const { data, error } = await supabase.functions.invoke('upi-reject-payment', {
      body: { payment_id: rejectTarget.id, remark },
    });
    setRejecting(false);
    if (error) {
      setRejectError(error.message);
      return;
    }
    if (data?.error) {
      setRejectError(data.error);
      return;
    }
    setMessage({ kind: 'ok', text: `Rejected ${rejectTarget.order_id}: ${remark}` });
    setRejectTarget(null);
    void load();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const buyer = buyerOf(s.buyer);
      return (
        s.order_id.toLowerCase().includes(q) ||
        s.user_id.toLowerCase().includes(q) ||
        (s.customer_utr ?? '').toLowerCase().includes(q) ||
        s.bank_ref?.toLowerCase().includes(q) ||
        buyer.name.toLowerCase().includes(q) ||
        buyer.email.toLowerCase().includes(q)
      );
    });
  }, [sessions, search]);

  const stats = useMemo(() => {
    let confirmedPaise = 0;
    let pending = 0;
    let rejected = 0;
    let created = 0;
    for (const s of sessions) {
      if (isLocalToday(s.created_at)) created += 1;
      if (s.status === 'SUCCESS' && isLocalToday(s.completed_at)) confirmedPaise += Number(s.amount_paise);
      if ((s.status === 'INITIATED' || s.status === 'ACTIVE') && isLocalToday(s.created_at)) pending += 1;
      if (s.status === 'REJECTED' && isLocalToday(s.completed_at)) rejected += 1;
    }
    return { created, confirmedPaise, pending, rejected };
  }, [sessions]);

  const exportCsv = () => {
    const header = ['created_at', 'order_id', 'payment_session_id', 'status', 'amount_rupees', 'buyer_name', 'buyer_email', 'user_id', 'customer_utr', 'verified_utr', 'admin_remark', 'completed_at'];
    const rows = filtered.map((s) => {
      const buyer = buyerOf(s.buyer);
      return [
        s.created_at,
        s.order_id,
        s.id,
        s.status,
        (Number(s.amount_paise) / 100).toFixed(2),
        buyer.name,
        buyer.email,
        s.user_id,
        s.customer_utr ?? '',
        s.bank_ref ?? '',
        s.admin_remark ?? '',
        s.completed_at ?? '',
      ];
    });
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upi-direct-daily-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

      {/* Daily stats bar */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Created today</p>
          <p className="text-sm font-bold text-slate-900">{stats.created}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-500">Confirmed today</p>
          <p className="text-sm font-bold text-emerald-700">{inr(stats.confirmedPaise / 100)}</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-500">Pending today</p>
          <p className="text-sm font-bold text-amber-700">{stats.pending}</p>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-rose-500">Rejected today</p>
          <p className="text-sm font-bold text-rose-700">{stats.rejected}</p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" /> Export Daily Report (CSV)
        </button>
      </div>

      {/* Search */}
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order id, UTR, customer name/email, user id…"
          className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-slate-400"
        />
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
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">{sessions.length === 0 ? 'No direct-UP sessions yet.' : 'No sessions match this search.'}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[880px] text-left text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">User / Customer</th>
                <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Reference</th>
                <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Date &amp; Time</th>
                <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const buyer = buyerOf(s.buyer);
                return (
                  <tr key={s.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-600">{buyer.name || buyer.email || 'Customer'}</p>
                      <p className="break-all text-[11px] text-slate-500">{buyer.email}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400 break-all">
                        user <span className="font-mono">{s.user_id}</span>
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="whitespace-nowrap font-bold text-slate-900">{s.order_id}</p>
                      <p className="mt-0.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            s.status === 'INITIATED' || s.status === 'ACTIVE'
                              ? 'bg-amber-100 text-amber-800'
                              : (statusStyle[s.status] ?? 'bg-slate-100 text-slate-600')
                          }`}
                        >
                          {s.status === 'INITIATED' || s.status === 'ACTIVE' ? 'PENDING VERIFICATION' : s.status}
                          {s.verification_level === 'MANUAL' ? ' · manual' : s.verification_level === 'GMAIL' ? ' · observer' : ''}
                        </span>
                      </p>
                      {s.customer_utr ? (
                        <p className="mt-0.5 break-all text-[11px] text-slate-500">customer UTR {s.customer_utr}</p>
                      ) : null}
                      {s.bank_ref ? (
                        <p className="mt-0.5 break-all text-[11px] text-emerald-700">verified UTR {s.bank_ref}</p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {inr(Number(s.amount_paise) / 100)}
                      </p>
                      {s.admin_remark && (
                        <p className="mt-0.5 text-[11px] font-semibold text-rose-600">Remark: {s.admin_remark}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-600">Created</span>{' '}
                        <span className="whitespace-nowrap text-slate-900">{formatDateTime(s.created_at)}</span>
                      </p>
                      {s.completed_at && (
                        <p className="text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-600">Completed</span>{' '}
                          <span className="whitespace-nowrap text-slate-900">{formatDateTime(s.completed_at)}</span>
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {(s.status === 'ACTIVE' || s.status === 'INITIATED') ? (
                        <div className="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
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
                          <button
                            onClick={() => openReject(s)}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <p className="whitespace-nowrap text-[11px] text-slate-400">No action</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={() => !rejecting && setRejectTarget(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900">Reject session {rejectTarget.order_id}</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Marks the {rejectTarget.status} session REJECTED and records the remark. The customer's submitted evidence is kept for the audit trail. This cannot be undone — to accept the payment instead, use Confirm.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {REJECT_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRejectRemark(r)}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={rejectRemark}
              onChange={(e) => {
                setRejectRemark(e.target.value);
                setRejectError(null);
              }}
              rows={3}
              maxLength={500}
              placeholder="Rejection remark (mandatory, 3–500 chars)"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400"
            />
            {rejectError && <p className="mt-1 text-[11px] font-semibold text-rose-600">{rejectError}</p>}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => setRejectTarget(null)}
                disabled={rejecting}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitReject()}
                disabled={rejecting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {rejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Reject session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
