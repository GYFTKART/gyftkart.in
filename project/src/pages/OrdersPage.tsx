import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, CheckCircle2, Clock, Mail, Loader2, XCircle, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/CustomerAuthContext';
import { inr, formatDateTime } from '@/lib/format';
import { OrderInvoiceModal } from '@/components/OrderInvoiceModal';
import { extractInvoiceItems, type InvoiceData } from '@/lib/invoice';

// Real data shapes (server-verified): no order_number column on orders —
// the GK- ref is derived display-side only; total_amount is ALREADY in
// rupees (do not divide again); items is a jsonb array of cart lines.
type OrderRow = {
  id: string;
  total_amount: number | string;
  status: string;
  items: unknown;
  created_at: string;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  youpi_order_id?: string | null;
  youpi_payment_id?: string | null;
  youpi_utr?: string | null;
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

// UPI Direct voucher checkouts (upi_payment_sessions, category 'VOUCHER'
// or non-TOPUP) across all lifecycle states (pending, delivered, rejected).
type PendingUpiRow = {
  id: string;
  order_id: string;
  amount_paise: number | string;
  status: string;
  items: unknown;
  admin_remark?: string | null;
  created_at: string;
  completed_at?: string | null;
  customer_utr?: string | null;
  bank_ref?: string | null;
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
  const s = status.toLowerCase();
  if (s === 'successful' || s === 'delivered' || s === 'confirmed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Delivered
      </span>
    );
  }
  if (s === 'rejected' || s === 'reverted') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
        <XCircle className="h-3.5 w-3.5" />
        Rejected
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

type FilterStatus = 'all' | 'success' | 'pending' | 'rejected';

export default function OrdersPage() {
  const { session, authReady } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [pendingUpi, setPendingUpi] = useState<PendingUpiRow[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invoice modal state
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  const handleOpenUpiInvoice = (s: PendingUpiRow) => {
    const amountRs = Number(s.amount_paise) / 100;
    const invItems = extractInvoiceItems(s.items, amountRs);
    const invData: InvoiceData = {
      invoiceNumber: `INV-${s.order_id}`,
      orderId: s.order_id,
      date: s.created_at,
      completedAt: s.completed_at,
      paymentMethod: 'UPI Direct',
      paymentRef: s.customer_utr || s.bank_ref || null,
      status: s.status,
      customer: {
        name: session?.name || 'Customer',
        email: session?.email || '',
        phone: session?.phone || '',
        userId: session?.id,
        customerType: session?.customer_type,
        companyName: session?.company_name,
        brandTradeName: session?.brand_trade_name,
        gstin: session?.gstin,
        pan: session?.pan,
        billingAddress: session?.billing_address,
        billingState: session?.billing_state,
        billingCity: session?.billing_city,
        billingPincode: session?.billing_pincode,
      },
      items: invItems,
      subtotal: amountRs,
      totalAmount: amountRs,
      category: 'VOUCHER',
    };
    setSelectedInvoice(invData);
    setIsInvoiceOpen(true);
  };

  const handleOpenOrderInvoice = (order: OrderRow) => {
    const amountRs = Number(order.total_amount);
    const invItems = extractInvoiceItems(order.items, amountRs);
    const refCode = orderRef(order);
    const payMethod = order.youpi_payment_id
      ? 'UPI Direct'
      : order.razorpay_payment_id
      ? 'Razorpay'
      : 'Online Payment';
    const payRef = order.youpi_utr || order.razorpay_payment_id || order.youpi_payment_id || null;

    const invData: InvoiceData = {
      invoiceNumber: `INV-${refCode}`,
      orderId: refCode,
      date: order.created_at,
      paymentMethod: payMethod,
      paymentRef: payRef,
      status: order.status,
      customer: {
        name: session?.name || 'Customer',
        email: session?.email || '',
        phone: session?.phone || '',
        userId: session?.id,
        customerType: session?.customer_type,
        companyName: session?.company_name,
        brandTradeName: session?.brand_trade_name,
        gstin: session?.gstin,
        pan: session?.pan,
        billingAddress: session?.billing_address,
        billingState: session?.billing_state,
        billingCity: session?.billing_city,
        billingPincode: session?.billing_pincode,
      },
      items: invItems,
      subtotal: amountRs,
      totalAmount: amountRs,
      category: 'VOUCHER',
    };
    setSelectedInvoice(invData);
    setIsInvoiceOpen(true);
  };

  const load = useCallback(async () => {
    if (!authReady) return;
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
        .select('id, total_amount, status, items, created_at, razorpay_order_id, razorpay_payment_id, youpi_order_id, youpi_payment_id, youpi_utr')
        .eq('user_id', session.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('purchases')
        .select('id, brand_name, brand_color, amount, quantity, gift_card_code, status, balance, recipient_email, created_at')
        .eq('user_id', session.id)
        .order('created_at', { ascending: false })
        .limit(100),
      // Voucher checkouts pending, verified, or rejected on the Admin panel:
      // INITIATED/ACTIVE == admin's PENDING_VERIFICATION, SUCCESS ==
      // admin's CONFIRMED, REJECTED == admin's REJECTED.
      // Owner RLS + explicit user_id match keeps others' sessions out;
      // TOPUP category rows belong to the Wallet page, not here.
      supabase
        .from('upi_payment_sessions')
        .select('id, order_id, amount_paise, status, items, admin_remark, created_at, completed_at, customer_utr, bank_ref')
        .eq('user_id', session.id)
        .or('category.neq.TOPUP,category.is.null')
        .in('status', ['INITIATED', 'ACTIVE', 'SUCCESS', 'PENDING_VERIFICATION', 'CONFIRMED', 'DELIVERED', 'REJECTED', 'REVERTED'])
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
  }, [authReady, session?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const itemsPerPage = 10;

  const filteredUpi = useMemo(() => {
    const list = pendingUpi ?? [];
    if (statusFilter === 'all') return list;
    return list.filter((s) => {
      const st = (s.status || '').toUpperCase();
      if (statusFilter === 'success') {
        return st === 'SUCCESS' || st === 'CONFIRMED' || st === 'DELIVERED';
      }
      if (statusFilter === 'pending') {
        return st === 'INITIATED' || st === 'ACTIVE' || st === 'PENDING_VERIFICATION';
      }
      if (statusFilter === 'rejected') {
        return st === 'REJECTED' || st === 'FAILED' || st === 'CANCELLED' || st === 'REVERTED';
      }
      return true;
    });
  }, [pendingUpi, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUpi.length / itemsPerPage));

  const paginatedUpi = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUpi.slice(start, start + itemsPerPage);
  }, [filteredUpi, currentPage]);

  const noData =
    (orders ?? []).length === 0 &&
    (purchases ?? []).length === 0 &&
    (pendingUpi ?? []).length === 0;

  return (
    <div className="bg-gradient-to-b from-brand-50/40 via-transparent to-transparent pt-28 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm mb-6">
          <Link to="/" className="text-gray-400 hover:text-brand-700 transition-colors">
            Home
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">Orders</span>
        </nav>

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
              {/* ───────── UPI Direct voucher orders ───────── */}
              {(pendingUpi ?? []).length > 0 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6 pb-4">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Recent Orders</h2>
                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value as FilterStatus);
                        setCurrentPage(1);
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="all">All Orders</option>
                      <option value="success">Success</option>
                      <option value="pending">Pending Verification</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>

                  {filteredUpi.length === 0 ? (
                    <div className="py-12 px-6 text-center text-xs font-medium text-slate-500">
                      No orders found matching this filter.
                    </div>
                  ) : (
                    <>
                      <div className="p-5 sm:p-6 pt-0">
                        <div className="overflow-x-auto rounded-xl border border-gray-100">
                          <table className="w-full min-w-[700px] text-left text-xs">
                            <thead>
                              <tr className="bg-gray-50/70">
                                <th className="px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[70px]">
                                  S. NO.
                                </th>
                                <th className="px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                  ORDER / ITEM
                                </th>
                                <th className="px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[110px]">
                                  AMOUNT
                                </th>
                                <th className="px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[200px]">
                                  DATE &amp; TIME
                                </th>
                                <th className="px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 w-[180px]">
                                  STATUS &amp; REMARK
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {paginatedUpi.map((s, index) => {
                                const isReverted = s.status === 'REVERTED';
                                const isRejected = s.status === 'REJECTED' || isReverted;
                                const isSuccess = s.status === 'SUCCESS' || s.status === 'CONFIRMED' || s.status === 'DELIVERED';
                                const cleanRemark = (s.admin_remark ?? '').replace(/^(Rejection Reason|Reason|Remark):\s*/i, '');
                                const totalCount = filteredUpi.length;
                                const serialNo = totalCount - ((currentPage - 1) * itemsPerPage + index);
                                return (
                                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="whitespace-nowrap px-3.5 py-3 text-xs font-mono text-slate-500">
                                      {serialNo}
                                    </td>
                                    <td className="px-3.5 py-3 text-xs">
                                      <p className="font-bold text-slate-900">{itemsSummary(s.items)}</p>
                                      <p className="mt-0.5 font-mono text-[11px] text-slate-500">Order #{s.order_id}</p>
                                    </td>
                                    <td className="whitespace-nowrap px-3.5 py-3 font-semibold text-slate-900 text-xs">
                                      {inr(Number(s.amount_paise) / 100)}
                                    </td>
                                    <td className="whitespace-nowrap px-3.5 py-3 text-xs text-slate-600">
                                      <p className="text-[11px] text-slate-500">
                                        <span className="font-semibold text-slate-600">Created:</span>{' '}
                                        <span className="text-slate-900">{formatDateTime(s.created_at)}</span>
                                      </p>
                                      <p className="mt-0.5 text-[11px] text-slate-500">
                                        <span className="font-semibold text-slate-600">Completed:</span>{' '}
                                        {s.completed_at ? (
                                          <span className="text-slate-900">{formatDateTime(s.completed_at)}</span>
                                        ) : (
                                          <span className="text-slate-400">-</span>
                                        )}
                                      </p>
                                    </td>
                                    <td className="px-3.5 py-3 text-xs">
                                      {isReverted ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                                          <XCircle className="h-3 w-3" />
                                          Reverted
                                        </span>
                                      ) : isRejected ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                                          <XCircle className="h-3 w-3" />
                                          Rejected
                                        </span>
                                      ) : isSuccess ? (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Delivered
                                          </span>
                                          <button
                                            onClick={() => handleOpenUpiInvoice(s)}
                                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:border-brand-500 hover:bg-brand-50/60 hover:text-brand-700 transition shadow-xs"
                                            title="Download Invoice"
                                          >
                                            <FileText className="h-3 w-3 text-brand-600" />
                                            Invoice
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                                          <Clock className="h-3 w-3" />
                                          Pending Verification
                                        </span>
                                      )}
                                      {isRejected && cleanRemark && (
                                        <p className="mt-1 text-[11px] font-semibold text-rose-600">
                                          {cleanRemark}
                                        </p>
                                      )}
                                      {isReverted && cleanRemark && (
                                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                          {cleanRemark}
                                        </p>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Pagination footer */}
                      <div className="border-t border-slate-100 p-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <p className="text-xs text-slate-500">
                          Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredUpi.length)} of {filteredUpi.length} orders
                        </p>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage <= 1}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" /> Previous
                          </button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                              <button
                                key={p}
                                onClick={() => setCurrentPage(p)}
                                className={`min-w-[2rem] h-8 rounded-lg text-xs font-bold transition-colors ${
                                  p === currentPage
                                    ? 'bg-brand-600 text-white shadow-sm'
                                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage >= totalPages}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Next <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

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
                      <div className="flex items-center gap-2">
                        <StatusBadge status={order.status} />
                        {order.status === 'successful' && (
                          <button
                            onClick={() => handleOpenOrderInvoice(order)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-brand-500 hover:bg-brand-50/60 hover:text-brand-700 transition shadow-xs"
                            title="Download Invoice"
                          >
                            <FileText className="h-3.5 w-3.5 text-brand-600" />
                            Invoice
                          </button>
                        )}
                      </div>
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

        {/* Reusable Tax Invoice Modal */}
        <OrderInvoiceModal
          isOpen={isInvoiceOpen}
          onClose={() => setIsInvoiceOpen(false)}
          invoice={selectedInvoice}
        />
      </div>
    </div>
  );
}
