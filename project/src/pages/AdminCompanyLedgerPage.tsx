import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  Printer,
  ChevronRight,
  ChevronLeft,
  Building2,
  TrendingDown,
  TrendingUp,
  Receipt,
  IndianRupee,
  Plus,
  RefreshCw,
  FileSpreadsheet,
  Check,
  Copy,
  X,
  Loader2,
  Scale,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { AdminTopBar, AdminBackButton } from '@/components/AdminHeader';
import { inr, inrDecimal, formatDateTime, formatDate } from '@/lib/format';
import { useToast } from '@/components/Toast';
import type { CompanyLedgerEntry, CompanyTransactionType } from '@/lib/types';

export type UnifiedCompanyTransaction = {
  id: string;
  date: string; // ISO timestamp
  voucherType: string;
  category: CompanyTransactionType;
  referenceNo: string;
  particulars: string;
  debit: number; // in rupees (outflow / expense / payout / refund)
  credit: number; // in rupees (inflow / sales revenue)
  balance: number; // running cumulative balance in rupees
  balanceType: 'Cr' | 'Dr';
  source: 'orders' | 'purchases' | 'upi_payment_sessions' | 'company_ledger';
};

// Quick date presets
const getPresetDates = (preset: 'today' | 'this_month' | 'financial_year' | 'all') => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'today') {
    const todayStr = formatYMD(now);
    return { from: todayStr, to: todayStr };
  }
  if (preset === 'this_month') {
    const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const to = formatYMD(now);
    return { from, to };
  }
  if (preset === 'financial_year') {
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (3 = April)
    const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    const fyEndYear = fyStartYear + 1;
    return {
      from: `${fyStartYear}-04-01`,
      to: `${fyEndYear}-03-31`,
    };
  }
  return { from: '', to: '' };
};

const itemsSummary = (items: unknown): string => {
  if (!Array.isArray(items) || items.length === 0) return 'Voucher purchase';
  try {
    return items
      .map((it) => {
        const line = it as { brand_slug?: string; brand_name?: string; quantity?: number; amount?: number };
        const label = line.brand_name || (typeof line.brand_slug === 'string' ? line.brand_slug.replace(/-/g, ' ') : 'Gift Card');
        return `${line.quantity ?? 1}× ${label}`;
      })
      .join(' · ');
  } catch {
    return 'Voucher purchase';
  }
};

const DUMMY_MOCK_LEDGER_IDS = new Set([
  'b150769c-1556-4c6b-9e95-f9526cb747a7',
  'b4356114-808f-430c-a12e-6ac7f60307e6',
]);

export default function AdminCompanyLedgerPage() {
  const { admin } = useAdminAuth();
  const navigate = useNavigate();
  const { push } = useToast();

  // Authentication check
  useEffect(() => {
    if (!admin) {
      navigate('/admin', { replace: true });
    }
  }, [admin, navigate]);

  // Loading and data state
  const [loading, setLoading] = useState(true);
  const [rawTransactions, setRawTransactions] = useState<UnifiedCompanyTransaction[]>([]);

  // Filter state
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activePreset, setActivePreset] = useState<'today' | 'this_month' | 'financial_year' | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CompanyTransactionType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Modal state for recording new manual company ledger entry
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [recordSubmitting, setRecordSubmitting] = useState(false);
  const [newType, setNewType] = useState<CompanyTransactionType>('expense');
  const [newAmount, setNewAmount] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newReference, setNewReference] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch all company transactions
  const loadCompanyLedger = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, purchasesRes, upiSessionsRes, companyLedgerRes] = await Promise.all([
        supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: true }),
        supabase
          .from('purchases')
          .select('*')
          .order('created_at', { ascending: true }),
        supabase
          .from('upi_payment_sessions')
          .select('*')
          .order('created_at', { ascending: true }),
        supabase
          .from('company_ledger')
          .select('*')
          .order('created_at', { ascending: true }),
      ]);

      const ordersList = ordersRes.data ?? [];
      const purchasesList = purchasesRes.data ?? [];
      const upiSessionsList = upiSessionsRes.data ?? [];
      const companyLedgerList = companyLedgerRes.data ?? [];

      const transactions: UnifiedCompanyTransaction[] = [];
      const coveredOrderIds = new Set<string>();
      const coveredSessionIds = new Set<string>();

      // 1. Fulfilled Orders (Direct & Wallet Checkouts)
      ordersList.forEach((order) => {
        const isFulfilled =
          order.status === 'successful' ||
          order.status === 'completed' ||
          order.status === 'delivered';
        if (!isFulfilled) return;

        coveredOrderIds.add(order.id);
        if (order.razorpay_order_id) coveredOrderIds.add(order.razorpay_order_id);
        if (order.youpi_order_id || order.upi_order_id) coveredOrderIds.add(order.youpi_order_id || order.upi_order_id);

        const amountRs = Number(order.total_amount || 0);
        const refNo =
          order.razorpay_order_id ||
          order.youpi_order_id ||
          order.upi_order_id ||
          `GK-${order.id.slice(0, 8).toUpperCase()}`;

        transactions.push({
          id: `ORD-${order.id}`,
          date: order.created_at,
          voucherType: 'Sales / Order',
          category: 'revenue',
          referenceNo: refNo,
          particulars: `Voucher Sales: ${itemsSummary(order.items)}`,
          debit: 0,
          credit: amountRs,
          balance: 0,
          balanceType: 'Cr',
          source: 'orders',
        });
      });

      // 2. Gift Card Purchases from purchases table (canonical vouchers)
      purchasesList.forEach((p) => {
        // If purchase is already associated with an order ID we processed, avoid double-counting
        if (coveredOrderIds.has(p.session_id) || coveredSessionIds.has(p.session_id)) {
          return;
        }
        coveredSessionIds.add(p.session_id);

        const amountRs = Number(p.amount || 0) * (p.quantity || 1);
        const refNo = p.gift_card_code || `VOUCH-${p.id.slice(0, 8).toUpperCase()}`;
        const recipient = p.recipient_name || p.recipient_email || 'Customer';

        transactions.push({
          id: `PUR-${p.id}`,
          date: p.created_at,
          voucherType: 'Sales / Voucher',
          category: 'revenue',
          referenceNo: refNo,
          particulars: `Gift Card Sale: ${p.brand_name} (${p.quantity || 1}× ${inr(p.amount)}) · ${recipient}`,
          debit: 0,
          credit: amountRs,
          balance: 0,
          balanceType: 'Cr',
          source: 'purchases',
        });
      });

      // 3. UPI Direct Payment Sessions
      upiSessionsList.forEach((s) => {
        const ref = s.reference || s.order_id || s.id;
        if (coveredOrderIds.has(s.order_id || '') || coveredSessionIds.has(s.id)) {
          return;
        }

        const isSuccess = s.status === 'SUCCESS' || s.status === 'CONFIRMED' || s.status === 'DELIVERED';
        const isReverted = s.status === 'REVERTED' || s.status === 'REFUNDED';
        const amountRs = Number(s.amount || (s.amount_paise ? s.amount_paise / 100 : 0));

        if (isSuccess && (s.category === 'VOUCHER' || s.session_type === 'voucher')) {
          coveredSessionIds.add(s.id);
          transactions.push({
            id: `UPI-${s.id}`,
            date: s.created_at,
            voucherType: 'Sales / UPI Direct',
            category: 'revenue',
            referenceNo: ref,
            particulars: `UPI Direct Voucher Purchase${s.customer_utr ? ` · UTR: ${s.customer_utr}` : ''}`,
            debit: 0,
            credit: amountRs,
            balance: 0,
            balanceType: 'Cr',
            source: 'upi_payment_sessions',
          });
        } else if (isReverted) {
          transactions.push({
            id: `UPI-REV-${s.id}`,
            date: s.completed_at || s.created_at,
            voucherType: 'Refund / Return',
            category: 'refund',
            referenceNo: ref,
            particulars: `Reversed UPI Session ${ref}${s.admin_remark ? ` · ${s.admin_remark}` : ''}`,
            debit: amountRs,
            credit: 0,
            balance: 0,
            balanceType: 'Cr',
            source: 'upi_payment_sessions',
          });
        }
      });

      // 4. Company Ledger entries (Operating expenses, brand payouts, custom journals)
      companyLedgerList.forEach((e: CompanyLedgerEntry) => {
        // Exclude hardcoded dummy mock entries
        if (DUMMY_MOCK_LEDGER_IDS.has(e.id)) return;
        if (e.description?.toLowerCase().includes('dummy')) return;

        const amountRs = Number(e.amount || 0);
        let voucherType = 'Operating Expense';
        let debit = 0;
        let credit = 0;

        if (e.transaction_type === 'revenue') {
          voucherType = 'Sales / Revenue';
          credit = amountRs;
        } else if (e.transaction_type === 'brand_payout') {
          voucherType = 'Brand Settlement';
          debit = amountRs;
        } else if (e.transaction_type === 'refund') {
          voucherType = 'Refund / Return';
          debit = amountRs;
        } else {
          voucherType = 'Operating Expense';
          debit = amountRs;
        }

        transactions.push({
          id: `CL-${e.id}`,
          date: e.created_at,
          voucherType,
          category: e.transaction_type,
          referenceNo: e.reference_id || `CL-${e.id.slice(0, 8).toUpperCase()}`,
          particulars: e.description || 'Company ledger transaction',
          debit,
          credit,
          balance: 0,
          balanceType: 'Cr',
          source: 'company_ledger',
        });
      });

      // Sort chronologically ascending to calculate running balance correctly
      transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let runningCumulative = 0;
      for (const item of transactions) {
        runningCumulative += (item.credit - item.debit);
        item.balance = Math.abs(runningCumulative);
        item.balanceType = runningCumulative >= 0 ? 'Cr' : 'Dr';
      }

      setRawTransactions(transactions);
    } catch (err) {
      console.error('Error loading company ledger:', err);
      push(err instanceof Error ? err.message : 'Failed to load company ledger data', 'error');
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void loadCompanyLedger();
  }, [loadCompanyLedger]);

  // Handle Preset Select
  const handlePresetSelect = (preset: 'today' | 'this_month' | 'financial_year' | 'all') => {
    setActivePreset(preset);
    const { from, to } = getPresetDates(preset);
    setFromDate(from);
    setToDate(to);
    setCurrentPage(1);
  };

  // Filter & Calculation Memo
  const {
    inPeriodTransactions,
    openingBalance,
    openingBalanceType,
    periodRevenue,
    periodPayouts,
    periodExpenses,
    periodRefunds,
    totalPeriodDebit,
    totalPeriodCredit,
    closingBalance,
    closingBalanceType,
  } = useMemo(() => {
    const fromTime = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
    const toTime = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Infinity;

    let priorCumulative = 0;
    const filtered: UnifiedCompanyTransaction[] = [];
    let rev = 0;
    let payouts = 0;
    let exp = 0;
    let ref = 0;
    let totDr = 0;
    let totCr = 0;

    for (const t of rawTransactions) {
      const tTime = new Date(t.date).getTime();
      if (tTime < fromTime) {
        priorCumulative += (t.credit - t.debit);
      } else if (tTime <= toTime) {
        // Filter by Transaction Type
        if (typeFilter !== 'all' && t.category !== typeFilter) {
          continue;
        }

        // Filter by Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const match =
            t.referenceNo.toLowerCase().includes(q) ||
            t.particulars.toLowerCase().includes(q) ||
            t.voucherType.toLowerCase().includes(q);
          if (!match) continue;
        }

        filtered.push(t);
        totDr += t.debit;
        totCr += t.credit;

        if (t.category === 'revenue') rev += t.credit;
        else if (t.category === 'brand_payout') payouts += t.debit;
        else if (t.category === 'expense') exp += t.debit;
        else if (t.category === 'refund') ref += t.debit;
      }
    }

    const openBal = Math.abs(priorCumulative);
    const openType: 'Cr' | 'Dr' = priorCumulative >= 0 ? 'Cr' : 'Dr';
    const closeCumulative = priorCumulative + totCr - totDr;
    const closeBal = Math.abs(closeCumulative);
    const closeType: 'Cr' | 'Dr' = closeCumulative >= 0 ? 'Cr' : 'Dr';

    return {
      inPeriodTransactions: filtered,
      openingBalance: openBal,
      openingBalanceType: openType,
      periodRevenue: rev,
      periodPayouts: payouts,
      periodExpenses: exp,
      periodRefunds: ref,
      totalPeriodDebit: totDr,
      totalPeriodCredit: totCr,
      closingBalance: closeBal,
      closingBalanceType: closeType,
    };
  }, [rawTransactions, fromDate, toDate, typeFilter, searchQuery]);

  // Sorted Transactions for Display
  const sortedTransactions = useMemo(() => {
    return [...inPeriodTransactions].sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [inPeriodTransactions, sortOrder]);

  // Pagination Calculations
  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);
  const paginatedTransactions = useMemo(() => {
    const start = (effectivePage - 1) * pageSize;
    return sortedTransactions.slice(start, start + pageSize);
  }, [sortedTransactions, effectivePage, pageSize]);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // CSV Export for Tally / ERP
  const handleExportCSV = () => {
    if (sortedTransactions.length === 0) {
      push('No transactions to export for current filter.', 'error');
      return;
    }

    const headers = [
      'Date & Time',
      'Voucher Type',
      'Reference / Voucher No',
      'Account / Particulars',
      'Debit (Dr)',
      'Credit (Cr)',
      'Net Balance',
      'Balance Type',
    ];

    const rows = sortedTransactions.map((tx) => [
      `"${formatDateTime(tx.date).replace(/"/g, '""')}"`,
      `"${tx.voucherType.replace(/"/g, '""')}"`,
      `"${tx.referenceNo.replace(/"/g, '""')}"`,
      `"${tx.particulars.replace(/"/g, '""')}"`,
      tx.debit.toFixed(2),
      tx.credit.toFixed(2),
      tx.balance.toFixed(2),
      tx.balanceType,
    ]);

    // Summary totals row
    rows.push([
      '"---"',
      '"TOTALS"',
      '""',
      `"Opening: ${inrDecimal(openingBalance)} ${openingBalanceType} | Closing: ${inrDecimal(closingBalance)} ${closingBalanceType}"`,
      totalPeriodDebit.toFixed(2),
      totalPeriodCredit.toFixed(2),
      closingBalance.toFixed(2),
      closingBalanceType,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `GyftKart_Company_Ledger_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    push('Tally Ledger CSV exported successfully.', 'success');
  };

  // Print Statement View
  const handlePrint = () => {
    window.print();
  };

  // Submit manual company ledger record
  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(newAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      push('Please enter a valid positive transaction amount.', 'error');
      return;
    }
    if (!newDescription.trim()) {
      push('Description / Particulars is required.', 'error');
      return;
    }

    setRecordSubmitting(true);
    try {
      const { error } = await supabase.from('company_ledger').insert({
        transaction_type: newType,
        amount: amountVal,
        description: newDescription.trim(),
        reference_id: newReference.trim() || null,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      push('Company ledger entry recorded successfully.', 'success');
      setIsRecordModalOpen(false);
      setNewAmount('');
      setNewDescription('');
      setNewReference('');
      void loadCompanyLedger();
    } catch (err) {
      console.error('Failed to insert company ledger entry:', err);
      push(err instanceof Error ? err.message : 'Failed to save entry', 'error');
    } finally {
      setRecordSubmitting(false);
    }
  };

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white print:p-0">
      <div className="print:hidden">
        <AdminTopBar />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:max-w-none">
        {/* Breadcrumb & Navigation */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
            <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
              Admin
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 font-semibold">Company Ledger</span>
          </nav>
          <div className="flex items-center gap-3">
            <AdminBackButton />
          </div>
        </div>

        {/* Print-Only Header */}
        <div className="hidden print:block mb-8 border-b border-slate-300 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900">GYFTKART TECHNOLOGIES</h1>
              <p className="text-xs text-slate-600 font-medium">
                Company General Ledger &amp; Financial Statement (Double-Entry Books)
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Generated: {formatDateTime(new Date().toISOString())}</p>
              <p>Period: {fromDate || 'Inception'} to {toDate || 'Present'}</p>
              <p>Auditor: {admin?.email ?? 'gyftkart@gmail.com'}</p>
            </div>
          </div>
        </div>

        {/* Page Title & Actions Toolbar */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="grid place-items-center h-10 w-10 rounded-2xl bg-brand-600 text-white shadow-glow-sm">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-extrabold text-slate-900">Company General Ledger</h1>
                <p className="text-xs text-slate-500">
                  Financial statements, profit &amp; loss breakdown, and Tally-compatible books
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => void loadCompanyLedger()}
              disabled={loading}
              title="Refresh ledger data"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-soft disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setIsRecordModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors shadow-soft"
            >
              <Plus className="h-3.5 w-3.5" /> Record Entry
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-soft"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export Tally CSV
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-soft"
            >
              <Printer className="h-3.5 w-3.5 text-slate-600" /> Print Statement
            </button>
          </div>
        </div>

        {/* Financial Overview KPI Cards (User Specified) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* 1. Total Sales / Revenue */}
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-glow-sm">
                <TrendingUp className="h-5 w-5" />
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                Inflow (Cr)
              </span>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Total Sales / Revenue</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-900">{inr(periodRevenue)}</p>
            <p className="mt-1 text-[11px] text-slate-400">From fulfilled orders &amp; vouchers</p>
          </div>

          {/* 2. Brand Payouts / Cost of Goods */}
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-glow-sm">
                <TrendingDown className="h-5 w-5" />
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                COGS (Dr)
              </span>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Brand Payouts / COGS</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-900">{inr(periodPayouts)}</p>
            <p className="mt-1 text-[11px] text-slate-400">Partner brand procurement settlements</p>
          </div>

          {/* 3. Operating / Platform Expenses */}
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-glow-sm">
                <Receipt className="h-5 w-5" />
              </span>
              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                Outflow (Dr)
              </span>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Operating Expenses</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-900">
              {inr(periodExpenses + periodRefunds)}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Ops: {inr(periodExpenses)} · Refunds: {inr(periodRefunds)}
            </p>
          </div>

          {/* 4. Net P&L / Position */}
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm">
                <IndianRupee className="h-5 w-5" />
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  closingBalanceType === 'Cr' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {closingBalanceType === 'Cr' ? 'Net Profit (Cr)' : 'Net Deficit (Dr)'}
              </span>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Net P&amp;L / Position</p>
            <p
              className={`mt-1 font-display text-2xl font-extrabold ${
                closingBalanceType === 'Cr' ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {inr(closingBalance)} {closingBalanceType}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">Cumulative net position</p>
          </div>
        </div>

        {/* Date & Type Filter Toolbar (User Specified) */}
        <div className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-soft print:hidden">
          <div className="flex flex-col gap-4">
            {/* Row 1: Presets & Custom Dates */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Presets */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1 rounded-2xl">
                {(
                  [
                    { id: 'today', label: 'Today' },
                    { id: 'this_month', label: 'This Month' },
                    { id: 'financial_year', label: 'FY' },
                    { id: 'all', label: 'All Time' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handlePresetSelect(p.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activePreset === p.id
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Inputs */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                  <span>From:</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setActivePreset('all');
                      setCurrentPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                  <span>To:</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setActivePreset('all');
                      setCurrentPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                {(fromDate || toDate) && (
                  <button
                    onClick={() => {
                      setFromDate('');
                      setToDate('');
                      setActivePreset('all');
                      setCurrentPage(1);
                    }}
                    className="rounded-xl p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    title="Clear date filter"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Type Filter, Search, and Rows per Page */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              {/* Transaction Type Filter */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/70 p-1 rounded-2xl">
                {(
                  [
                    { id: 'all', label: 'All Types' },
                    { id: 'revenue', label: 'Revenue / Sales' },
                    { id: 'brand_payout', label: 'Brand Settlement' },
                    { id: 'refund', label: 'Refund / Return' },
                    { id: 'expense', label: 'Expense' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setTypeFilter(tab.id);
                      setCurrentPage(1);
                    }}
                    className={`rounded-xl px-3 py-1 text-xs font-semibold transition-colors ${
                      typeFilter === tab.id
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search & Rows Per Page */}
              <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-initial justify-end">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search voucher, order, or description…"
                    className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-7 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-slate-400"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Compact Rows Per Page Dropdown */}
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  title="Items per page"
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none hover:border-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>

                <button
                  onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  title="Toggle sort direction"
                >
                  Date: {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tally / Accounting Friendly Ledger Table */}
        <div className="rounded-3xl border border-slate-100 bg-white shadow-soft overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                General Ledger Statement &amp; Journal Records
              </h2>
              <p className="text-xs text-slate-400">
                Showing {sortedTransactions.length} transaction{sortedTransactions.length === 1 ? '' : 's'} · Double-entry accounting format
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-semibold text-slate-500">
                Period Debits (Dr): <span className="text-rose-600 font-bold">{inrDecimal(totalPeriodDebit)}</span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-slate-500">
                Period Credits (Cr): <span className="text-emerald-600 font-bold">{inrDecimal(totalPeriodCredit)}</span>
              </span>
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
              <p className="mt-2 text-sm text-slate-500">Loading company ledger transactions…</p>
            </div>
          ) : sortedTransactions.length === 0 ? (
            <div className="py-20 text-center">
              <Scale className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-3 text-sm font-bold text-slate-800">No company ledger entries found</h3>
              <p className="mt-1 text-xs text-slate-400">
                Try adjusting your date range, type filter, or search keywords.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[850px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Date &amp; Time</th>
                    <th className="py-3 px-4">Voucher / Txn Type</th>
                    <th className="py-3 px-4">Reference / Order No.</th>
                    <th className="py-3 px-4">Account / Particulars</th>
                    <th className="py-3 px-4 text-right">Debit (Dr)</th>
                    <th className="py-3 px-4 text-right">Credit (Cr)</th>
                    <th className="py-3 px-4 text-right">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {/* Opening Balance Row if date filter is active */}
                  {fromDate && (
                    <tr className="bg-slate-50/40 text-slate-500 italic">
                      <td className="py-3 px-4">{formatDate(fromDate)}</td>
                      <td className="py-3 px-4">
                        <span className="inline-block rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 not-italic">
                          Opening Balance
                        </span>
                      </td>
                      <td className="py-3 px-4">B/F</td>
                      <td className="py-3 px-4 font-semibold text-slate-600">Balance Brought Forward</td>
                      <td className="py-3 px-4 text-right font-mono">-</td>
                      <td className="py-3 px-4 text-right font-mono">-</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 not-italic">
                        {inrDecimal(openingBalance)}{' '}
                        <span className="text-[10px] font-bold text-slate-500">{openingBalanceType}</span>
                      </td>
                    </tr>
                  )}

                  {paginatedTransactions.map((tx) => {
                    const isCredit = tx.credit > 0 && tx.debit === 0;
                    const isDebit = tx.debit > 0 && tx.credit === 0;

                    let badgeColor = 'bg-slate-100 text-slate-700 border border-slate-200';
                    if (tx.category === 'revenue') badgeColor = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
                    else if (tx.category === 'brand_payout') badgeColor = 'bg-amber-50 text-amber-800 border border-amber-200';
                    else if (tx.category === 'expense') badgeColor = 'bg-rose-50 text-rose-800 border border-rose-200';
                    else if (tx.category === 'refund') badgeColor = 'bg-amber-50 text-amber-800 border border-amber-200';

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                          {formatDateTime(tx.date)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
                            {tx.voucherType}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700">
                            <span>{tx.referenceNo}</span>
                            <button
                              onClick={() => handleCopy(tx.referenceNo, tx.id)}
                              className="text-slate-400 hover:text-slate-700"
                              title="Copy Reference"
                            >
                              {copiedId === tx.id ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-sm truncate text-slate-800" title={tx.particulars}>
                          {tx.particulars}
                        </td>
                        <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                          {isDebit ? (
                            <span className="text-rose-600 font-bold">
                              {inrDecimal(tx.debit)}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                          {isCredit ? (
                            <span className="text-emerald-600 font-bold">
                              {inrDecimal(tx.credit)}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono whitespace-nowrap font-bold text-slate-900">
                          {inrDecimal(tx.balance)}{' '}
                          <span
                            className={`text-[10px] font-bold ${
                              tx.balanceType === 'Cr' ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {tx.balanceType}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-100/70 font-bold text-slate-900">
                    <td colSpan={4} className="py-3.5 px-4 text-right uppercase tracking-wider text-[11px] text-slate-600">
                      Period Totals &amp; Closing Position:
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-rose-600">
                      {inrDecimal(totalPeriodDebit)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-emerald-600">
                      {inrDecimal(totalPeriodCredit)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">
                      {inrDecimal(closingBalance)}{' '}
                      <span
                        className={`text-[10px] ${
                          closingBalanceType === 'Cr' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {closingBalanceType}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {sortedTransactions.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-100 bg-white print:hidden text-xs text-slate-500">
              <div>
                Showing {(effectivePage - 1) * pageSize + 1} to{' '}
                {Math.min(effectivePage * pageSize, sortedTransactions.length)} of{' '}
                <span className="font-bold text-slate-800">{sortedTransactions.length}</span> transactions
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={effectivePage <= 1}
                  className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:hover:bg-white"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 font-semibold text-slate-700">
                  Page {effectivePage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={effectivePage >= totalPages}
                  className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:hover:bg-white"
                  title="Next Page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Record Entry Modal */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="grid place-items-center h-8 w-8 rounded-xl bg-brand-50 text-brand-700">
                  <Receipt className="h-4 w-4" />
                </div>
                <h3 className="font-display text-lg font-bold text-slate-900">Record Company Transaction</h3>
              </div>
              <button
                onClick={() => setIsRecordModalOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRecordSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Transaction Type
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as CompanyTransactionType)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                >
                  <option value="expense">Operating / Platform Expense (Dr)</option>
                  <option value="brand_payout">Brand Settlement / Procurement (Dr)</option>
                  <option value="revenue">Sales / Revenue Adjustment (Cr)</option>
                  <option value="refund">Refund / Reversal (Dr)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Amount (₹ INR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="e.g. 5000"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-slate-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Particulars / Description
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AWS Cloud Hosting Fee - March"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Reference / Voucher No. (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-2026-0042"
                  value={newReference}
                  onChange={(e) => setNewReference(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-slate-400 font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  {recordSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
