import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Gift, CheckCircle2, Clock, Mail, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/CustomerAuthContext';
import { inr, formatDateTime } from '@/lib/format';

// Real data shapes (server-verified): no order_number column on orders —
// the GK- ref is derived display-side only; total_amount is ALREADY in
// rupees (do not divide again); items is a jsonb array of cart lines.
type OrderRow = {
  id: string;
  total_amount: number | string;
  status: string;
  items: unknown;
  created_at: string;
};

type PurchaseRow = {
  id: string;
  brand_name: string;
  brand_color: string | null;
  amount: number | string;
  quantity: number;
  gift_card_code: string | null;
  status: string;
  balance: number | string | null;
  recipient_email: string | null;
  created_at: string;
};

// Pending UPI Direct voucher checkouts (upi_payment_sessions, category
// 'VOUCHER') — these rows exist BEFORE admin verification creates the
// real order/purchases, so /orders shows them with a Pending badge
// instead of blank "No orders yet".
type PendingUpiRow = {
  id: string;
  order_id: string;
  amount_paise: number | string;
  status: string;
  items: unknown;
  created_at: string;
};

// Display refs — derivation ONLY (same pattern as topupRef); no writes.
const orderRef = (o: OrderRow) => `GK-${o.id.slice(0, 8).toUpperCase()}`;

// items[] → readable summary ("2× Amazon · 1× Flipkart"); on any parse
// failure fall back to a plain item-list label.
const itemsSummary = (items: unknown): string => {
  if (!Array.isArray(items) || items.length === 0) return 'Items: N/A';
  try {
    return items
      .map((it) => {
        const line = it as { brand_slug?: string; quantity?: number };
        const slug = typeof line.brand_slug === 'string' ? line.brand_slug.replace(/-/g, ' ') : 'item';
        const label = slug.charAt(0).toUpperCase() + slug.slice(1);
        return `${line.quantity ?? 1}× ${label}`;
      })
      .join(' · ');
  } catch {
    return 'Items: N/A';
  }
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'successful') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Delivered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
      <Clock className="h-3.5 w-3.5" />
      Processing
    </span>
  );
}

export default function OrdersPage() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [pendingUpi, setPendingUpi] = useState<PendingUpiRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.id) {
      setOrders([]);
      setPurchases([]);
      setPendingUpi([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [ordersRes, purchasesRes, upiRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, total_amount, status, items, created_at')
        .eq('user_id', session.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('purchases')
        .select('id, brand_name, brand_color, amount, quantity, gift_card_code, status, balance, recipient_email, created_at')
        .eq('user_id', session.id)
        .order('created_at', { ascending: false })
        .limit(100),
      // Voucher checkouts pending or verified on the Admin panel:
      // INITIATED/ACTIVE == admin's PENDING_VERIFICATION, SUCCESS ==
      // admin's CONFIRMED (the upi_payment_sessions status enum has no
      // 'PENDING_VERIFICATION'/'CONFIRMED'/'DELIVERED' literals). Owner
      // RLS + the explicit user_id match keep stale mock sessions out;
      // TOPUP category rows belong to the Wallet page, not here.
      supabase
        .from('upi_payment_sessions')
        .select('id, order_id, amount_paise, status, items, created_at')
        .eq('user_id', session.id)
        .eq('category', 'VOUCHER')
        .in('status', ['INITIATED', 'ACTIVE', 'SUCCESS'])
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (ordersRes.error || purchasesRes.error || upiRes.error) {
      setError(ordersRes.error?.message || purchasesRes.error?.message || upiRes.error?.message || 'Could not load your orders.');
      setOrders([]);
      setPurchases([]);
      setPendingUpi([]);
      setLoading(false);
      return;
    }
    setOrders((ordersRes.data ?? []) as OrderRow[]);
    setPurchases((purchasesRes.data ?? []) as PurchaseRow[]);
    setPendingUpi((upiRes.data ?? []) as PendingUpiRow[]);
    setLoading(false);
  }, [session?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const noData =
    (orders ?? []).length === 0 &&
    (purchases ?? []).length === 0 &&
    (pendingUpi ?? []).length === 0;

  return (
    <div className="bg-gradient-to-b from-brand-50/40 via-transparent to-transparent pt-28 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
              My Orders
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Track and review your recent gift card purchases.
            </p>
          </div>
          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>
        )}

        <div className="rounded-3xl border border-slate-100 bg-white shadow-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 px-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your orders…
            </div>
          ) : noData ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <span className="grid place-items-center h-14 w-14 rounded-2xl bg-brand-50 text-brand-600 mb-4">
                <Gift className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-slate-700">No orders yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Your gift card purchases will show up here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {/* ───────── Pending verification (UPI Direct vouchers) ───────── */}
              {(pendingUpi ?? []).length > 0 && (
                <div className="p-5 sm:p-6 pb-2">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Pending verification</h2>
                </div>
              )}
              <ul className="divide-y divide-slate-100">
                {(pendingUpi ?? []).map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 sm:p-6 hover:bg-slate-50/60 transition-colors"
                  >
                    <span className="grid place-items-center h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-glow-sm">
                      <Gift className="h-5 w-5" />
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{itemsSummary(s.items)}</p>
                      <p className="mt-1.5 text-xs font-medium text-slate-500 font-mono">Order #{s.order_id}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDateTime(s.created_at)}</p>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0">
                      <p className="text-base font-extrabold text-slate-900">{inr(Number(s.amount_paise) / 100)}</p>
                      {s.status === 'SUCCESS' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Delivered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          <Clock className="h-3.5 w-3.5" />
                          Pending Verification
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* ─────────────── Your orders ─────────────── */}
              {(orders ?? []).length > 0 && (
                <div className="p-5 sm:p-6 pb-2">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Your orders</h2>
                </div>
              )}
              <ul className="divide-y divide-slate-100">
                {(orders ?? []).map((order) => (
                  <li
                    key={order.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 sm:p-6 hover:bg-slate-50/60 transition-colors"
                  >
                    <span className="grid place-items-center h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm">
                      <Gift className="h-5 w-5" />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{itemsSummary(order.items)}</p>
                        <span className="text-xs text-slate-400">•</span>
                        <p className="text-xs font-medium text-slate-500">Order #{orderRef(order)}</p>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <Mail className="h-3.5 w-3.5" />
                        {order.status === 'successful' ? 'Delivered via email to recipient' : 'Preparing for delivery'}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{formatDateTime(order.created_at)}</p>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 sm:gap-2 shrink-0">
                      <p className="text-base font-extrabold text-slate-900">{inr(Number(order.total_amount))}</p>
                      <StatusBadge status={order.status} />
                    </div>
                  </li>
                ))}
              </ul>

              {/* ───────────── Your gift cards ─────────────
                  Separate section (created_at-proximity joins felt
                  fragile for batch purchases; two sections read
                  cleaner). */}
              {(purchases ?? []).length > 0 && (
                <div className="p-5 sm:p-6 pb-2">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Your gift cards</h2>
                </div>
              )}
              <ul className="divide-y divide-slate-100">
                {(purchases ?? []).map((p) => {
                  const active = p.status === 'active';
                  return (
                    <li
                      key={p.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 sm:p-6 hover:bg-slate-50/60 transition-colors"
                    >
                      <span className="grid place-items-center h-12 w-12 shrink-0 rounded-2xl text-white shadow-glow-sm font-display font-extrabold text-lg uppercase"
                        style={{ backgroundColor: p.brand_color ?? '#F26722' }}>
                        {(p.brand_name ?? '?').charAt(0)}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-slate-900">
                            {p.quantity > 1 ? `${p.quantity}× ` : ''}{p.brand_name} Gift Card
                          </p>
                          {p.recipient_email && (
                            <span className="text-xs text-slate-500">for {p.recipient_email}</span>
                          )}
                        </div>
                        {p.gift_card_code && (
                          <p className="mt-1.5 break-all font-mono text-xs font-semibold text-slate-700">
                            {p.gift_card_code}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-slate-400">{formatDateTime(p.created_at)}</p>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0">
                        <p className="text-base font-extrabold text-slate-900">{inr(Number(p.amount))}</p>
                        {active ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 capitalize">
                            {p.status}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-center sm:hidden">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
