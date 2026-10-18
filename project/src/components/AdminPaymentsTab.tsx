import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Smartphone,
  X,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { inr, formatDateTime } from '@/lib/format';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';
import { OrderInvoiceModal } from '@/components/OrderInvoiceModal';
import { extractInvoiceItems, type InvoiceData } from '@/lib/invoice';

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
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  ACTIVE: 'bg-amber-100 text-amber-800',
  INITIATED: 'bg-slate-100 text-slate-700',
  EXPIRED: 'bg-slate-100 text-slate-500',
  FAILED: 'bg-rose-100 text-rose-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
  REJECTED: 'bg-rose-100 text-rose-700',
  REVERTED: 'bg-slate-100 text-slate-700 border border-slate-200',
};

const REJECT_REASONS = ['Invalid UTR', 'Amount mismatch', 'Screenshot unreadable'];
const REVERT_REASONS = [
  'Approved in error / payment not credited',
  'Customer requested cancellation',
  'UTR verification mismatch',
  'Duplicate credit / chargeback',
];
const PAGE_SIZES = [10, 25, 50];
const FETCH_CAP = 500;

// Display ref for TOPUP rows: TOP-XXXXXXXX derived from the session id
// (double-tapped: order/ID columns); VOUCHER rows keep the raw order_id.
const topupRef = (s: Pick<UpSession, 'id'>) => `TOP-${s.id.slice(0, 8).toUpperCase()}`;
const displayRef = (s: UpSession) => (s.category === 'TOPUP' ? topupRef(s) : s.order_id);

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
type StatusFilter = 'all' | 'pending' | 'success' | 'rejected' | 'reverted';

export default function AdminPaymentsTab() {
  // Admin tokens come from the ISOLATED admin session cache (separate
  // storage key) — a customer sign-in on this tab can never swap the
  // bearer under the confirm/reject calls again (403 'Admins only').
  const { admin: authSession } = useAdminAuth();
  const { push } = useToast();
  // Latest admin tokens via ref — lets stable useCallback helpers resolve
  // the CURRENT bearer at call time even after a late context hydration.
  const authRef = useRef(authSession);
  authRef.current = authSession;
  const [sessions, setSessions] = useState<UpSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<UpSession | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateMode, setDateMode] = useState<DateMode>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rejectTarget, setRejectTarget] = useState<UpSession | null>(null);
  const [rejectRemark, setRejectRemark] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [revertTarget, setRevertTarget] = useState<UpSession | null>(null);
  const [revertReason, setRevertReason] = useState('');
  const [revertError, setRevertError] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [reopenTarget, setReopenTarget] = useState<UpSession | null>(null);
  const [reopenNote, setReopenNote] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<{ url: string; path: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Bulk select & batch action state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchAction, setBatchAction] = useState<'confirm' | 'reject' | null>(null);
  const [batchRejectOpen, setBatchRejectOpen] = useState(false);
  const [batchRejectRemark, setBatchRejectRemark] = useState('');
  const [batchRejectError, setBatchRejectError] = useState<string | null>(null);

  // Invoice modal state
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  const handleOpenInvoice = (s: UpSession) => {
    const amountRs = Number(s.amount_paise) / 100;
    const invItems = extractInvoiceItems(s.items, amountRs);
    const buyer = buyerOf(s.buyer);
    const invData: InvoiceData = {
      invoiceNumber: `INV-${displayRef(s)}`,
      orderId: displayRef(s),
      date: s.created_at,
      completedAt: s.completed_at,
      paymentMethod: 'UPI Direct',
      paymentRef: s.customer_utr || s.bank_ref || null,
      status: s.status,
      customer: {
        name: buyer.name || 'Valued Customer',
        email: buyer.email || '',
        userId: s.user_id,
      },
      items: invItems,
      subtotal: amountRs,
      totalAmount: amountRs,
      category: s.category || 'VOUCHER',
    };
    setSelectedInvoice(invData);
    setIsInvoiceOpen(true);
  };


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('upi_payment_sessions')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setSessions(data as UpSession[]);
        setMessage(null);
      } else if (error) {
        setMessage({ kind: 'err', text: `Load failed: ${error.message}` });
      }
    } catch (err) {
      console.error('Fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // JWT expiry check (local, no network): decode the payload's `exp`.
  // A 30s clock-skew margin guards against sending a token that expires
  // mid-request (the exact shape of the old 'Load failed: JWT expired'.
  const tokenUsable = (token: string): boolean => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp !== 'number' || payload.exp > Date.now() / 1000 + 30;
    } catch {
      return true; // unparsable APR — let the server judge, don't fake-fail
    }
  };

  // The Supabase singleton has persistSession:false and
  // autoRefreshToken:false, and the auth context refreshes only on mount;
  // a tab left open past the ~1h token expiry holds an expired
  // access_token, so tokens are resolved at CALL time:
  //   1. supabase.auth.refreshSession() with the cached admin refresh
  //      token — an expired access token self-heals instead of hard-
  //      failing the load with a red banner.
  //   2. supabase.auth.getSession() — the SDK in-memory session, used
  //      ONLY when it belongs to the same admin (a customer session on
  //      the shared singleton is NEVER lifted onto the admin bearer —
  //      that silently mailed a non-admin identity → 403).
  //   3. the cached admin access token — refused when it has provably
  //      expired (an expired bearer previously rode the request and
  //      rendered 'Load failed: JWT expired').
  const resolveAdminBearer = async (): Promise<{ token: string; via: 'refresh' | 'cache' } | null> => {
    const current = authRef.current;
    const refreshToken = current?.refreshToken;
    if (refreshToken) {
      try {
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (error) {
          // If refresh failed (e.g. 400 bad/stale refresh token), do not fall through or retry invalid token
          return null;
        }
        const fresh = data.session?.access_token;
        if (fresh && tokenUsable(fresh)) return { token: fresh, via: 'refresh' };
      } catch {
        return null;
      }
    }
    try {
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      if (
        s?.user?.id &&
        current?.userId &&
        s.user.id === current.userId &&
        tokenUsable(s.access_token)
      ) {
        return { token: s.access_token, via: 'cache' };
      }
    } catch {
      /* session read rejections fall through to the cached token */
    }
    const cached = current?.token;
    return cached && tokenUsable(cached) ? { token: cached, via: 'cache' } : null;
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

  const openRevert = (s: UpSession) => {
    setRevertTarget(s);
    setRevertReason('');
    setRevertError(null);
  };

  const submitRevert = async () => {
    if (!revertTarget) return;
    const s = revertTarget;
    const rawReason = revertReason.trim();
    const effectiveReason = rawReason || 'Approved in error / payment not credited';

    if (effectiveReason.length < 3) {
      setRevertError('Reason for reversion is required (min 3 chars).');
      return;
    }
    if (effectiveReason.length > 500) {
      setRevertError('Reason too long (max 500 chars).');
      return;
    }

    setReverting(true);
    setRevertingId(s.id);
    setRevertError(null);

    try {
      // 1. Dedicated Edge Function upi-revert-payment
      const edgeRes = await fnPost('upi-revert-payment', {
        payment_id: s.id,
        order_id: s.order_id,
        reason: effectiveReason,
      });

      if (edgeRes.ok) {
        setRevertTarget(null);
        push('Session reverted and wallet balance adjusted successfully', 'success');
        setMessage({
          kind: 'ok',
          text: `Session ${displayRef(s)} reverted and wallet balance adjusted successfully.`,
        });
        void load();
        return;
      }

      // If Edge Function returned a specific functional error (not 404/transport)
      if (edgeRes.status !== 404 && edgeRes.status !== 0 && edgeRes.json && typeof edgeRes.json.error === 'string') {
        setRevertError(edgeRes.json.error);
        return;
      }

      // 2. Direct atomic execution fallback: RPC admin_revert_payment_session
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_revert_payment_session', {
        p_payment_id: s.id,
        p_reason: effectiveReason,
      });

      if (!rpcError && rpcData?.ok) {
        setRevertTarget(null);
        push('Session reverted and wallet balance adjusted successfully', 'success');
        setMessage({
          kind: 'ok',
          text: `Session ${displayRef(s)} reverted and wallet balance adjusted successfully.`,
        });
        void load();
        return;
      }

      // 3. Fallback: For TOPUP sessions, call existing wallet_debit RPC directly
      if (s.category === 'TOPUP') {
        const amountPaise = Number(s.amount_paise);
        const { data: balanceAfter, error: debitError } = await supabase.rpc('wallet_debit', {
          p_user: s.user_id,
          p_amount: amountPaise,
          p_category: 'REFUND',
          p_order: s.order_id,
          p_reference: `Reversal of top-up session ${s.order_id}`,
        });

        if (debitError) {
          setRevertError(debitError.message || 'Failed to deduct customer wallet balance.');
          return;
        }

        // Also decrement monthly_added_amount in wallets table
        const { data: currentWallet } = await supabase
          .from('wallets')
          .select('monthly_added_amount')
          .eq('user_id', s.user_id)
          .maybeSingle();

        if (currentWallet) {
          await supabase
            .from('wallets')
            .update({
              monthly_added_amount: Math.max(0, Number(currentWallet.monthly_added_amount || 0) - amountPaise),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', s.user_id);
        }

        const remarkNote = `Reverted by Admin: ${effectiveReason}`;

        // Update session status: try REVERTED, then REJECTED if check constraint limits
        let updResult = await supabase
          .from('upi_payment_sessions')
          .update({
            status: 'REVERTED',
            admin_remark: remarkNote,
            completed_at: new Date().toISOString(),
          })
          .eq('id', s.id);

        if (updResult.error) {
          updResult = await supabase
            .from('upi_payment_sessions')
            .update({
              status: 'REJECTED',
              admin_remark: remarkNote,
              completed_at: new Date().toISOString(),
            })
            .eq('id', s.id);
        }

        if (updResult.error) {
          setRevertError(`Session status update failed: ${updResult.error.message}`);
          return;
        }

        setRevertTarget(null);
        push('Session reverted and wallet balance adjusted successfully', 'success');
        setMessage({
          kind: 'ok',
          text: `Session ${displayRef(s)} reverted. Customer balance updated to ₹${(Number(balanceAfter) / 100).toFixed(2)}.`,
        });
        void load();
        return;
      }

      // For non-topup (voucher) sessions:
      const remarkNote = `Reverted by Admin: ${effectiveReason}`;
      let updResult = await supabase
        .from('upi_payment_sessions')
        .update({
          status: 'REVERTED',
          admin_remark: remarkNote,
          completed_at: new Date().toISOString(),
        })
        .eq('id', s.id);

      if (updResult.error) {
        updResult = await supabase
          .from('upi_payment_sessions')
          .update({
            status: 'REJECTED',
            admin_remark: remarkNote,
            completed_at: new Date().toISOString(),
          })
          .eq('id', s.id);
      }

      if (updResult.error) {
        setRevertError(`Session update failed: ${updResult.error.message}`);
        return;
      }

      setRevertTarget(null);
      push('Session reverted and wallet balance adjusted successfully', 'success');
      setMessage({ kind: 'ok', text: `Session ${displayRef(s)} marked as reverted.` });
      void load();
    } catch (err) {
      console.error('Revert exception:', err);
      setRevertError(err instanceof Error ? err.message : 'Reversion failed unexpectedly.');
    } finally {
      setReverting(false);
      setRevertingId(null);
    }
  };

  const openReopen = (s: UpSession) => {
    setReopenTarget(s);
    setReopenNote('');
    setReopenError(null);
  };
  const handleOpenReopenModal = openReopen;

  const submitReopen = async () => {
    if (!reopenTarget) return;
    const s = reopenTarget;
    const rawNote = reopenNote.trim();
    const effectiveNote = rawNote || 'Approved after review';

    if (!authSession?.token) {
      setReopenError('Admin session expired — please sign in again and retry.');
      return;
    }

    setReopening(true);
    setReopeningId(s.id);
    setReopenError(null);

    try {
      // 1. Dedicated Edge Function upi-reopen-payment
      const edgeRes = await fnPost('upi-reopen-payment', {
        payment_id: s.id,
        order_id: s.order_id,
        reason: effectiveNote,
      });

      if (edgeRes.ok) {
        setReopenTarget(null);
        push('Session approved and processed successfully', 'success');
        setMessage({
          kind: 'ok',
          text: `Session ${displayRef(s)} approved successfully.`,
        });
        void load();
        return;
      }

      if (edgeRes.status !== 404 && edgeRes.status !== 0 && edgeRes.json && typeof edgeRes.json.error === 'string') {
        setReopenError(edgeRes.json.error);
        return;
      }

      // 2. Direct atomic execution fallback: RPC admin_reopen_payment_session
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_reopen_payment_session', {
        p_payment_id: s.id,
        p_reason: effectiveNote,
      });

      if (!rpcError && rpcData?.ok) {
        setReopenTarget(null);
        push('Session approved and processed successfully', 'success');
        setMessage({
          kind: 'ok',
          text: `Session ${displayRef(s)} approved successfully.`,
        });
        void load();
        return;
      }

      // 3. Fallback: For TOPUP sessions, call existing wallet_credit RPC directly
      if (s.category === 'TOPUP') {
        const amountPaise = Number(s.amount_paise);
        const { data: balanceAfter, error: creditError } = await supabase.rpc('wallet_credit', {
          p_user: s.user_id,
          p_amount: amountPaise,
          p_reference: `Approved after review: ${s.order_id}`,
          p_order: s.order_id,
        });

        if (creditError) {
          setReopenError(creditError.message || 'Failed to credit customer wallet balance.');
          return;
        }

        // Update session status: try CONFIRMED, then SUCCESS if check constraint limits
        let updResult = await supabase
          .from('upi_payment_sessions')
          .update({
            status: 'CONFIRMED',
            admin_remark: effectiveNote,
            completed_at: new Date().toISOString(),
          })
          .eq('id', s.id);

        if (updResult.error) {
          updResult = await supabase
            .from('upi_payment_sessions')
            .update({
              status: 'SUCCESS',
              admin_remark: effectiveNote,
              completed_at: new Date().toISOString(),
            })
            .eq('id', s.id);
        }

        setReopenTarget(null);
        push('Session approved and customer wallet credited', 'success');
        setMessage({
          kind: 'ok',
          text: `Session ${displayRef(s)} approved. Customer balance updated to ₹${(Number(balanceAfter) / 100).toFixed(2)}.`,
        });
        void load();
        return;
      }

      // For non-topup (voucher) sessions:
      let updResult = await supabase
        .from('upi_payment_sessions')
        .update({
          status: 'CONFIRMED',
          admin_remark: effectiveNote,
          completed_at: new Date().toISOString(),
        })
        .eq('id', s.id);

      if (updResult.error) {
        updResult = await supabase
          .from('upi_payment_sessions')
          .update({
            status: 'SUCCESS',
            admin_remark: effectiveNote,
            completed_at: new Date().toISOString(),
          })
          .eq('id', s.id);
      }

      if (updResult.error) {
        setReopenError(`Session update failed: ${updResult.error.message}`);
        return;
      }

      // Reconcile order & gift cards
      const totalRupees = Number(s.amount_paise) / 100;
      await supabase.from('orders').insert({
        user_id: s.user_id,
        total_amount: totalRupees,
        status: 'successful',
        youpi_order_id: s.order_id,
        youpi_payment_id: s.id,
        youpi_utr: s.bank_ref || s.customer_utr || null,
        items: s.items,
      });

      const items = Array.isArray(s.items) ? s.items : [];
      if (items.length > 0) {
        const seg = () => Math.random().toString(16).slice(2, 6).toUpperCase();
        const rows = items.map((raw) => {
          const it = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
          const brandName = String(it.brand_name || it.brand || it.name || 'Gift Card').trim();
          const brandSlug = String(it.brand_slug || it.slug || brandName.toLowerCase().replace(/\s+/g, '-'));
          const denom = Number(it.amount || it.denomination || 0) || totalRupees;
          const qty = Math.max(1, Number(it.quantity || it.qty || 1));
          return {
            session_id: s.order_id,
            user_id: s.user_id,
            brand_slug: brandSlug,
            brand_name: brandName,
            brand_color: String(it.brand_color || '#6b21a8'),
            brand_color2: String(it.brand_color2 || '#3b0764'),
            amount: denom,
            quantity: qty,
            recipient_name: String(it.recipient_name || ''),
            recipient_email: String(it.recipient_email || ''),
            recipient_phone: String(it.recipient_phone || ''),
            message: String(it.message || ''),
            occasion: String(it.occasion || ''),
            gift_card_code: `${seg()}-${seg()}-${seg()}-${seg()}`,
            status: 'active',
            balance: denom * qty,
            issued_under_payment_id: s.id,
          };
        });
        try {
          await supabase.from('purchases').insert(rows);
        } catch (e) {
          console.warn('Could not insert purchases rows:', e);
        }
      }

      setReopenTarget(null);
      push('Session approved and gift card order fulfilled', 'success');
      setMessage({ kind: 'ok', text: `Session ${displayRef(s)} approved and order fulfilled.` });
      void load();
    } catch (err) {
      console.error('Re-approval exception:', err);
      setReopenError(err instanceof Error ? err.message : 'Re-approval failed unexpectedly.');
    } finally {
      setReopening(false);
      setReopeningId(null);
    }
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

  const inStatusMatch = useCallback(
    (status: string) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'pending') return status === 'INITIATED' || status === 'ACTIVE';
      if (statusFilter === 'success') return status === 'SUCCESS' || status === 'CONFIRMED';
      if (statusFilter === 'rejected') return status === 'REJECTED';
      if (statusFilter === 'reverted') return status === 'REVERTED';
      return true;
    },
    [statusFilter]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (!inStatusMatch(s.status)) return false;
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
  }, [sessions, search, inStatusMatch, inDateRange]);

  const stats = useMemo(() => {
    let confirmedPaise = 0;
    let pending = 0;
    let rejected = 0;
    let reverted = 0;
    let created = 0;
    let topups = 0;
    let topupsConfirmedPaise = 0;
    for (const s of sessions) {
      if (isLocalToday(s.created_at)) created += 1;
      if ((s.status === 'SUCCESS' || s.status === 'CONFIRMED') && isLocalToday(s.completed_at)) {
        confirmedPaise += Number(s.amount_paise);
      }
      if ((s.status === 'INITIATED' || s.status === 'ACTIVE') && isLocalToday(s.created_at)) pending += 1;
      if (s.status === 'REJECTED' && isLocalToday(s.completed_at)) rejected += 1;
      if (s.status === 'REVERTED' && isLocalToday(s.completed_at)) reverted += 1;
      if (s.category === 'TOPUP') {
        if (isLocalToday(s.created_at)) topups += 1;
        if ((s.status === 'SUCCESS' || s.status === 'CONFIRMED') && isLocalToday(s.completed_at)) {
          topupsConfirmedPaise += Number(s.amount_paise);
        }
      }
    }
    return { created, confirmedPaise, pending, rejected, reverted, topups, topupsConfirmedPaise };
  }, [sessions]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize]
  );

  const selectedPendingCount = useMemo(() => {
    return sessions.filter(
      (s) => selectedIds.has(s.id) && (s.status === 'INITIATED' || s.status === 'ACTIVE')
    ).length;
  }, [sessions, selectedIds]);

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = visible.length > 0 && visible.every((s) => next.has(s.id));
      if (allSelected) {
        for (const s of visible) {
          next.delete(s.id);
        }
      } else {
        for (const s of visible) {
          next.add(s.id);
        }
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBatchConfirm = async () => {
    const targets = sessions.filter(
      (s) => selectedIds.has(s.id) && (s.customer_utr ?? '').trim()
    );
    if (targets.length === 0) {
      setMessage({
        kind: 'err',
        text: 'None of the selected sessions have a customer UTR available to confirm.',
      });
      return;
    }
    if (!authSession?.token) {
      setMessage({
        kind: 'err',
        text: 'Admin session expired — please sign in again and retry.',
      });
      return;
    }

    setBatchBusy(true);
    setBatchAction('confirm');
    setMessage(null);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const s of targets) {
      const bankRef = (s.customer_utr ?? '').trim();
      const res = await fnPost('upi-manual-confirm', {
        payment_id: s.id,
        order_id: s.order_id,
        bank_ref: bankRef,
        amount_rupees: Number(s.amount_paise) / 100,
      });
      if (res.ok) {
        successCount++;
      } else {
        failCount++;
        const json = res.json ?? {};
        const errText = typeof json.error === 'string' ? json.error : `HTTP ${res.status || 'transport'}`;
        errors.push(`${s.order_id}: ${errText}`);
      }
    }

    setBatchBusy(false);
    setBatchAction(null);
    clearSelection();
    void load();

    if (failCount === 0) {
      setMessage({
        kind: 'ok',
        text: `Successfully confirmed ${successCount} session${successCount === 1 ? '' : 's'}.`,
      });
    } else {
      setMessage({
        kind: successCount > 0 ? 'ok' : 'err',
        text: `Batch confirm finished: ${successCount} succeeded, ${failCount} failed. ${errors.slice(0, 2).join('; ')}`,
      });
    }
  };

  const handleBatchReject = async () => {
    const remark = batchRejectRemark.trim();
    if (remark.length < 3) {
      setBatchRejectError('Rejection remark is mandatory (min 3 chars).');
      return;
    }
    if (remark.length > 500) {
      setBatchRejectError('Rejection remark too long (max 500 chars).');
      return;
    }
    const targets = sessions.filter(
      (s) => selectedIds.has(s.id) && (s.status === 'INITIATED' || s.status === 'ACTIVE')
    );
    if (targets.length === 0) {
      setBatchRejectError('No pending sessions selected to reject.');
      return;
    }
    if (!authSession?.token) {
      setBatchRejectError('Admin session expired — please sign in again and retry.');
      return;
    }

    setBatchBusy(true);
    setBatchAction('reject');
    setBatchRejectError(null);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const s of targets) {
      const res = await fnPost('upi-reject-payment', { payment_id: s.id, remark });
      if (res.ok) {
        successCount++;
      } else {
        failCount++;
        const json = res.json ?? {};
        const errText = typeof json.error === 'string' ? json.error : `HTTP ${res.status || 'transport'}`;
        errors.push(`${s.order_id}: ${errText}`);
      }
    }

    setBatchBusy(false);
    setBatchAction(null);
    setBatchRejectOpen(false);
    clearSelection();
    void load();

    if (failCount === 0) {
      setMessage({
        kind: 'ok',
        text: `Successfully rejected ${successCount} session${successCount === 1 ? '' : 's'}: ${remark}`,
      });
    } else {
      setMessage({
        kind: successCount > 0 ? 'ok' : 'err',
        text: `Batch reject finished: ${successCount} succeeded, ${failCount} failed. ${errors.slice(0, 2).join('; ')}`,
      });
    }
  };
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
    <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 max-w-full overflow-hidden">
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
        <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-orange-500">Reverted today</p>
          <p className="text-sm font-bold text-orange-700">{stats.reverted}</p>
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

      {/* Search + status filter + date filter + rows-per-page (combined AND) */}
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
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setPage(1);
            }}
            className={`${topSelectClass} shrink-0`}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending Verification</option>
            <option value="success">Confirmed / Success</option>
            <option value="rejected">Rejected</option>
            <option value="reverted">Reverted</option>
          </select>
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
          <select
            title="Items per page"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 font-medium hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 shrink-0"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-emerald-900">
              {selectedIds.size} session{selectedIds.size === 1 ? '' : 's'} selected
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => void handleBatchConfirm()}
              disabled={batchBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {batchBusy && batchAction === 'confirm' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Batch Confirm
            </button>
            <button
              onClick={() => {
                setBatchRejectOpen(true);
                setBatchRejectRemark('');
                setBatchRejectError(null);
              }}
              disabled={batchBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {batchBusy && batchAction === 'reject' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Batch Reject
            </button>
            <button
              onClick={clearSelection}
              disabled={batchBusy}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

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
          <div className="mt-4 overflow-x-auto w-full rounded-xl border border-slate-200 px-4 pb-4 pt-3">
            <table className="w-full min-w-[1050px] text-left text-xs table-fixed">
              <thead>
                <tr className="bg-slate-50">
                  <th className="w-[80px] shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap rounded-l-lg">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={visible.length > 0 && visible.every((s) => selectedIds.has(s.id))}
                        onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        aria-label="Select all"
                      />
                      <span>S. No.</span>
                    </div>
                  </th>
                  <th className="w-[18%] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">User / Customer</th>
                  <th className="w-[22%] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Reference</th>
                  <th className="w-[12%] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Order / Item</th>
                  <th className="w-[8%] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-left">Amount</th>
                  <th className="w-[14%] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Date &amp; Time</th>
                  <th className="w-[12%] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">UTR &amp; Proof</th>
                  <th className="w-[14%] min-w-[160px] px-3 py-2 pr-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right md:text-center rounded-r-lg">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s, index) => {
                  const buyer = buyerOf(s.buyer);
                  const items = itemsOf(s);
                  const displayIndex = filtered.length - ((currentPage - 1) * pageSize + index);
                  return (
                    <tr key={s.id} className={`border-t border-slate-100 align-top ${selectedIds.has(s.id) ? 'bg-emerald-50/40' : ''}`}>
                      <td className="w-[80px] shrink-0 px-3 py-3 whitespace-nowrap text-slate-500">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleSelect(s.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            aria-label={`Select session ${s.order_id}`}
                          />
                          <span className="font-mono text-xs text-slate-600">
                            {displayIndex}
                          </span>
                        </div>
                      </td>
                      <td className="w-[18%] px-3 py-3">
                        {buyer.name ? (
                          <p className="truncate font-semibold text-slate-600">{buyer.name}</p>
                        ) : (
                          <p className="truncate font-semibold text-slate-400">Unnamed customer</p>
                        )}
                        <p className="break-all text-[11px] text-slate-500">{buyer.email || '—'}</p>
                      </td>
                      <td className="w-[22%] px-3 py-3">
                        <p className="truncate font-bold text-slate-900" title={displayRef(s)}>{displayRef(s)}</p>
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
                      <td className="w-[12%] px-3 py-3">
                        {s.category === 'TOPUP' ? (
                          <p className="truncate font-mono text-[11px] font-semibold text-slate-900" title={s.order_id}>
                            {topupRef(s)}
                          </p>
                        ) : items.length === 0 ? (
                          <p className="text-[11px] text-slate-400">—</p>
                        ) : (
                          <p className="truncate text-[11px] text-slate-600" title={items.map((it) => `${it.label} (${it.size})`).join(' · ')}>
                            {items.slice(0, 2).map((it) => `${it.label} · ${it.size}`).join('  ·  ')}
                            {items.length > 2 ? ` · +${items.length - 2} more` : ''}
                          </p>
                        )}
                        {!s.order_id.startsWith('UPI-') && (
                          <p
                            className="mt-0.5 truncate font-mono text-[11px] font-semibold text-slate-900"
                            title={s.order_id}
                          >
                            Order #{shortOrderId(s.order_id)}
                          </p>
                        )}
                      </td>
                      <td className="w-[8%] whitespace-nowrap px-3 py-3 font-semibold text-slate-900 text-left">
                        {inr(Number(s.amount_paise) / 100)}
                      </td>
                      <td className="w-[14%] px-3 py-3">
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
                      <td className="w-[12%] px-3 py-3">
                        {s.customer_utr ? (
                          <p className="break-all font-mono text-[11px] font-semibold text-slate-900">{s.customer_utr}</p>
                        ) : (
                          <p className="text-[11px] text-slate-400">—</p>
                        )}
                        {(s.bank_ref || s.status === 'SUCCESS') && (
                          <p className="mt-0.5 text-[11px] font-semibold text-emerald-700" title={s.bank_ref ? `Bank Ref: ${s.bank_ref}` : undefined}>
                            Approve
                          </p>
                        )}
                        {s.proof_path && (
                          <button
                            onClick={() => void openProofPreview(s)}
                            disabled={previewLoading}
                            title="View screenshot"
                            className="mt-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {previewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                            View screenshot
                          </button>
                        )}
                        {s.admin_remark && (
                          <p className="mt-1 text-[11px] font-semibold text-rose-600">
                            {s.admin_remark.replace(/^Remark:\s*/i, '')}
                          </p>
                        )}
                      </td>
                      <td className="w-[14%] min-w-[160px] px-3 py-3 pr-4 text-right md:text-center">
                        {(s.status === 'ACTIVE' || s.status === 'INITIATED' || s.status === 'PENDING_VERIFICATION') ? (
                          <div className="flex items-center justify-end md:justify-center gap-1.5 pr-2 shrink-0 whitespace-nowrap">
                            <button
                              onClick={() => setConfirmTarget(s)}
                              disabled={confirmingId === s.id || !s.customer_utr}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs whitespace-nowrap font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Confirm
                            </button>
                            <button
                              onClick={() => openReject(s)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 text-xs whitespace-nowrap font-medium text-white hover:bg-rose-700"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </div>
                        ) : (s.status === 'CONFIRMED' || s.status === 'SUCCESS' || s.status === 'SUCCESS-manual') ? (
                          <div className="flex items-center justify-end md:justify-center pr-2 shrink-0 whitespace-nowrap gap-1.5">
                            <button
                              onClick={() => handleOpenInvoice(s)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs whitespace-nowrap font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand-700 hover:border-brand-300 transition-colors shadow-xs"
                              title="View and download tax invoice"
                            >
                              <FileText className="h-3.5 w-3.5 text-brand-600" />
                              Invoice
                            </button>
                            <button
                              onClick={() => openRevert(s)}
                              disabled={revertingId === s.id}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs whitespace-nowrap font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                              title="Revert / Rollback confirmed payment session"
                            >
                              {revertingId === s.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                              )}
                              Revert
                            </button>
                          </div>
                        ) : s.status === 'REJECTED' ? (
                          <div className="flex items-center justify-end md:justify-center pr-2 shrink-0 whitespace-nowrap">
                            <button
                              onClick={() => handleOpenReopenModal(s)}
                              disabled={reopeningId === s.id}
                              className="px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-md transition disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              Revert
                            </button>
                          </div>
                        ) : s.status === 'REVERTED' ? (
                          <div className="flex items-center justify-end md:justify-center pr-2">
                            <span className="inline-block rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                              Reverted
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end md:justify-center pr-2">
                            <span className="whitespace-nowrap text-xs text-gray-400">No action</span>
                          </div>
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

      {/* Batch Reject modal */}
      {batchRejectOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
          onClick={() => !batchBusy && setBatchRejectOpen(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900">
              Batch Reject ({selectedPendingCount} pending session{selectedPendingCount === 1 ? '' : 's'})
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Marks selected pending sessions REJECTED with the remark below (min 3 chars). Non-pending sessions will be skipped.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {REJECT_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setBatchRejectRemark(r)}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={batchRejectRemark}
              onChange={(e) => {
                setBatchRejectRemark(e.target.value);
                setBatchRejectError(null);
              }}
              rows={3}
              maxLength={500}
              placeholder="Rejection remark (mandatory, min 3 chars)"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400"
            />
            {batchRejectError && (
              <p className="mt-1 text-[11px] font-semibold text-rose-600">
                {batchRejectError}
              </p>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => setBatchRejectOpen(false)}
                disabled={batchBusy}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleBatchReject()}
                disabled={batchBusy || selectedPendingCount === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {batchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Reject {selectedPendingCount} Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert / Rollback modal */}
      {revertTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
          onClick={() => !reverting && setRevertTarget(null)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Revert Payment Session</h3>
                  <p className="text-[11px] text-slate-500">
                    Rollback confirmed transaction &amp; adjust ledger
                  </p>
                </div>
              </div>
              <button
                onClick={() => !reverting && setRevertTarget(null)}
                disabled={reverting}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Session ID:</span>
                <span className="font-mono font-semibold text-slate-900">{displayRef(revertTarget)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Amount:</span>
                <span className="font-bold text-slate-900">{inr(Number(revertTarget.amount_paise) / 100)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Category:</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  revertTarget.category === 'TOPUP' ? 'bg-sky-100 text-sky-700' : 'bg-purple-100 text-purple-700'
                }`}>
                  {revertTarget.category === 'TOPUP' ? 'Wallet Top-up' : 'Voucher Purchase'}
                </span>
              </div>
              {buyerOf(revertTarget.buyer).email && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-medium text-slate-700 truncate max-w-[200px]">
                    {buyerOf(revertTarget.buyer).email}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-[11px] text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                {revertTarget.category === 'TOPUP'
                  ? `Reverting this top-up will immediately deduct ${inr(Number(revertTarget.amount_paise) / 100)} from the customer's wallet balance and record a compensating debit in the ledger.`
                  : `Reverting this confirmed session will mark it as REVERTED with the audit remark below.`}
              </span>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Reversion
              </label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {REVERT_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRevertReason(r);
                      setRevertError(null);
                    }}
                    disabled={reverting}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                value={revertReason}
                onChange={(e) => {
                  setRevertReason(e.target.value);
                  setRevertError(null);
                }}
                rows={3}
                maxLength={500}
                placeholder="Approved in error / payment not credited"
                disabled={reverting}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400"
              />
            </div>

            {revertError && (
              <p className="mt-2 text-[11px] font-semibold text-rose-600">{revertError}</p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevertTarget(null)}
                disabled={reverting}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRevert()}
                disabled={reverting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition-colors disabled:opacity-60"
              >
                {reverting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Reverting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Confirm Revert
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert rejection / Re-open modal for rejected sessions */}
      {reopenTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
          onClick={() => !reopening && setReopenTarget(null)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Approve Previously Rejected Request</h3>
                  <p className="text-[11px] text-slate-500">
                    Re-open request and credit customer or fulfill order
                  </p>
                </div>
              </div>
              <button
                onClick={() => !reopening && setReopenTarget(null)}
                disabled={reopening}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Reference:</span>
                <span className="font-mono font-semibold text-slate-900">{displayRef(reopenTarget)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-medium text-slate-700 truncate max-w-[200px]">
                  {buyerOf(reopenTarget.buyer).email || reopenTarget.user_id}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Amount:</span>
                <span className="font-bold text-slate-900">{inr(Number(reopenTarget.amount_paise) / 100)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Category:</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  reopenTarget.category === 'TOPUP' ? 'bg-sky-100 text-sky-700' : 'bg-purple-100 text-purple-700'
                }`}>
                  {reopenTarget.category === 'TOPUP' ? 'Wallet Top-up' : 'Voucher Purchase'}
                </span>
              </div>
              {reopenTarget.admin_remark && (
                <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-200/60">
                  <span className="text-slate-500">Previous Remark:</span>
                  <span className="text-rose-600 font-medium text-right text-[11px]">
                    {reopenTarget.admin_remark.replace(/^Remark:\s*/i, '')}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-2.5 text-[11px] text-emerald-900 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>
                {reopenTarget.category === 'TOPUP'
                  ? `Approving this top-up will immediately credit ${inr(Number(reopenTarget.amount_paise) / 100)} to the customer's wallet balance and record a ledger transaction.`
                  : `Approving this voucher order will mark the session as CONFIRMED and fulfill gift cards for the customer.`}
              </span>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for re-approval (optional)
              </label>
              <textarea
                value={reopenNote}
                onChange={(e) => {
                  setReopenNote(e.target.value);
                  setReopenError(null);
                }}
                rows={2}
                maxLength={500}
                placeholder="Approved after review"
                disabled={reopening}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-emerald-500"
              />
            </div>

            {reopenError && (
              <p className="mt-2 text-[11px] font-semibold text-rose-600">{reopenError}</p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReopenTarget(null)}
                disabled={reopening}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitReopen()}
                disabled={reopening}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
              >
                {reopening ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirm Approval
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tax Invoice / Receipt Modal */}
      <OrderInvoiceModal
        isOpen={isInvoiceOpen}
        onClose={() => setIsInvoiceOpen(false)}
        invoice={selectedInvoice}
      />
    </div>
  );
}

