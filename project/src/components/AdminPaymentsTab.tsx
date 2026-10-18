import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, ImageOff, Loader2, RefreshCw, Search, Smartphone, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { inr, formatDateTime } from '@/lib/format';
import { useAdminAuth } from '@/context/AdminAuthContext';

type UpSession = {
  id: string;
  order_id: string;
  user_id: string;
  amount_paise: number | string;
  status: string;
  bank_ref: string | null;
  verification_level: string | null;
  buyer: { name?: string; email?: string } | null;
  items: unknown[] | null;
  category: string;
  customer_utr: string | null;
  proof_path: string | null;
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
const PAGE_SIZES = [10, 20, 30, 40, 50];
const FETCH_CAP = 500;

const isLocalToday = (iso: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

const localDay = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
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

type ItemView = { label: string; size: string };

// Session items are stored as cart-item snapshots
// (brand_name/brand/gift-card name + denomination/amount + quantity);
// parse defensively so odd rows never crash the table.
function itemsOf(s: UpSession): ItemView[] {
  if (!Array.isArray(s.items)) return [];
  return s.items
    .map((raw) => {
      const it = raw as Record<string, unknown> | null;
      if (!it || typeof it !== 'object') return null;
      const brand = String(it.brand ?? it.brand_name ?? '').trim();
      const nameRaw = String(it.name ?? it.gift_card_name ?? it.brand_name ?? '').trim();
      const denom = Number(it.amount ?? it.denomination ?? 0) || 0;
      const qty = Math.max(1, Number(it.quantity ?? it.qty ?? 1) || 1);
      // When brand and gift-card name are the same ("GyftKart GyftKart"),
      // say it once — compare on whitespace-collapsed lowercase.
      const dup = brand.toLowerCase().replace(/\s+/g, ' ') === nameRaw.toLowerCase().replace(/\s+/g, ' ');
      const label = dup ? brand : [brand, nameRaw].filter(Boolean).join(' ');
      return { label: label || 'Gift card', size: `${inr(denom)} × ${qty}` };
    })
    .filter((v): v is ItemView => v !== null);
}

const shortOrderId = (id: string) => (id.length > 13 ? `${id.slice(0, 13)}…` : id);

type DateMode = 'all' | 'today' | 'yesterday' | 'week' | 'custom';

export default function AdminPaymentsTab() {
  // Admin tokens come from the ISOLATED admin session cache (separate
  // storage key) — a customer sign-in on this tab can never swap the
  // bearer under the confirm/reject calls again (403 'Admins only').
  const { admin: authSession } = useAdminAuth();
  const [sessions, setSessions] = useState<UpSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<UpSession | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [dateMode, setDateMode] = useState<DateMode>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rejectTarget, setRejectTarget] = useState<UpSession | null>(null);
  const [rejectRemark, setRejectRemark] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [proofPreview, setProofPreview] = useState<{ url: string; path: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('upi_payment_sessions')
      .select('*, items')
      .or('customer_utr.not.is.null,proof_path.not.is.null')
      .order('created_at', { ascending: false })
      .limit(FETCH_CAP);
    if (error) {
      setMessage({ kind: 'err', text: `Load failed: ${error.message}` });
    }
    setSessions((data ?? []) as UpSession[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The Supabase singleton has persistSession:false and
  // autoRefreshToken:false, and the auth context refreshes only on mount;
  // a tab left open past the ~1h token expiry holds an expired
  // access_token, so tokens are resolved at CALL time. NO cross-identity
  // fallback: if the ADMIN cache holds no tokens we resolve to null and
  // the pre-flight guard stops the request — a shared/customer session
  // on the singleton is NEVER used as the admin's bearer (that silently
  // mailed a non-admin identity → 403 'Admins only' with a valid Bearer).
  const resolveAdminBearer = async (): Promise<{ token: string; via: 'refresh' | 'cache' } | null> => {
    const refreshToken = authSession?.refreshToken;
    if (refreshToken) {
      try {
        const { data } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        const fresh = data.session?.access_token;
        if (fresh) return { token: fresh, via: 'refresh' };
      } catch {
        /* refresh rejections fall through to the cached admin token */
      }
    }
    const cached = authSession?.token;
    return cached ? { token: cached, via: 'cache' } : null;
  };

  // Direct-transport debug (god-directed): makes the human's next console
  // contact decisive. The token itself is never logged in full.
  // TODO: REMOVE once the transport mystery is closed.
  const adminFnDebug = (fn: string, r: { token: string; via: 'refresh' | 'cache' } | null) => {
    console.log(
      `[admin-fn-debug] fn:${fn} resolvedToken:${r ? 'present' : 'none'} ` +
        `len:${r ? r.token.length : 'n/a'} tail:${r ? r.token.slice(-4) : 'n/a'} path:${r ? r.via : 'none'}`
    );
  };

  // HTTP POST straight to the /functions/v1 endpoint — the SDK-level
  // transport (supabase.functions.invoke) is bypassed so any remaining
  // 401/403 is observable at the wire level.
  const fnPost = async (
    fn: string,
    body: unknown
  ): Promise<{ ok: boolean; json: Record<string, unknown> | null; status: number }> => {
    const bearer = await resolveAdminBearer();
    if (!bearer) {
      return { ok: false, json: { error: 'Admin session expired — please sign in again and retry.' }, status: 0 };
    }
    adminFnDebug(fn, bearer);
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${bearer.token}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, json, status: res.status };
  };

  const confirm = async (s: UpSession) => {
    const bankRef = (s.customer_utr ?? '').trim();
    if (!bankRef) {
      setMessage({ kind: 'err', text: 'This session has no customer UTR to confirm against.' });
      return;
    }
    if (!authSession?.token) {
      setMessage({ kind: 'err', text: 'Admin session expired — please sign in again and retry.' });
      return;
    }
    setConfirmingId(s.id);
    setMessage(null);
    const res = await fnPost('upi-manual-confirm', {
      payment_id: s.id,
      order_id: s.order_id,
      bank_ref: bankRef,
      amount_rupees: Number(s.amount_paise) / 100,
    });
    setConfirmingId(null);
    const json = res.json ?? {};
    if (json && typeof json.error === 'string' && json.error) {
      setMessage({ kind: 'err', text: json.error });
      return;
    }
    if (!res.ok) {
      setMessage({ kind: 'err', text: `Confirmation failed (HTTP ${res.status || 'transport'})` });
      return;
    }
    setMessage({ kind: 'ok', text: `Confirmed ${s.order_id} against UTR ${bankRef}. Order recorded.` });
    setConfirmTarget(null);
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
    if (!authSession?.token) {
      setRejectError('Admin session expired — please sign in again and retry.');
      return;
    }
    setRejecting(true);
    setRejectError(null);
    const res = await fnPost('upi-reject-payment', { payment_id: rejectTarget.id, remark });
    setRejecting(false);
    const json = res.json ?? {};
    if (json && typeof json.error === 'string' && json.error) {
      setRejectError(json.error);
      return;
    }
    if (!res.ok) {
      setRejectError(`Rejection failed (HTTP ${res.status || 'transport'})`);
      return;
    }
    setMessage({ kind: 'ok', text: `Rejected ${rejectTarget.order_id}: ${remark}` });
    setRejectTarget(null);
    void load();
  };

  const openProofPreview = async (s: UpSession) => {
    if (!s.proof_path) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setProofPreview(null);
    const { data, error } = await supabase.storage
      .from('upi-payment-proofs')
      .createSignedUrl(s.proof_path, 60);
    setPreviewLoading(false);
    if (error || !data?.signedUrl) {
      setPreviewError(error?.message ?? 'Could not open the screenshot.');
      return;
    }
    setProofPreview({ url: data.signedUrl, path: s.proof_path });
  };

  const inDateRange = useCallback(
    (iso: string | null) => {
      if (dateMode === 'all') return true;
      const day = localDay(iso);
      if (day === null) return false;
      if (dateMode === 'today' || dateMode === 'yesterday') {
        const now = new Date();
        const offset = dateMode === 'today' ? 0 : 1;
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset).getTime();
        return day === target;
      }
      if (dateMode === 'week') {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
        return day >= start && day <= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      }
      const from = customFrom ? new Date(customFrom + 'T00:00:00').getTime() : null;
      const to = customTo ? new Date(customTo + 'T00:00:00').getTime() : null;
      if (from !== null && day < from) return false;
      if (to !== null && day > to) return false;
      return from !== null || to !== null;
    },
    [dateMode, customFrom, customTo]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (!inDateRange(s.created_at)) return false;
      if (!q) return true;
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
  }, [sessions, search, inDateRange]);

  const stats = useMemo(() => {
    let confirmedPaise = 0;
    let pending = 0;
    let rejected = 0;
    let created = 0;
    let topups = 0;
    let topupsConfirmedPaise = 0;
    for (const s of sessions) {
      if (isLocalToday(s.created_at)) created += 1;
      if (s.status === 'SUCCESS' && isLocalToday(s.completed_at)) confirmedPaise += Number(s.amount_paise);
      if ((s.status === 'INITIATED' || s.status === 'ACTIVE') && isLocalToday(s.created_at)) pending += 1;
      if (s.status === 'REJECTED' && isLocalToday(s.completed_at)) rejected += 1;
      if (s.category === 'TOPUP') {
        if (isLocalToday(s.created_at)) topups += 1;
        if (s.status === 'SUCCESS' && isLocalToday(s.completed_at)) topupsConfirmedPaise += Number(s.amount_paise);
      }
    }
    return { created, confirmedPaise, pending, rejected, topups, topupsConfirmedPaise };
  }, [sessions]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize]
  );
  const showingFrom = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);

  const pageButtons: (number | 'gap')[] = useMemo(() => {
    const nums = new Set(
      [1, currentPage - 1, currentPage, currentPage + 1, pageCount].filter((n) => n >= 1 && n <= pageCount)
    );
    const sorted = [...nums].sort((a, b) => a - b);
    const out: (number | 'gap')[] = [];
    let prev = 0;
    for (const n of sorted) {
      if (n - prev > 1) out.push('gap');
      out.push(n);
      prev = n;
    }
    return out;
  }, [currentPage, pageCount]);

  const exportCsv = () => {
    const header = ['created_at', 'order_id', 'payment_session_id', 'status', 'category', 'amount_rupees', 'buyer_name', 'buyer_email', 'user_id', 'customer_utr', 'verified_utr', 'admin_remark', 'completed_at'];
    const rows = filtered.map((s) => {
      const buyer = buyerOf(s.buyer);
      return [
        s.created_at,
        s.order_id,
        s.id,
        s.status,
        s.category,
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

  const topSelectClass =
    'rounded-lg border border-slate-200 py-2 px-3 text-xs outline-none focus:border-slate-400';

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-emerald-600" /> UPI Direct Payments
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Confirm a session when you've verified the credit in your bank against the customer's UTR. razorpay stays the default; this only applies to "UPI Direct" sessions.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 px-3 py-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Daily stats bar (all proof-bearing sessions of today — day stats, not table stats) */}
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
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
        <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-sky-500">Top-ups today</p>
          <p className="text-sm font-bold text-sky-700">{stats.topups}</p>
        </div>
        <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-sky-500">Top-up amount (confirmed)</p>
          <p className="text-sm font-bold text-sky-700">{inr(stats.topupsConfirmedPaise / 100)}</p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" /> Export Daily Report (CSV)
        </button>
      </div>

      {/* Search + date filter + rows-per-page (combined AND) */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search order id, UTR, customer name/email, user id…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-slate-400"
          />
        </div>
        <div className="flex flex-nowrap items-center gap-2">
          <select
            value={dateMode}
            onChange={(e) => {
              setDateMode(e.target.value as DateMode);
              setPage(1);
            }}
            className={`${topSelectClass} shrink-0`}
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">Last 7 Days</option>
            <option value="custom">Custom</option>
          </select>
          {dateMode === 'custom' && (
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                setPage(1);
              }}
              className={`${topSelectClass} w-36`}
            />
          )}
          {dateMode === 'custom' && (
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => {
                setCustomTo(e.target.value);
                setPage(1);
              }}
              className={`${topSelectClass} w-36 shrink-0`}
            />
          )}
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className={`${topSelectClass} py-1`}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {message && (
        <div
          className={`mt-3 text-xs font-semibold rounded-lg px-3 py-2 ${
            message.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}
        >
          <p>{message.text}</p>
          {message.kind === 'err' && (
            <p className="mt-1 text-[11px] font-normal text-slate-500">
              Admin identity: <span className="font-mono">{authSession?.email || '—'}</span>
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid gap-2 mt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">{sessions.length === 0 ? 'No proof-bearing sessions yet.' : 'No sessions match these filters.'}</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1120px] text-left text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">User / Customer</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Reference</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Order / Item</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Amount</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Date &amp; Time</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">UTR &amp; Proof</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const buyer = buyerOf(s.buyer);
                  const items = itemsOf(s);
                  return (
                    <tr key={s.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-3 min-w-[10rem]">
                        {buyer.name ? (
                          <p className="truncate font-semibold text-slate-600">{buyer.name}</p>
                        ) : (
                          <p className="truncate font-semibold text-slate-400">Unnamed customer</p>
                        )}
                        <p className="break-all text-[11px] text-slate-500">{buyer.email || '—'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="whitespace-nowrap font-bold text-slate-900">{s.order_id}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1">
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
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              s.category === 'TOPUP'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {s.category === 'TOPUP' ? 'TOPUP' : 'VOUCHER'}
                          </span>
                        </p>
                      </td>
                      <td className="px-3 py-3 min-w-[12rem]">
                        {items.length === 0 ? (
                          <p className="text-[11px] text-slate-400">—</p>
                        ) : (
                          <p className="truncate text-[11px] text-slate-600" title={items.map((it) => `${it.label} (${it.size})`).join(' · ')}>
                            {items.slice(0, 2).map((it) => `${it.label} · ${it.size}`).join('  ·  ')}
                            {items.length > 2 ? ` · +${items.length - 2} more` : ''}
                          </p>
                        )}
                        {!s.order_id.startsWith('UPI-') && (
                          <p
                            className="mt-0.5 whitespace-nowrap font-mono text-[11px] font-semibold text-slate-900"
                            title={s.order_id}
                          >
                            Order #{shortOrderId(s.order_id)}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-900">
                        {inr(Number(s.amount_paise) / 100)}
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
                        {s.customer_utr ? (
                          <p className="break-all font-mono text-[11px] font-semibold text-slate-900">{s.customer_utr}</p>
                        ) : (
                          <p className="text-[11px] text-slate-400">—</p>
                        )}
                        {s.bank_ref && (
                          <p className="break-all text-[11px] text-emerald-700">verified {s.bank_ref}</p>
                        )}
                        <button
                          onClick={() => void openProofPreview(s)}
                          disabled={!s.proof_path || previewLoading}
                          title={s.proof_path ? 'View screenshot' : 'No screenshot'}
                          className={`mt-1 inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold ${
                            s.proof_path
                              ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              : 'border-slate-100 text-slate-400'
                          } disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                          {previewLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : s.proof_path ? (
                            <Eye className="h-3 w-3" />
                          ) : (
                            <ImageOff className="h-3 w-3" />
                          )}
                          {s.proof_path ? 'View screenshot' : 'No screenshot'}
                        </button>
                        {!s.proof_path && <p className="mt-0.5 text-[10px] text-slate-400">none uploaded</p>}
                        {s.admin_remark && (
                          <p className="mt-1 text-[11px] font-semibold text-rose-600">Remark: {s.admin_remark}</p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {(s.status === 'ACTIVE' || s.status === 'INITIATED') ? (
                          <div className="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
                            <button
                              onClick={() => setConfirmTarget(s)}
                              disabled={confirmingId === s.id || !s.customer_utr}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
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

          {/* Pagination footer (rows-per-page selects live in the top filter bar) */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <p>
              Showing {showingFrom}–{showingTo} of {filtered.length} results
              {sessions.length >= FETCH_CAP ? ' (showing latest 500)' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              {pageButtons.map((p, i) =>
                p === 'gap' ? (
                  <span key={`gap-${i}`} className="px-0.5">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[1.75rem] rounded-lg px-1.5 py-1 font-bold ${
                      p === currentPage
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= pageCount}
                className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Screenshot preview modal (signed URL, valid 60s) */}
      {previewError && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={() => setPreviewError(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold text-rose-600">{previewError}</p>
            <button
              onClick={() => setPreviewError(null)}
              className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {(proofPreview || previewLoading) && !previewError && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
          onClick={() => !previewLoading && setProofPreview(null)}
        >
          <div className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-bold text-slate-900">{proofPreview?.path}</p>
              <button
                onClick={() => setProofPreview(null)}
                disabled={previewLoading}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            {previewLoading ? (
              <div className="mt-4 grid place-items-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <img src={proofPreview!.url} alt="Payment proof screenshot" className="mx-auto max-h-[70vh] rounded-xl" />
                <p className="mt-2 text-center">
                  <a
                    href={proofPreview!.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-brand-700 hover:text-brand-800"
                  >
                    open in new tab
                  </a>
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm modal (keyed to the session row, safe across search/filters) */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={() => !confirmingId && setConfirmTarget(null)}>
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-slate-900">Confirm Payment Verification</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              I've checked my bank statement / app and verified the customer's credit against the UTR they reported.
            </p>
            <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-xs">
              <p className="flex justify-between gap-3">
                <span className="font-semibold text-slate-500">Customer name</span>
                <span className="text-right text-slate-900">{buyerOf(confirmTarget.buyer).name || 'Unnamed customer'}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span className="font-semibold text-slate-500">UTR number</span>
                <span className="text-right font-mono text-slate-900">{confirmTarget.customer_utr ?? '—'}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span className="font-semibold text-slate-500">Amount</span>
                <span className="text-right font-semibold text-emerald-700">{inr(Number(confirmTarget.amount_paise) / 100)}</span>
              </p>
            </div>
            <p className="mt-3 text-[11px] font-semibold text-amber-700">
              Are you sure you want to approve this UPI payment? This will mark the order as paid and deliver the gift card.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={confirmingId === confirmTarget.id}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirm(confirmTarget)}
                disabled={confirmingId === confirmTarget.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {confirmingId === confirmTarget.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Yes, Confirm Payment
              </button>
            </div>
          </div>
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
            {rejectError && (
              <p className="mt-1 text-[11px] font-semibold text-rose-600">
                {rejectError}
                <span className="ml-2 font-normal text-slate-500">
                  Admin identity: <span className="font-mono">{authSession?.email || '—'}</span>
                </span>
              </p>
            )}
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
