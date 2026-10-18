import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  Search,
  X,
  FileSpreadsheet,
  RefreshCw,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  FileText,
  IndianRupee,
  Gift,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';
import { AdminTopBar } from '@/components/AdminHeader';
import { inr, inrDecimal, formatDateTime } from '@/lib/format';
import { OrderInvoiceModal } from '@/components/OrderInvoiceModal';
import { type InvoiceData } from '@/lib/invoice';

export type Purchase = {
  id: string;
  session_id: string;
  brand_name: string;
  brand_color: string;
  brand_color2: string;
  amount: number;
  quantity: number;
  recipient_name: string;
  recipient_email: string;
  recipient_phone: string;
  occasion: string;
  gift_card_code: string;
  status: string;
  balance: number;
  created_at: string;
};

export default function AdminGiftCardSalesPage() {
  const { admin } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'redeemed' | 'expired' | 'cancelled'>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Copy feedback
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Invoice modal state
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  const loadPurchases = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPurchases((data ?? []) as Purchase[]);
      if (isRefresh) push('Sales records refreshed', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to load gift card sales', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [push]);

  useEffect(() => {
    if (!admin) {
      navigate('/admin', { replace: true });
      return;
    }
    loadPurchases();
  }, [admin, navigate, loadPurchases]);

  // Unique list of brands for dropdown
  const uniqueBrands = useMemo(() => {
    const set = new Set<string>();
    purchases.forEach((p) => {
      if (p.brand_name) set.add(p.brand_name);
    });
    return Array.from(set).sort();
  }, [purchases]);

  // Filtered & Sorted Sales
  const filteredSales = useMemo(() => {
    let result = purchases;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((p) => (p.status || '').toLowerCase() === statusFilter);
    }

    // Brand filter
    if (brandFilter !== 'all') {
      result = result.filter((p) => p.brand_name === brandFilter);
    }

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.brand_name.toLowerCase().includes(q) ||
          p.recipient_name.toLowerCase().includes(q) ||
          p.recipient_email.toLowerCase().includes(q) ||
          p.recipient_phone.toLowerCase().includes(q) ||
          p.gift_card_code.toLowerCase().includes(q) ||
          p.session_id.toLowerCase().includes(q)
      );
    }

    // Sorting
    return [...result].sort((a, b) => {
      if (sortBy === 'date_asc') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'amount_desc') {
        return Number(b.amount) * b.quantity - Number(a.amount) * a.quantity;
      }
      if (sortBy === 'amount_asc') {
        return Number(a.amount) * a.quantity - Number(b.amount) * b.quantity;
      }
      // default: date_desc
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [purchases, statusFilter, brandFilter, search, sortBy]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, brandFilter, sortBy]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSales.slice(start, start + pageSize);
  }, [filteredSales, currentPage, pageSize]);

  // Metrics summary
  const metrics = useMemo(() => {
    const totalRev = purchases.reduce((sum, p) => sum + Number(p.amount) * p.quantity, 0);
    const totalQty = purchases.reduce((sum, p) => sum + p.quantity, 0);
    const activeCards = purchases.filter((p) => (p.status || '').toLowerCase() === 'active').length;
    return {
      totalRev,
      totalOrders: purchases.length,
      totalQty,
      activeCards,
    };
  }, [purchases]);

  // Copy code handler
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    push('Gift card code copied to clipboard', 'info');
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Open invoice handler
  const handleOpenInvoice = (p: Purchase) => {
    const total = Number(p.amount) * p.quantity;
    const invData: InvoiceData = {
      invoiceNumber: `INV-${p.id.slice(0, 8).toUpperCase()}`,
      orderId: p.session_id || p.id,
      date: p.created_at,
      paymentMethod: 'UPI Direct / Gateway',
      status: p.status || 'CONFIRMED',
      customer: {
        name: p.recipient_name || 'Customer',
        email: p.recipient_email || '—',
        phone: p.recipient_phone || '—',
      },
      items: [
        {
          id: p.id,
          name: `${p.brand_name} Gift Card`,
          brandName: p.brand_name,
          quantity: p.quantity,
          unitPrice: Number(p.amount),
          totalPrice: total,
        },
      ],
      subtotal: total,
      totalAmount: total,
      category: 'GIFT_CARD',
    };
    setSelectedInvoice(invData);
    setIsInvoiceOpen(true);
  };

  // Export CSV handler
  const handleExportCsv = () => {
    if (filteredSales.length === 0) {
      push('No sales data to export', 'error');
      return;
    }

    const headers = [
      'S.No.',
      'Order ID',
      'Brand',
      'Recipient Name',
      'Recipient Email',
      'Recipient Phone',
      'Card Amount',
      'Quantity',
      'Total Value',
      'Card Code',
      'Balance',
      'Occasion',
      'Status',
      'Created At',
    ];

    const rows = filteredSales.map((p, idx) => [
      String(idx + 1),
      p.session_id || p.id,
      p.brand_name,
      `"${(p.recipient_name || '').replace(/"/g, '""')}"`,
      p.recipient_email || '',
      p.recipient_phone || '',
      String(p.amount),
      String(p.quantity),
      String(Number(p.amount) * p.quantity),
      p.gift_card_code,
      String(p.balance),
      `"${(p.occasion || '').replace(/"/g, '""')}"`,
      p.status,
      p.created_at,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GyftKart-GiftCard-Sales-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    push(`Exported ${filteredSales.length} sales records to CSV`, 'success');
  };

  const statusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'active') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (s === 'redeemed') return 'bg-brand-100 text-brand-800 border-brand-200';
    if (s === 'expired') return 'bg-rose-100 text-rose-800 border-rose-200';
    if (s === 'cancelled') return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-amber-100 text-amber-800 border-amber-200';
  };

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb & Navigation */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
            <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
              Admin
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 font-semibold">Gift Card Sales</span>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadPurchases(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-brand-600 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              to="/admin/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin Dashboard
            </Link>
          </div>
        </div>

        {/* Page Title & Overview */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-brand-50 text-brand-700 border border-brand-100 shadow-sm">
                <ShoppingBag className="h-5 w-5" />
              </span>
              Gift Card Sales
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Real-time audit log of issued gift vouchers, recipient contacts, codes, and balances.
            </p>
          </div>

          <button
            onClick={handleExportCsv}
            disabled={filteredSales.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Export CSV ({filteredSales.length})
          </button>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Gross Sales Revenue</span>
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700">
                <IndianRupee className="h-4 w-4" />
              </span>
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-2">{inrDecimal(metrics.totalRev)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Across {metrics.totalOrders} total orders</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Cards Issued</span>
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-50 text-brand-700">
                <Gift className="h-4 w-4" />
              </span>
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-2">{metrics.totalQty}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Total voucher quantities sold</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Active Gift Cards</span>
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-teal-50 text-teal-700">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-2">{metrics.activeCards}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Live cards with active balance</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Unique Brands</span>
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-purple-50 text-purple-700">
                <Filter className="h-4 w-4" />
              </span>
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-2">{uniqueBrands.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Distinct brands purchased</p>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft mb-6 space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by brand, recipient name, email, phone, code or order ID…"
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 py-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Brand Filter */}
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-brand-400"
              >
                <option value="all">All Brands ({purchases.length})</option>
                {uniqueBrands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'redeemed' | 'expired' | 'cancelled')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-brand-400"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="redeemed">Redeemed</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>

              {/* Sort Order */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-brand-400"
              >
                <option value="date_desc">Newest First</option>
                <option value="date_asc">Oldest First</option>
                <option value="amount_desc">Amount: High to Low</option>
                <option value="amount_asc">Amount: Low to High</option>
              </select>

              {(search || statusFilter !== 'all' || brandFilter !== 'all' || sortBy !== 'date_desc') && (
                <button
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                    setBrandFilter('all');
                    setSortBy('date_desc');
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sales Table */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-soft overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl shimmer" />
              ))}
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="py-16 text-center">
              <ShoppingBag className="mx-auto h-10 w-10 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">No gift card sales match your criteria</p>
              <p className="text-xs text-slate-400 mt-1">Try clearing your search query or status filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4 w-14 text-center">S. No.</th>
                    <th className="py-3.5 px-4">Brand</th>
                    <th className="py-3.5 px-4">Recipient</th>
                    <th className="py-3.5 px-4">Contact</th>
                    <th className="py-3.5 px-4 text-right">Amount (₹)</th>
                    <th className="py-3.5 px-4 text-center">Qty</th>
                    <th className="py-3.5 px-4 text-right">Total (₹)</th>
                    <th className="py-3.5 px-4">Gift Card Code</th>
                    <th className="py-3.5 px-4 text-right">Balance</th>
                    <th className="py-3.5 px-4">Created At</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-center">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedSales.map((p, idx) => {
                    const displayIndex = filteredSales.length - ((currentPage - 1) * pageSize + idx);
                    const totalVal = Number(p.amount) * p.quantity;
                    const isCopied = copiedCode === p.gift_card_code;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400 text-center font-bold">
                          #{displayIndex}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-white font-display font-bold text-[9px] shrink-0 shadow-xs"
                              style={{ background: `linear-gradient(135deg, ${p.brand_color || '#6b21a8'}, ${p.brand_color2 || '#3b0764'})` }}
                            >
                              {(p.brand_name || 'GK').slice(0, 2).toUpperCase()}
                            </span>
                            <span className="font-bold text-slate-900">{p.brand_name}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-800">{p.recipient_name || 'Self'}</span>
                          {p.occasion && (
                            <span className="block text-[10px] text-brand-600 font-medium">
                              For {p.occasion}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap max-w-[200px] truncate">
                          <span className="block font-medium text-slate-700">{p.recipient_email || '—'}</span>
                          {p.recipient_phone && (
                            <span className="block text-[11px] text-slate-400">{p.recipient_phone}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700 whitespace-nowrap">
                          {inrDecimal(Number(p.amount))}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap font-bold text-slate-800">
                          {p.quantity}
                        </td>
                        <td className="py-3 px-4 text-right font-extrabold text-slate-900 whitespace-nowrap">
                          {inr(totalVal)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-brand-700">
                              {p.gift_card_code}
                            </code>
                            <button
                              onClick={() => handleCopyCode(p.gift_card_code)}
                              className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
                              title="Copy code"
                            >
                              {isCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-medium text-slate-600">
                          {inrDecimal(Number(p.balance))}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {formatDateTime(p.created_at)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold capitalize ${statusBadge(p.status)}`}>
                            {p.status || 'Active'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleOpenInvoice(p)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition shadow-xs"
                            title="View GST Tax Invoice"
                          >
                            <FileText className="h-3 w-3 text-brand-600" /> Invoice
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {!loading && filteredSales.length > 0 && (
            <div className="border-t border-slate-100 p-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, filteredSales.length)} of {filteredSales.length} sales
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
          )}
        </div>
      </div>

      {/* Tax Invoice Modal */}
      <OrderInvoiceModal
        isOpen={isInvoiceOpen}
        onClose={() => setIsInvoiceOpen(false)}
        invoice={selectedInvoice}
      />
    </div>
  );
}
