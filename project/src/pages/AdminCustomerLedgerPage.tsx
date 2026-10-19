import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  Printer,
  ArrowUpDown,
  ChevronRight,
  ChevronLeft,
  Mail,
  Phone,
  Wallet,
  Banknote,
  Clock,
  FileSpreadsheet,
  ArrowLeft,
  X,
  Loader2,
  Copy,
  Check,
  TrendingDown,
  TrendingUp,
  FileText,
  Building2,
  Users,
  RefreshCw,
  PlusCircle,
  SlidersHorizontal,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { AdminTopBar, AdminBackButton } from '@/components/AdminHeader';
import { inrDecimal, formatDateTime } from '@/lib/format';
import { OrderInvoiceModal } from '@/components/OrderInvoiceModal';
import { extractInvoiceItems, type InvoiceData, COMPANY_DETAILS } from '@/lib/invoice';
import ManualWalletCreditModal, { type CustomerSummary } from '@/components/ManualWalletCreditModal';

export type CustomerProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  created_at: string;
  wallet_balance?: number; // rupees
  customer_type?: 'B2C' | 'B2B';
  company_name?: string | null;
  brand_trade_name?: string | null;
  gstin?: string | null;
  pan?: string | null;
  billing_address?: string | null;
  billing_state?: string | null;
  billing_city?: string | null;
  billing_pincode?: string | null;
  total_orders_txns?: number;
  last_active_date?: string | null;
};

export type LedgerTransaction = {
  id: string;
  date: string; // ISO timestamp
  voucherType: string;
  voucherNo: string;
  particulars: string;
  debit: number; // in rupees
  credit: number; // in rupees
  balance: number; // in rupees
  balanceType: 'Cr' | 'Dr';
  source: 'wallet_transactions' | 'orders' | 'upi_payment_sessions' | 'customer_ledger';
  status?: string;
  rawRef?: string;
  rawItems?: unknown;
  orderId?: string;
  paymentMethod?: string;
};

// Quick date presets
const getPresetDates = (preset: 'today' | 'this_month' | 'last_month' | 'financial_year' | 'all') => {
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
  if (preset === 'last_month') {
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      from: formatYMD(prevMonthDate),
      to: formatYMD(lastDayPrevMonth),
    };
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

export default function AdminCustomerLedgerPage() {
  const { admin } = useAdminAuth();
  const navigate = useNavigate();
  const { customerId: routeCustomerId } = useParams<{ customerId?: string }>();
  const [searchParams] = useSearchParams();

  // Active Customer ID from Route param or query param
  const activeCustomerId = routeCustomerId || searchParams.get('customerId') || searchParams.get('customer') || null;

  // View 1 (Customer Directory) state
  const [directorySearch, setDirectorySearch] = useState('');
  const [dirPageSize, setDirPageSize] = useState<number>(10);
  const [dirCurrentPage, setDirCurrentPage] = useState<number>(1);

  // Authentication check
  useEffect(() => {
    if (!admin) {
      navigate('/admin', { replace: true });
    }
  }, [admin, navigate]);

  // Customer state
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);

  // View 2 (Statement View) filter state
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activePreset, setActivePreset] = useState<'today' | 'this_month' | 'last_month' | 'financial_year' | 'all'>('all');
  const [voucherSearch, setVoucherSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination state for Statement View
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Raw transactions from DB
  const [rawTransactions, setRawTransactions] = useState<LedgerTransaction[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Invoice modal state
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  // Manual adjust modal state
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustCustomer, setAdjustCustomer] = useState<CustomerSummary | null>(null);

  const handleOpenLedgerInvoice = (tx: LedgerTransaction) => {
    if (!selectedCustomer) return;
    const isCredit = tx.credit > 0 && tx.debit === 0;
    const amountRs = tx.debit > 0 ? tx.debit : tx.credit;
    const invItems = extractInvoiceItems(tx.rawItems, amountRs);
    const invData: InvoiceData = {
      invoiceNumber: `INV-${tx.voucherNo}`,
      orderId: tx.orderId || tx.voucherNo,
      date: tx.date,
      paymentMethod: tx.paymentMethod || (isCredit ? 'UPI Direct / Bank' : 'Wallet'),
      paymentRef: tx.rawRef || null,
      status: tx.status || 'CONFIRMED',
      customer: {
        name: selectedCustomer.full_name || 'Customer',
        email: selectedCustomer.email || '',
        phone: selectedCustomer.phone || '',
        userId: selectedCustomer.id,
        customerType: selectedCustomer.customer_type,
        companyName: selectedCustomer.company_name ?? undefined,
        brandTradeName: selectedCustomer.brand_trade_name ?? undefined,
        gstin: selectedCustomer.gstin ?? undefined,
        pan: selectedCustomer.pan ?? undefined,
        billingAddress: selectedCustomer.billing_address ?? undefined,
        billingState: selectedCustomer.billing_state ?? undefined,
        billingCity: selectedCustomer.billing_city ?? undefined,
        billingPincode: selectedCustomer.billing_pincode ?? undefined,
      },
      items: invItems,
      subtotal: amountRs,
      totalAmount: amountRs,
      category: isCredit ? 'TOPUP' : 'VOUCHER',
    };
    setSelectedInvoice(invData);
    setIsInvoiceOpen(true);
  };

  // Load all customers with profile, wallet balance, and activity metrics
  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const [profilesRes, walletsRes, ordersRes, walletTxRes, upiSessionsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, phone, created_at, customer_type, company_name, brand_trade_name, gstin, pan, billing_address, billing_state, billing_city, billing_pincode')
          .or('customer_type.eq.B2C,customer_type.is.null')
          .order('created_at', { ascending: false }),
        supabase.from('wallets').select('id, user_id, balance'),
        supabase.from('orders').select('user_id, created_at'),
        supabase.from('wallet_transactions').select('user_id, created_at'),
        supabase.from('upi_payment_sessions').select('user_id, created_at'),
      ]);

      const walletMap = new Map<string, number>();
      if (walletsRes.data) {
        walletsRes.data.forEach((w) => {
          walletMap.set(w.user_id, Number(w.balance || 0) / 100);
        });
      }

      const activityCountMap = new Map<string, number>();
      const lastActiveMap = new Map<string, string>();

      const recordActivity = (userId: string | null | undefined, createdAt: string | null | undefined) => {
        if (!userId || !createdAt) return;
        activityCountMap.set(userId, (activityCountMap.get(userId) || 0) + 1);
        const currentMax = lastActiveMap.get(userId);
        if (!currentMax || new Date(createdAt).getTime() > new Date(currentMax).getTime()) {
          lastActiveMap.set(userId, createdAt);
        }
      };

      (ordersRes.data ?? []).forEach((o) => recordActivity(o.user_id, o.created_at));
      (walletTxRes.data ?? []).forEach((tx) => recordActivity(tx.user_id, tx.created_at));
      (upiSessionsRes.data ?? []).forEach((s) => recordActivity(s.user_id, s.created_at));

      const rawProfiles = profilesRes.data ?? [];
      const b2cProfiles = rawProfiles.filter(
        (p) => !p.customer_type || p.customer_type === 'B2C'
      );

      const list: CustomerProfile[] = b2cProfiles.map((p) => {
        const lastActive = lastActiveMap.get(p.id) || p.created_at || null;
        return {
          id: p.id,
          full_name: p.full_name || 'Unnamed Customer',
          email: p.email || '',
          phone: p.phone || '',
          created_at: p.created_at,
          wallet_balance: walletMap.get(p.id) ?? 0,
          customer_type: 'B2C',
          company_name: p.company_name,
          brand_trade_name: p.brand_trade_name,
          gstin: p.gstin,
          pan: p.pan,
          billing_address: p.billing_address,
          billing_state: p.billing_state,
          billing_city: p.billing_city,
          billing_pincode: p.billing_pincode,
          total_orders_txns: activityCountMap.get(p.id) || 0,
          last_active_date: lastActive,
        };
      });

      setCustomers(list);
    } catch (err) {
      console.error('Error loading customers for ledger:', err);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  // Synchronize selectedCustomer with activeCustomerId
  useEffect(() => {
    if (!activeCustomerId) {
      setSelectedCustomer(null);
    } else if (customers.length > 0) {
      const found = customers.find((c) => c.id === activeCustomerId);
      setSelectedCustomer(found || null);
    }
  }, [activeCustomerId, customers]);

  // Load customer ledger records
  const loadLedgerData = useCallback(async (customerId: string) => {
    setLedgerLoading(true);
    try {
      const [walletTxRes, ordersRes, upiSessionsRes, legacyLedgerRes] = await Promise.all([
        supabase
          .from('wallet_transactions')
          .select('*')
          .eq('user_id', customerId)
          .order('created_at', { ascending: true }),
        supabase
          .from('orders')
          .select('*')
          .eq('user_id', customerId)
          .order('created_at', { ascending: true }),
        supabase
          .from('upi_payment_sessions')
          .select('*')
          .eq('user_id', customerId)
          .order('created_at', { ascending: true }),
        supabase
          .from('customer_ledger')
          .select('*')
          .eq('user_id', customerId)
          .order('created_at', { ascending: true }),
      ]);

      const walletTxList = walletTxRes.data ?? [];
      const ordersList = ordersRes.data ?? [];
      const upiSessionsList = upiSessionsRes.data ?? [];
      const legacyLedgerList = legacyLedgerRes.data ?? [];

      // Build session map by order_id and id for easy enrichment
      const sessionByOrderId = new Map<string, typeof upiSessionsList[0]>();
      const sessionById = new Map<string, typeof upiSessionsList[0]>();
      upiSessionsList.forEach((s) => {
        if (s.order_id) sessionByOrderId.set(s.order_id, s);
        sessionById.set(s.id, s);
      });

      // Build orders map
      const orderByRef = new Map<string, typeof ordersList[0]>();
      ordersList.forEach((o) => {
        orderByRef.set(o.id, o);
        if (o.razorpay_order_id) orderByRef.set(o.razorpay_order_id, o);
        if (o.youpi_order_id) orderByRef.set(o.youpi_order_id, o);
        if (o.upi_order_id) orderByRef.set(o.upi_order_id, o);
      });

      const transactions: LedgerTransaction[] = [];
      const coveredOrderIds = new Set<string>();

      // 1. Map wallet_transactions
      walletTxList.forEach((tx) => {
        const isCredit = tx.type === 'CREDIT';
        const amountRs = Number(tx.amount || 0) / 100;
        const ordId = tx.order_id || tx.reference_id || '';
        if (ordId) coveredOrderIds.add(ordId);

        let voucherType = isCredit ? 'Receipt / Top-up' : 'Payment / Voucher Purchase';
        let particulars = tx.remark || tx.reference_id || 'Wallet transaction';

        const matchedSession = sessionByOrderId.get(ordId) || sessionById.get(ordId);
        const matchedOrder = orderByRef.get(ordId);

        if (tx.category === 'TOPUP') {
          voucherType = 'Receipt / Top-up';
          const utr = matchedSession?.customer_utr ? ` · UTR: ${matchedSession.customer_utr}` : '';
          particulars = `Wallet Top-up via UPI${utr}${tx.remark ? ` · ${tx.remark}` : ''}`;
        } else if (tx.category === 'VOUCHER_PURCHASE') {
          voucherType = 'Payment / Voucher Purchase';
          particulars = matchedOrder
            ? `Voucher Purchase: ${itemsSummary(matchedOrder.items)} · Order #${ordId.slice(0, 8).toUpperCase()}`
            : `Voucher Purchase · Order #${ordId.slice(0, 8).toUpperCase()}`;
        } else if (tx.category === 'ROLLBACK' || tx.category === 'REFUND') {
          if (isCredit) {
            voucherType = 'Receipt / Refund';
            particulars = `Refund / Return Credit: ${tx.remark || tx.reference_id || 'Reversal'}`;
          } else {
            voucherType = 'Journal / Adjustment';
            particulars = `Top-up Reversal / Return: ${tx.remark || tx.reference_id || 'Reversal by Admin'}`;
          }
        } else if (tx.category === 'ADJUSTMENT') {
          voucherType = 'Journal / Adjustment';
          particulars = `Admin Adjustment: ${tx.remark || tx.reference_id || 'Manual adjustment'}`;
        }

        transactions.push({
          id: tx.id,
          date: tx.created_at,
          voucherType,
          voucherNo: ordId || `WTX-${tx.id.slice(0, 8).toUpperCase()}`,
          particulars,
          debit: isCredit ? 0 : amountRs,
          credit: isCredit ? amountRs : 0,
          balance: 0,
          balanceType: 'Cr',
          source: 'wallet_transactions',
          rawRef: tx.reference_id,
          rawItems: matchedOrder?.items || matchedSession?.items || null,
          orderId: ordId || `WTX-${tx.id.slice(0, 8).toUpperCase()}`,
          paymentMethod: tx.category === 'TOPUP' ? 'UPI Direct' : 'Wallet',
        });
      });

      // 2. Map direct Orders (orders not paid through wallet debit)
      ordersList.forEach((order) => {
        if (!coveredOrderIds.has(order.id) && !coveredOrderIds.has(order.razorpay_order_id || '')) {
          const amountRs = Number(order.total_amount || 0);
          const paymentMethod = order.razorpay_payment_id
            ? 'Razorpay'
            : (order.youpi_payment_id || order.upi_payment_id)
            ? 'UPI Direct'
            : 'Online Payment';
          const refNo = order.razorpay_order_id || order.youpi_order_id || order.upi_order_id || `GK-${order.id.slice(0, 8).toUpperCase()}`;

          // Direct sales voucher record
          transactions.push({
            id: order.id,
            date: order.created_at,
            voucherType: 'Sales / Direct Order',
            voucherNo: refNo,
            particulars: `Direct Order: ${itemsSummary(order.items)} · Method: ${paymentMethod} (${order.status.toUpperCase()})`,
            debit: amountRs,
            credit: amountRs, // Double-entry direct payment balances out
            balance: 0,
            balanceType: 'Cr',
            source: 'orders',
            status: order.status,
            rawRef: order.razorpay_payment_id || order.youpi_payment_id || order.upi_payment_id,
            rawItems: order.items,
            orderId: refNo,
            paymentMethod,
          });
        }
      });

      // 3. Map legacy customer_ledger records if any unique
      legacyLedgerList.forEach((leg) => {
        const amountRs = Number(leg.amount || 0);
        const isCredit = leg.transaction_type === 'credit';
        transactions.push({
          id: leg.id,
          date: leg.created_at,
          voucherType: isCredit ? 'Receipt / Credit' : 'Payment / Debit',
          voucherNo: leg.reference_order_id ? `REF-${leg.reference_order_id.slice(0, 8).toUpperCase()}` : `LEG-${leg.id.slice(0, 8).toUpperCase()}`,
          particulars: leg.description || 'Customer ledger record',
          debit: isCredit ? 0 : amountRs,
          credit: isCredit ? amountRs : 0,
          balance: 0,
          balanceType: 'Cr',
          source: 'customer_ledger',
        });
      });

      // Sort all transactions chronologically ascending to compute accurate cumulative running balances
      transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let runningCumulative = 0;
      for (const item of transactions) {
        runningCumulative += (item.credit - item.debit);
        item.balance = Math.abs(runningCumulative);
        item.balanceType = runningCumulative >= 0 ? 'Cr' : 'Dr';
      }

      setRawTransactions(transactions);
    } catch (err) {
      console.error('Error loading ledger data:', err);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      void loadLedgerData(selectedCustomer.id);
      setCurrentPage(1);
    } else {
      setRawTransactions([]);
    }
  }, [selectedCustomer, loadLedgerData]);

  // Handle Preset Clicks
  const handlePresetSelect = (preset: 'today' | 'this_month' | 'last_month' | 'financial_year' | 'all') => {
    setActivePreset(preset);
    const { from, to } = getPresetDates(preset);
    setFromDate(from);
    setToDate(to);
    setCurrentPage(1);
  };

  // Calculations: Opening Balance, Debits, Credits, Closing Balance
  const { openingBalance, openingBalanceType, inPeriodTransactions, periodDebit, periodCredit, closingBalance, closingBalanceType } = useMemo(() => {
    const fromTime = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
    const toTime = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Infinity;

    let priorCumulative = 0;
    const inPeriod: LedgerTransaction[] = [];
    let totDebit = 0;
    let totCredit = 0;

    for (const t of rawTransactions) {
      const tTime = new Date(t.date).getTime();
      if (tTime < fromTime) {
        priorCumulative += (t.credit - t.debit);
      } else if (tTime <= toTime) {
        if (voucherSearch.trim()) {
          const q = voucherSearch.trim().toLowerCase();
          const match =
            t.voucherNo.toLowerCase().includes(q) ||
            t.particulars.toLowerCase().includes(q) ||
            t.voucherType.toLowerCase().includes(q);
          if (!match) continue;
        }
        inPeriod.push(t);
        totDebit += t.debit;
        totCredit += t.credit;
      }
    }

    const opBal = Math.abs(priorCumulative);
    const opType: 'Cr' | 'Dr' = priorCumulative >= 0 ? 'Cr' : 'Dr';

    const netClosing = priorCumulative + totCredit - totDebit;
    const clBal = Math.abs(netClosing);
    const clType: 'Cr' | 'Dr' = netClosing >= 0 ? 'Cr' : 'Dr';

    return {
      openingBalance: opBal,
      openingBalanceType: opType,
      inPeriodTransactions: inPeriod,
      periodDebit: totDebit,
      periodCredit: totCredit,
      closingBalance: clBal,
      closingBalanceType: clType,
    };
  }, [rawTransactions, fromDate, toDate, voucherSearch]);

  // Display transactions sorted by chosen order
  const sortedTransactions = useMemo(() => {
    const list = [...inPeriodTransactions];
    if (sortOrder === 'desc') {
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else {
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    return list;
  }, [inPeriodTransactions, sortOrder]);

  // Pagination slice for Statement View
  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / pageSize));
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTransactions.slice(start, start + pageSize);
  }, [sortedTransactions, currentPage, pageSize]);

  // View 1 (Directory) filter and pagination calculations
  const filteredDirectory = useMemo(() => {
    return customers.filter((c) => {
      if (!directorySearch.trim()) return true;
      const q = directorySearch.trim().toLowerCase();
      return (
        c.full_name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    });
  }, [customers, directorySearch]);

  const dirTotalPages = Math.max(1, Math.ceil(filteredDirectory.length / dirPageSize));
  const paginatedDirectory = useMemo(() => {
    const start = (dirCurrentPage - 1) * dirPageSize;
    return filteredDirectory.slice(start, start + dirPageSize);
  }, [filteredDirectory, dirCurrentPage, dirPageSize]);

  // Directory statistics
  const directoryStats = useMemo(() => {
    const totalCount = customers.length;
    const totalBalance = customers.reduce((sum, c) => sum + (c.wallet_balance || 0), 0);
    return { totalCount, totalBalance };
  }, [customers]);

  // Export to CSV / Excel
  const handleExportCsv = () => {
    if (!selectedCustomer) return;
    const customerName = selectedCustomer.full_name || 'Customer';
    const periodLabel = fromDate || toDate ? `${fromDate || 'Start'}_to_${toDate || 'Now'}` : 'All_Time';

    const headers = [
      'Date & Time',
      'Customer Name',
      'Customer Email',
      'Customer Phone',
      'Customer UUID',
      'Customer Type',
      'Company Name',
      'Voucher / Type',
      'Voucher No. / Ref ID',
      'Particulars / Narration',
      'Debit (INR)',
      'Credit (INR)',
      'Running Balance (INR)',
      'Balance Type (Dr/Cr)',
    ];

    const rows = sortedTransactions.map((tx) => [
      `"${formatDateTime(tx.date).replace(/"/g, '""')}"`,
      `"${customerName.replace(/"/g, '""')}"`,
      `"${selectedCustomer.email.replace(/"/g, '""')}"`,
      `"${selectedCustomer.phone.replace(/"/g, '""')}"`,
      `"${selectedCustomer.id}"`,
      `"${selectedCustomer.customer_type || 'B2C'}"`,
      `"${(selectedCustomer.company_name || '').replace(/"/g, '""')}"`,
      `"${tx.voucherType.replace(/"/g, '""')}"`,
      `"${tx.voucherNo.replace(/"/g, '""')}"`,
      `"${tx.particulars.replace(/"/g, '""')}"`,
      tx.debit.toFixed(2),
      tx.credit.toFixed(2),
      tx.balance.toFixed(2),
      tx.balanceType,
    ]);

    // Summary row
    rows.push([
      '"---"',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '"TOTALS"',
      '""',
      `"Opening: ${inrDecimal(openingBalance)} ${openingBalanceType} | Closing: ${inrDecimal(closingBalance)} ${closingBalanceType}"`,
      periodDebit.toFixed(2),
      periodCredit.toFixed(2),
      closingBalance.toFixed(2),
      closingBalanceType,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Customer_Ledger_${customerName.replace(/[^a-zA-Z0-9]/g, '_')}_${periodLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Dedicated isolated iframe print handler for customer account statement
  const handlePrint = () => {
    if (!selectedCustomer) return;

    // Remove any previous print frame to avoid stale DOM accumulation
    const oldFrame = document.getElementById('gyftkart-customer-ledger-print-frame');
    if (oldFrame) {
      try {
        oldFrame.remove();
      } catch {
        // ignore
      }
    }

    // Create an isolated iframe with explicit dimensions so Chrome never collapses to 0x0
    const printFrame = document.createElement('iframe');
    printFrame.id = 'gyftkart-customer-ledger-print-frame';
    printFrame.style.position = 'fixed';
    printFrame.style.top = '0';
    printFrame.style.left = '0';
    printFrame.style.width = '1000px';
    printFrame.style.height = '1000px';
    printFrame.style.border = 'none';
    printFrame.style.zIndex = '-9999';
    printFrame.style.opacity = '0.01';
    printFrame.style.pointerEvents = 'none';
    document.body.appendChild(printFrame);

    const frameWindow = printFrame.contentWindow;
    if (!frameWindow) return;

    const doc = frameWindow.document;

    const escapeHtml = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const customerName = selectedCustomer.full_name || 'Customer';
    const periodLabel = fromDate || toDate
      ? `${fromDate || 'Beginning'} through ${toDate || 'Present'}`
      : 'All Recorded Transactions';
    const generatedDateStr = formatDateTime(new Date().toISOString());

    // Generate table rows for ALL sorted transactions in the selected period
    const tableRowsHtml =
      sortedTransactions.length === 0
        ? `
          <tr>
            <td colspan="8" style="border: 1px solid #cbd5e1; padding: 24px; text-align: center; color: #64748b; font-size: 11px;">
              No ledger transactions recorded for this customer in the selected date range.
            </td>
          </tr>
        `
        : sortedTransactions
            .map((tx, idx) => {
              const rowNumber = idx + 1;
              const isDebit = tx.debit > 0;
              const isCredit = tx.credit > 0;
              const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
              return `
                <tr style="background-color: ${rowBg}; border-bottom: 1px solid #cbd5e1; font-size: 10px;">
                  <td style="border: 1px solid #cbd5e1; padding: 6px 8px; font-family: monospace; color: #64748b; text-align: center;">${rowNumber}</td>
                  <td style="border: 1px solid #cbd5e1; padding: 6px 8px; font-weight: 500; color: #1e293b; white-space: nowrap;">${escapeHtml(formatDateTime(tx.date))}</td>
                  <td style="border: 1px solid #cbd5e1; padding: 6px 8px; white-space: nowrap;">
                    <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; background-color: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1;">
                      ${escapeHtml(tx.voucherType)}
                    </span>
                  </td>
                  <td style="border: 1px solid #cbd5e1; padding: 6px 8px; font-family: monospace; font-size: 10px; font-weight: 600; color: #0f172a; word-break: break-all;">${escapeHtml(tx.voucherNo)}</td>
                  <td style="border: 1px solid #cbd5e1; padding: 6px 8px; color: #1e293b; font-weight: 500;">${escapeHtml(tx.particulars)}</td>
                  <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; font-family: monospace; font-weight: 600; color: ${isDebit ? '#b91c1c' : '#94a3b8'}; white-space: nowrap;">
                    ${isDebit ? inrDecimal(tx.debit) : '—'}
                  </td>
                  <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; font-family: monospace; font-weight: 600; color: ${isCredit ? '#15803d' : '#94a3b8'}; white-space: nowrap;">
                    ${isCredit ? inrDecimal(tx.credit) : '—'}
                  </td>
                  <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; white-space: nowrap;">
                    <span style="font-family: monospace; font-weight: 700; color: #0f172a; margin-right: 4px;">${inrDecimal(tx.balance)}</span>
                    <span style="display: inline-block; padding: 1px 4px; border-radius: 3px; font-size: 8px; font-weight: 800; background-color: ${tx.balanceType === 'Cr' ? '#dcfce7' : '#fee2e2'}; color: ${tx.balanceType === 'Cr' ? '#166534' : '#991b1b'};">
                      ${tx.balanceType}
                    </span>
                  </td>
                </tr>
              `;
            })
            .join('');

    const statementHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Customer Statement - ${escapeHtml(customerName)} | ${COMPANY_DETAILS.brandName}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            *, *::before, *::after {
              box-sizing: border-box !important;
            }
            html, body {
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background-color: #ffffff !important;
              color: #0f172a !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
              font-size: 11px !important;
              line-height: 1.4 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @media print {
              body {
                transform: scale(0.97);
                transform-origin: top center;
              }
            }
            table {
              width: 100% !important;
              border-collapse: collapse !important;
              page-break-inside: auto;
            }
            tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
            thead {
              display: table-header-group;
            }
            tfoot {
              display: table-footer-group;
            }
            th, td {
              word-break: break-word !important;
            }
          </style>
        </head>
        <body>
          <div style="width: 100%; max-width: 100%; margin: 0 auto; box-sizing: border-box;">
            <!-- COMPANY HEADER -->
            <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <span style="font-size: 20px; font-weight: 900; color: #4338ca; letter-spacing: -0.5px;">GyftKart</span>
                  <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">· Statement of Account</span>
                </div>
                <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${COMPANY_DETAILS.legalName}</div>
                <div style="font-size: 10px; color: #475569; margin-top: 2px; max-width: 440px;">${COMPANY_DETAILS.address}</div>
                <div style="font-size: 10px; color: #475569; margin-top: 2px;">
                  <strong>GSTIN:</strong> ${COMPANY_DETAILS.gstin} &nbsp;|&nbsp; 
                  <strong>PAN:</strong> ${COMPANY_DETAILS.pan} &nbsp;|&nbsp; 
                  <strong>CIN:</strong> ${COMPANY_DETAILS.cin}
                </div>
              </div>
              <div style="text-align: right;">
                <div style="display: inline-block; background-color: #e0e7ff; color: #3730a3; padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                  Customer Ledger
                </div>
                <div style="font-size: 10px; color: #64748b;">Statement Date: <strong style="color: #0f172a;">${escapeHtml(generatedDateStr)}</strong></div>
                <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Period: <strong style="color: #0f172a;">${escapeHtml(periodLabel)}</strong></div>
                <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Website: <strong style="color: #0f172a;">${COMPANY_DETAILS.website}</strong></div>
              </div>
            </div>

            <!-- CUSTOMER DETAILS PANEL -->
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 14px; display: flex; justify-content: space-between; gap: 12px; font-size: 10px;">
              <div style="flex: 1;">
                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 3px;">Customer Account Information</div>
                <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${escapeHtml(customerName)}</div>
                <div style="color: #334155; margin-top: 2px;"><strong>Email:</strong> ${escapeHtml(selectedCustomer.email || 'N/A')}</div>
                <div style="color: #334155; margin-top: 1px;"><strong>Phone:</strong> ${escapeHtml(selectedCustomer.phone || 'N/A')}</div>
                <div style="color: #64748b; font-family: monospace; font-size: 9px; margin-top: 2px;"><strong>UUID:</strong> ${escapeHtml(selectedCustomer.id)}</div>
                ${selectedCustomer.company_name ? `<div style="color: #334155; margin-top: 2px;"><strong>Company:</strong> ${escapeHtml(selectedCustomer.company_name)}</div>` : ''}
              </div>
              <div style="text-align: right; display: flex; flex-direction: column; justify-content: space-between; min-width: 220px;">
                <div>
                  <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 3px;">Account Category &amp; Status</div>
                  <div style="font-size: 11px; font-weight: 700; color: #0f172a;">
                    Customer Type: <span style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 9px;">${escapeHtml(selectedCustomer.customer_type || 'B2C')}</span>
                  </div>
                  ${selectedCustomer.gstin ? `<div style="color: #334155; margin-top: 2px;"><strong>GSTIN:</strong> ${escapeHtml(selectedCustomer.gstin)}</div>` : ''}
                  ${selectedCustomer.pan ? `<div style="color: #334155; margin-top: 1px;"><strong>PAN:</strong> ${escapeHtml(selectedCustomer.pan)}</div>` : ''}
                </div>
                <div style="margin-top: 8px;">
                  <span style="font-size: 10px; color: #64748b;">Current Ledger Balance: </span>
                  <span style="font-size: 13px; font-weight: 900; color: #0f172a; font-family: monospace;">₹${(selectedCustomer.wallet_balance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  <span style="display: inline-block; padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: 800; background-color: #dcfce7; color: #166534; margin-left: 3px;">Cr</span>
                </div>
              </div>
            </div>

            <!-- SUMMARY CARDS (4-BOX INLINE GRID) -->
            <div style="display: flex; gap: 10px; margin-bottom: 16px;">
              <!-- 1. Opening Balance -->
              <div style="flex: 1; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Opening Balance</div>
                <div style="font-size: 14px; font-weight: 800; color: #0f172a; font-family: monospace; margin-top: 3px;">
                  ${inrDecimal(openingBalance)}
                </div>
                <div style="font-size: 9px; font-weight: 600; color: #64748b; margin-top: 2px;">
                  Prior to period · <strong style="color: ${openingBalanceType === 'Cr' ? '#15803d' : '#b91c1c'};">${openingBalanceType}</strong>
                </div>
              </div>

              <!-- 2. Total Debits (Dr) -->
              <div style="flex: 1; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #b91c1c; letter-spacing: 0.5px;">Total Debits (Dr)</div>
                <div style="font-size: 14px; font-weight: 800; color: #b91c1c; font-family: monospace; margin-top: 3px;">
                  ${inrDecimal(periodDebit)}
                </div>
                <div style="font-size: 9px; font-weight: 500; color: #64748b; margin-top: 2px;">
                  Outflows / Purchases
                </div>
              </div>

              <!-- 3. Total Credits (Cr) -->
              <div style="flex: 1; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #15803d; letter-spacing: 0.5px;">Total Credits (Cr)</div>
                <div style="font-size: 14px; font-weight: 800; color: #15803d; font-family: monospace; margin-top: 3px;">
                  ${inrDecimal(periodCredit)}
                </div>
                <div style="font-size: 9px; font-weight: 500; color: #64748b; margin-top: 2px;">
                  Inflows / Top-ups
                </div>
              </div>

              <!-- 4. Closing Balance -->
              <div style="flex: 1; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #4338ca; letter-spacing: 0.5px;">Closing Balance</div>
                <div style="font-size: 14px; font-weight: 800; color: #0f172a; font-family: monospace; margin-top: 3px;">
                  ${inrDecimal(closingBalance)}
                </div>
                <div style="font-size: 9px; font-weight: 600; color: #64748b; margin-top: 2px;">
                  Net balance · <strong style="color: ${closingBalanceType === 'Cr' ? '#15803d' : '#b91c1c'};">${closingBalanceType}</strong>
                </div>
              </div>
            </div>

            <!-- TRANSACTIONS TABLE -->
            <table style="width: 100%; border: 1px solid #0f172a; border-collapse: collapse; margin-bottom: 16px;">
              <thead>
                <tr style="background-color: #f1f5f9; border-bottom: 2px solid #0f172a; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">
                  <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: center; width: 45px;">S. No.</th>
                  <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; width: 130px;">Date &amp; Time</th>
                  <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; width: 110px;">Voucher / Type</th>
                  <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; width: 130px;">Ref / UTR / Voucher</th>
                  <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left;">Particulars / Narration</th>
                  <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: right; width: 85px;">Debit (₹)</th>
                  <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: right; width: 85px;">Credit (₹)</th>
                  <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: right; width: 100px;">Balance (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
              <tfoot>
                <tr style="background-color: #f8fafc; border-top: 2px solid #0f172a; font-weight: 800; font-size: 10px; color: #0f172a;">
                  <td colspan="5" style="border: 1px solid #cbd5e1; padding: 8px 8px; text-align: right; text-transform: uppercase; letter-spacing: 0.5px; color: #334155;">
                    Total for Selected Period:
                  </td>
                  <td style="border: 1px solid #cbd5e1; padding: 8px 8px; text-align: right; font-family: monospace; font-size: 11px; color: #b91c1c;">
                    ${inrDecimal(periodDebit)}
                  </td>
                  <td style="border: 1px solid #cbd5e1; padding: 8px 8px; text-align: right; font-family: monospace; font-size: 11px; color: #15803d;">
                    ${inrDecimal(periodCredit)}
                  </td>
                  <td style="border: 1px solid #cbd5e1; padding: 8px 8px; text-align: right; font-family: monospace; font-size: 11px; color: #0f172a;">
                    ${inrDecimal(closingBalance)}
                    <span style="font-size: 8px; font-weight: 800; color: #166534; margin-left: 2px;">${closingBalanceType}</span>
                  </td>
                </tr>
              </tfoot>
            </table>

            <!-- STATEMENT FOOTER & AUTHENTICATION -->
            <div style="border-top: 1px dashed #94a3b8; padding-top: 12px; margin-top: 12px; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; align-items: flex-end;">
              <div>
                <p style="margin: 0 0 2px 0;">
                  This is an electronically generated statement issued by <strong>${COMPANY_DETAILS.legalName}</strong> (${COMPANY_DETAILS.brandName}).
                </p>
                <p style="margin: 0 0 2px 0;">
                  Registered Office: ${COMPANY_DETAILS.address}
                </p>
                <p style="margin: 0;">
                  For any reconciliation or billing inquiries, contact <strong>${COMPANY_DETAILS.billingEmail}</strong> or call our support desk.
                </p>
              </div>
              <div style="text-align: right; min-width: 180px;">
                <div style="font-size: 10px; font-weight: 800; color: #0f172a; margin-bottom: 2px;">Digitally Authorized Record</div>
                <div style="font-size: 9px; color: #475569;">System Timestamp: ${escapeHtml(generatedDateStr)}</div>
                <div style="font-size: 8px; color: #94a3b8; font-family: monospace; margin-top: 2px;">AUTH-STMT-VERIFIED-OK</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    doc.open();
    doc.write(statementHtml);
    doc.close();

    const executePrint = () => {
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch (err) {
        console.error('Failed to trigger statement print:', err);
      }
    };

    // Clean up iframe after user closes print dialog
    frameWindow.onafterprint = () => {
      try {
        printFrame.remove();
      } catch {
        // ignore
      }
    };

    // Wait for document ready + 300ms paint buffer before invoking print
    if (doc.readyState === 'complete') {
      setTimeout(executePrint, 300);
    } else {
      frameWindow.onload = () => {
        setTimeout(executePrint, 300);
      };
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* ========================================================================= */}
        {/* VIEW 1: CUSTOMER DIRECTORY LIST (WHEN NO SPECIFIC CUSTOMER IS SELECTED)   */}
        {/* ========================================================================= */}
        {!activeCustomerId && (
          <div>
            {/* Breadcrumb & Navigation */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
                <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
                  Admin
                </Link>
                <ChevronRight className="h-4 w-4 text-slate-400" />
                <span className="text-slate-900 font-semibold">Customer Ledger Directory</span>
              </nav>
              <div className="flex items-center gap-3">
                <AdminBackButton />
              </div>
            </div>

            {/* Header Banner & High-level Statistics */}
            <div className="mb-6 rounded-2xl bg-white p-6 shadow-card border border-slate-100">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
                    <Users className="h-5 w-5 text-brand-600" />
                    Customer Directory &amp; Statements
                  </h1>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Select any registered or B2B corporate customer to inspect their double-entry accounting ledger, balances, and invoices.
                  </p>
                </div>
                <button
                  onClick={() => void loadCustomers()}
                  disabled={customersLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition shrink-0 self-start md:self-center"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${customersLoading ? 'animate-spin' : ''}`} />
                  Refresh Balances
                </button>
              </div>

              {/* Summary Counter Cards */}
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total B2C Clients</p>
                  <p className="mt-1 text-xl font-extrabold text-slate-900">
                    {customersLoading ? '…' : directoryStats.totalCount}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Active retail customer records</p>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Outstanding Balance</p>
                  <p className="mt-1 text-xl font-extrabold text-emerald-950">
                    {customersLoading ? '…' : inrDecimal(directoryStats.totalBalance)}
                  </p>
                  <p className="text-[11px] text-emerald-700/80 mt-0.5">Net customer wallet liability (Cr)</p>
                </div>
              </div>
            </div>

            {/* Top Directory Controls: Search & Rows per page */}
            <div className="mb-6 rounded-2xl bg-white p-5 shadow-card border border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-2xl">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Search Customer Directory
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter by customer name, email, phone, or UUID…"
                      value={directorySearch}
                      onChange={(e) => {
                        setDirectorySearch(e.target.value);
                        setDirCurrentPage(1);
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-10 py-2.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 transition"
                    />
                    {directorySearch && (
                      <button
                        onClick={() => {
                          setDirectorySearch('');
                          setDirCurrentPage(1);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Rows per page selector */}
                <div className="sm:self-end">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Rows Per Page
                  </label>
                  <select
                    value={dirPageSize}
                    onChange={(e) => {
                      setDirPageSize(Number(e.target.value));
                      setDirCurrentPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  >
                    <option value={10}>10 per page</option>
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>
              </div>
            </div>

            {/* View 1: Customer Directory Table */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-card overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-slate-800">
                  Customers Directory ({filteredDirectory.length})
                </p>
                <p className="text-[11px] text-slate-400">
                  Click 'View Ledger' on any customer to open their statement
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3 w-[60px]">S. NO.</th>
                      <th className="px-4 py-3 w-[28%]">CUSTOMER</th>
                      <th className="px-4 py-3 w-[15%]">PHONE</th>
                      <th className="px-4 py-3 w-[16%]">CURRENT BALANCE</th>
                      <th className="px-4 py-3 w-[14%]">TOTAL ORDERS / TXNS</th>
                      <th className="px-4 py-3 w-[15%]">LAST ACTIVE DATE</th>
                      <th className="px-4 py-3 text-right pr-6 w-[12%] min-w-[130px]">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customersLoading ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                            Loading customer directory and wallet balances…
                          </div>
                        </td>
                      </tr>
                    ) : paginatedDirectory.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center text-slate-500">
                          <p className="font-semibold text-slate-700">No customers found</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {directorySearch
                              ? `No customer profiles match "${directorySearch}"`
                              : 'No customer profiles are available in this filter.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      paginatedDirectory.map((c, idx) => {
                        const rowNumber = (dirCurrentPage - 1) * dirPageSize + idx + 1;
                        const balance = c.wallet_balance ?? 0;

                        return (
                          <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* 1. S. NO. */}
                            <td className="px-4 py-3.5 font-mono text-[11px] text-slate-400">
                              {rowNumber}
                            </td>

                            {/* 2. CUSTOMER */}
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="grid place-items-center h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-white font-display font-bold text-xs shadow-xs">
                                  {c.full_name.charAt(0) || c.email.charAt(0) || '?'}
                                </span>
                                <div className="min-w-0">
                                  <span className="font-bold text-slate-900 truncate block">{c.full_name}</span>
                                  <p className="text-[11px] text-slate-500 truncate">{c.email || '—'}</p>
                                </div>
                              </div>
                            </td>

                            {/* 3. PHONE */}
                            <td className="px-4 py-3.5 text-slate-700 font-medium">
                              {c.phone ? (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                                  {c.phone}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            {/* 4. CURRENT BALANCE */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                <Wallet className="h-3.5 w-3.5 text-slate-400" />
                                <span className="font-mono font-bold text-slate-900">
                                  {inrDecimal(Math.abs(balance))}
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.2 text-[9px] font-extrabold ${
                                    balance >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {balance >= 0 ? 'Cr' : 'Dr'}
                                </span>
                              </span>
                            </td>

                            {/* 5. TOTAL ORDERS / TXNS */}
                            <td className="px-4 py-3.5">
                              <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                {c.total_orders_txns ?? 0} txns
                              </span>
                            </td>

                            {/* 6. LAST ACTIVE DATE */}
                            <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap text-[11px] font-medium">
                              {c.last_active_date ? formatDateTime(c.last_active_date) : '—'}
                            </td>

                            {/* 7. ACTION */}
                            <td className="px-4 py-3.5 text-right pr-6 whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdjustCustomer({
                                      id: c.id,
                                      email: c.email,
                                      full_name: c.full_name,
                                      phone: c.phone,
                                      customer_type: c.customer_type,
                                      company_name: c.company_name,
                                      wallet_balance: balance,
                                    });
                                    setAdjustModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs"
                                  title="Manual Credit / Adjust Wallet Balance"
                                >
                                  <SlidersHorizontal className="h-3 w-3 text-brand-600" />
                                  Adjust
                                </button>
                                <Link
                                  to={`/admin/customer-ledger/${c.id}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 transition"
                                >
                                  View Ledger
                                  <ChevronRight className="h-3 w-3" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* View 1: Directory Pagination Footer */}
              {!customersLoading && filteredDirectory.length > 0 && (
                <div className="border-t border-slate-100 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Showing {(dirCurrentPage - 1) * dirPageSize + 1} to{' '}
                    {Math.min(dirCurrentPage * dirPageSize, filteredDirectory.length)} of {filteredDirectory.length} customers
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setDirCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={dirCurrentPage <= 1}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Previous
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: dirTotalPages }, (_, i) => i + 1).slice(
                        Math.max(0, dirCurrentPage - 3),
                        Math.min(dirTotalPages, dirCurrentPage + 2)
                      ).map((p) => (
                        <button
                          key={p}
                          onClick={() => setDirCurrentPage(p)}
                          className={`min-w-[2rem] h-8 rounded-lg text-xs font-bold transition-colors ${
                            p === dirCurrentPage
                              ? 'bg-brand-600 text-white shadow-sm'
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setDirCurrentPage((p) => Math.min(dirTotalPages, p + 1))}
                      disabled={dirCurrentPage >= dirTotalPages}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: DETAILED CUSTOMER LEDGER STATEMENT                                */}
        {/* ========================================================================= */}
        {activeCustomerId && (
          <div>
            {/* Top Navigation & Breadcrumbs */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
                <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
                  Admin
                </Link>
                <ChevronRight className="h-4 w-4 text-slate-400" />
                <Link to="/admin/customer-ledger" className="hover:text-brand-700 transition-colors">
                  Customer Directory
                </Link>
                <ChevronRight className="h-4 w-4 text-slate-400" />
                <span className="text-slate-900 font-semibold truncate max-w-[200px] sm:max-w-none">
                  {selectedCustomer ? selectedCustomer.full_name : 'Customer Statement'}
                </span>
              </nav>
              <div className="flex items-center gap-3">
                <AdminBackButton />
              </div>
            </div>

            {/* Loading state for customer record */}
            {customersLoading && (
              <div className="rounded-2xl bg-white p-12 text-center border border-slate-100 shadow-card">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600 mb-3" />
                <p className="text-sm font-semibold text-slate-800">Loading customer account details…</p>
              </div>
            )}

            {/* Customer Not Found Error State */}
            {!customersLoading && !selectedCustomer && (
              <div className="rounded-2xl bg-white p-12 text-center border border-slate-200 shadow-card">
                <Users className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                <h2 className="text-base font-extrabold text-slate-900">Customer Profile Not Found</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Could not find customer profile matching ID <span className="font-mono text-slate-700">{activeCustomerId}</span>. The customer may have been removed or the link is invalid.
                </p>
                <div className="mt-6">
                  <Link
                    to="/admin/customer-ledger"
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 transition"
                  >
                    <ArrowLeft className="h-4 w-4" /> Return to Customer Directory
                  </Link>
                </div>
              </div>
            )}

            {/* Customer Header Card */}
            {selectedCustomer && (
              <div className="mb-6 rounded-2xl bg-white p-5 shadow-card border border-slate-100">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Customer Identity */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <span className="grid place-items-center h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white font-display font-bold text-base shadow-sm">
                      {selectedCustomer.full_name.charAt(0) || selectedCustomer.email.charAt(0) || '?'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-extrabold text-slate-900 truncate">
                          {selectedCustomer.full_name}
                        </h2>
                        {selectedCustomer.customer_type === 'B2B' ? (
                          <span className="inline-flex items-center rounded-full bg-purple-100 border border-purple-200 px-2.5 py-0.5 text-[10px] font-bold text-purple-800">
                            B2B Corporate
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-sky-100 border border-sky-200 px-2.5 py-0.5 text-[10px] font-bold text-sky-800">
                            B2C Retail
                          </span>
                        )}
                        {selectedCustomer.company_name && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            <Building2 className="h-3 w-3 text-slate-400" />
                            {selectedCustomer.company_name}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-medium">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5 text-slate-400" /> {selectedCustomer.email || '—'}
                        </span>
                        {selectedCustomer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-slate-400" /> {selectedCustomer.phone}
                          </span>
                        )}
                        <button
                          onClick={() => handleCopyId(selectedCustomer.id)}
                          className="flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-700 transition"
                          title="Copy Customer UUID"
                        >
                          <span>UUID: {selectedCustomer.id.slice(0, 8)}…</span>
                          {copiedId ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right: Current Balance & Export Action Buttons */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200/80 px-3.5 py-2">
                      <span className="text-xs text-slate-500 font-medium">Wallet Balance:</span>
                      <span className="inline-flex items-center gap-1 font-mono text-sm font-extrabold text-slate-900">
                        <Wallet className="h-4 w-4 text-brand-600" />
                        {inrDecimal(selectedCustomer.wallet_balance ?? 0)}
                        <span className="text-[10px] font-bold text-emerald-700">Cr</span>
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        setAdjustCustomer({
                          id: selectedCustomer.id,
                          email: selectedCustomer.email,
                          full_name: selectedCustomer.full_name,
                          phone: selectedCustomer.phone,
                          customer_type: selectedCustomer.customer_type,
                          company_name: selectedCustomer.company_name,
                          wallet_balance: selectedCustomer.wallet_balance ?? 0,
                        });
                        setAdjustModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:from-emerald-700 hover:to-teal-800 transition"
                      title="Credit or adjust customer wallet balance"
                    >
                      <PlusCircle className="h-3.5 w-3.5" /> Adjust / Credit Wallet
                    </button>

                    <button
                      onClick={handleExportCsv}
                      disabled={inPeriodTransactions.length === 0}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition disabled:cursor-not-allowed disabled:opacity-50"
                      title="Export formatted ledger for Excel / Tally"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                      Download Statement CSV
                    </button>
                    <button
                      onClick={handlePrint}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition"
                      title="Print or save PDF statement"
                    >
                      <Printer className="h-3.5 w-3.5 text-slate-600" />
                      Print Statement
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Financial KPI Summary Cards (4 Cards) */}
            {selectedCustomer && (
              <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Opening Balance */}
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Opening Balance</span>
                    <Clock className="h-4 w-4 text-slate-400" />
                  </div>
                  <p className="text-xl font-extrabold text-slate-900">
                    {ledgerLoading ? '…' : inrDecimal(openingBalance)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    Prior to period ·{' '}
                    <span className={`inline-block font-bold ${openingBalanceType === 'Cr' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {openingBalanceType}
                    </span>
                  </p>
                </div>

                {/* 2. Total Debit (Dr) */}
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Total Debit (Dr)</span>
                    <TrendingDown className="h-4 w-4 text-rose-500" />
                  </div>
                  <p className="text-xl font-extrabold text-rose-600">
                    {ledgerLoading ? '…' : inrDecimal(periodDebit)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    Outflows · Purchases &amp; Adjustments
                  </p>
                </div>

                {/* 3. Total Credit (Cr) */}
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Total Credit (Cr)</span>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </div>
                  <p className="text-xl font-extrabold text-emerald-600">
                    {ledgerLoading ? '…' : inrDecimal(periodCredit)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    Inflows · Top-ups &amp; Receipts
                  </p>
                </div>

                {/* 4. Closing Balance */}
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Closing Balance</span>
                    <Banknote className="h-4 w-4 text-brand-600" />
                  </div>
                  <p className="text-xl font-extrabold text-slate-900">
                    {ledgerLoading ? '…' : inrDecimal(closingBalance)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    Net balance ·{' '}
                    <span className={`inline-block font-bold ${closingBalanceType === 'Cr' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {closingBalanceType}
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* Date Range Presets & Voucher Search Filter */}
            {selectedCustomer && (
              <div className="mb-6 rounded-2xl bg-white p-5 shadow-card border border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Quick Presets */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Period Presets
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'all', label: 'All Time' },
                          { id: 'today', label: 'Today' },
                          { id: 'this_month', label: 'This Month' },
                          { id: 'last_month', label: 'Last Month' },
                          { id: 'financial_year', label: 'Financial Year (FY)' },
                        ] as const
                      ).map((p) => {
                        const isActive = activePreset === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => handlePresetSelect(p.id)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              isActive
                                ? 'bg-brand-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Date Pickers & Voucher Search */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        From Date
                      </label>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => {
                          setFromDate(e.target.value);
                          setActivePreset('all');
                          setCurrentPage(1);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        To Date
                      </label>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => {
                          setToDate(e.target.value);
                          setActivePreset('all');
                          setCurrentPage(1);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      />
                    </div>

                    {/* Voucher / UTR Search */}
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Search Ref / UTR / Voucher
                      </label>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search UTR, Ref ID, Order #…"
                          value={voucherSearch}
                          onChange={(e) => {
                            setVoucherSearch(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Statement Table (Tally Format) */}
            {selectedCustomer && (
              <div className="rounded-3xl border border-slate-100 bg-white shadow-card overflow-hidden">
                {/* Table Header Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <h3 className="font-display text-sm font-extrabold text-slate-900">
                      Statement Transactions ({sortedTransactions.length})
                    </h3>
                    <button
                      onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                      title="Toggle Chronological Order"
                    >
                      <ArrowUpDown className="h-3 w-3" />
                      {sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}
                    </button>
                  </div>

                  {/* Page Size Selector */}
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:border-brand-500 focus:outline-none"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3 w-[60px]">S. NO.</th>
                        <th className="px-4 py-3 w-[160px]">DATE &amp; TIME</th>
                        <th className="px-4 py-3 w-[150px]">VOUCHER / TYPE</th>
                        <th className="px-4 py-3 w-[180px]">VOUCHER NO. / REF ID</th>
                        <th className="px-4 py-3">PARTICULARS / NARRATION</th>
                        <th className="px-4 py-3 text-right w-[110px]">DEBIT (₹)</th>
                        <th className="px-4 py-3 text-right w-[110px]">CREDIT (₹)</th>
                        <th className="px-4 py-3 text-right w-[130px]">BALANCE (₹)</th>
                        <th className="px-4 py-3 text-center w-[90px]">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {ledgerLoading ? (
                        <tr>
                          <td colSpan={9} className="py-16 text-center text-slate-500">
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                              Loading double-entry ledger records…
                            </div>
                          </td>
                        </tr>
                      ) : paginatedTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-16 text-center text-slate-500">
                            No ledger transactions found for the selected customer and date range.
                          </td>
                        </tr>
                      ) : (
                        paginatedTransactions.map((tx, idx) => {
                          const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                          const isDebit = tx.debit > 0;
                          const isCredit = tx.credit > 0;

                          return (
                            <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                                {rowNumber}
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                                {formatDateTime(tx.date)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                    tx.voucherType.includes('Receipt') || tx.voucherType.includes('Top-up')
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : tx.voucherType.includes('Reversal') || tx.voucherType.includes('Refund') || tx.voucherType.includes('Adjustment') || tx.voucherType.includes('Rollback') || tx.voucherType.includes('Revert')
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                      : tx.voucherType.includes('Payment')
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}
                                >
                                  {tx.voucherType}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-[11px] font-semibold text-slate-900 break-all">
                                {tx.voucherNo}
                              </td>
                              <td className="px-4 py-3 text-slate-700 font-medium">
                                {tx.particulars}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-rose-600 whitespace-nowrap">
                                {isDebit ? inrDecimal(tx.debit) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600 whitespace-nowrap">
                                {isCredit ? inrDecimal(tx.credit) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <span className="font-mono font-bold text-slate-900 mr-1.5">
                                  {inrDecimal(tx.balance)}
                                </span>
                                <span
                                  className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-extrabold ${
                                    tx.balanceType === 'Cr'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {tx.balanceType}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center whitespace-nowrap">
                                <button
                                  onClick={() => handleOpenLedgerInvoice(tx)}
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:border-brand-500 hover:bg-brand-50/60 hover:text-brand-700 transition"
                                  title="View and download invoice"
                                >
                                  <FileText className="h-3 w-3 text-brand-600" />
                                  Invoice
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>

                    {/* Table Footer: Totals */}
                    {!ledgerLoading && sortedTransactions.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                          <td colSpan={5} className="px-4 py-3 text-right uppercase tracking-wider text-[11px] text-slate-600">
                            Total for Selected Period:
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-rose-600">
                            {inrDecimal(periodDebit)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600">
                            {inrDecimal(periodCredit)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {inrDecimal(closingBalance)}{' '}
                            <span className="text-[10px] font-bold text-emerald-700">{closingBalanceType}</span>
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Pagination Footer */}
                {!ledgerLoading && sortedTransactions.length > 0 && (
                  <div className="border-t border-slate-100 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      Showing {(currentPage - 1) * pageSize + 1} to{' '}
                      {Math.min(currentPage * pageSize, sortedTransactions.length)} of {sortedTransactions.length} records
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
                        {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                          Math.max(0, currentPage - 3),
                          Math.min(totalPages, currentPage + 2)
                        ).map((p) => (
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
            )}

            {/* Tax Invoice / Receipt Modal */}
            <OrderInvoiceModal
              isOpen={isInvoiceOpen}
              onClose={() => setIsInvoiceOpen(false)}
              invoice={selectedInvoice}
            />

            {/* Manual Wallet Credit / Adjust Balance Modal */}
            <ManualWalletCreditModal
              isOpen={adjustModalOpen}
              onClose={() => setAdjustModalOpen(false)}
              onSuccess={() => {
                void loadCustomers();
                const targetId = routeCustomerId || selectedCustomer?.id;
                if (targetId) {
                  void loadLedgerData(targetId);
                }
              }}
              initialCustomer={adjustCustomer}
            />
          </div>
        )}
      </div>
    </div>
  );
}
