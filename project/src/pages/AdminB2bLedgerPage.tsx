import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Printer,
  ChevronRight,
  Building2,
  FileSpreadsheet,
  ArrowLeft,
  X,
  Loader2,
  Copy,
  Check,
  FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { AdminTopBar } from '@/components/AdminHeader';
import { inr, inrDecimal, formatDateTime } from '@/lib/format';
import { OrderInvoiceModal } from '@/components/OrderInvoiceModal';
import { extractInvoiceItems, type InvoiceData } from '@/lib/invoice';

export interface B2bEntity {
  id: string;
  company_name: string;
  brand_trade_name: string | null;
  gstin: string | null;
  pan: string | null;
  email: string;
  phone: string;
  contact_person_name: string | null;
  billing_address: string | null;
  billing_state: string | null;
  billing_city: string | null;
  billing_pincode: string | null;
  credit_limit: number;
  status: 'active' | 'inactive';
  created_at: string;
  wallet_balance?: number; // rupees
  total_txns?: number;
}

export interface B2bLedgerEntry {
  id: string;
  date: string; // ISO
  voucherType: string;
  voucherNo: string;
  particulars: string;
  debit: number; // in rupees
  credit: number; // in rupees
  balance: number; // running balance in rupees
  balanceType: 'Cr' | 'Dr';
  status?: string;
  paymentMethod?: string;
  paymentRef?: string | null;
  rawItems?: unknown;
  orderId?: string;
}

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
    const currentMonth = now.getMonth();
    const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    const fyEndYear = fyStartYear + 1;
    return {
      from: `${fyStartYear}-04-01`,
      to: `${fyEndYear}-03-31`,
    };
  }
  return { from: '', to: '' };
};

export default function AdminB2bLedgerPage() {
  const { admin } = useAdminAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!admin) {
      navigate('/admin', { replace: true });
    }
  }, [admin, navigate]);

  const activeCustomerId = searchParams.get('customer') || '';

  const [entities, setEntities] = useState<B2bEntity[]>([]);
  const [_entitiesLoading, setEntitiesLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<B2bEntity | null>(null);

  // Search & Filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'this_month' | 'last_month' | 'financial_year'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [voucherSearch, setVoucherSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Ledger state
  const [ledgerEntries, setLedgerEntries] = useState<B2bLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Invoice modal
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  // Load B2B Entities Directory
  const loadEntities = useCallback(async () => {
    setEntitiesLoading(true);
    try {
      const [profilesRes, walletsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('customer_type', 'B2B')
          .order('created_at', { ascending: false }),
        supabase.from('wallets').select('user_id, balance'),
      ]);

      const walletMap = new Map<string, number>();
      (walletsRes.data ?? []).forEach((w) => {
        walletMap.set(w.user_id, Number(w.balance || 0) / 100);
      });

      const list: B2bEntity[] = (profilesRes.data ?? []).map((p) => ({
        id: p.id,
        company_name: p.company_name || p.full_name || 'Unnamed Enterprise',
        brand_trade_name: p.brand_trade_name || null,
        gstin: p.gstin || null,
        pan: p.pan || null,
        email: p.email || '',
        phone: p.phone || p.contact_phone || '',
        contact_person_name: p.contact_person_name || null,
        billing_address: p.billing_address || null,
        billing_state: p.billing_state || null,
        billing_city: p.billing_city || null,
        billing_pincode: p.billing_pincode || null,
        credit_limit: Number(p.credit_limit || 0),
        status: (p.status || 'active') as 'active' | 'inactive',
        created_at: p.created_at,
        wallet_balance: walletMap.get(p.id) ?? 0,
      }));

      setEntities(list);

      if (activeCustomerId) {
        const found = list.find((c) => c.id === activeCustomerId);
        if (found) setSelectedEntity(found);
      } else if (list.length > 0 && !selectedEntity) {
        setSelectedEntity(list[0]);
        setSearchParams({ customer: list[0].id }, { replace: true });
      }
    } catch (err) {
      console.error('Failed to load B2B entities for ledger:', err);
    } finally {
      setEntitiesLoading(false);
    }
  }, [activeCustomerId, setSearchParams, selectedEntity]);

  useEffect(() => {
    if (admin) {
      void loadEntities();
    }
  }, [admin, loadEntities]);

  // Load Corporate Ledger Data for Selected Entity
  const loadLedgerData = useCallback(async (customerId: string) => {
    setLedgerLoading(true);
    try {
      const [walletTxRes, ordersRes, upiSessionsRes] = await Promise.all([
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
      ]);

      const walletTxList = walletTxRes.data ?? [];
      const _ordersList = ordersRes.data ?? [];
      const upiSessionsList = upiSessionsRes.data ?? [];

      const sessionByOrderId = new Map<string, typeof upiSessionsList[0]>();
      const sessionById = new Map<string, typeof upiSessionsList[0]>();
      upiSessionsList.forEach((s) => {
        if (s.order_id) sessionByOrderId.set(s.order_id, s);
        sessionById.set(s.id, s);
      });

      const entries: B2bLedgerEntry[] = [];
      const coveredOrderIds = new Set<string>();

      // 1. Wallet transactions (top-ups, adjustments, debits)
      walletTxList.forEach((tx) => {
        const isCredit = tx.type === 'CREDIT';
        const amountRs = Number(tx.amount || 0) / 100;
        const ordId = tx.order_id || tx.reference_id || '';
        if (ordId) coveredOrderIds.add(ordId);

        const voucherType = isCredit ? 'Receipt (Top-up)' : 'Payment (Voucher Purchase)';
        let particulars = tx.remark || tx.reference_id || 'Wallet Transaction';

        const matchedSession = sessionByOrderId.get(ordId) || sessionById.get(ordId);
        if (matchedSession) {
          if (matchedSession.items) {
            particulars = `Voucher Purchase: ${ordId}`;
          }
          if (matchedSession.customer_utr || matchedSession.bank_ref) {
            particulars += ` | Ref: ${matchedSession.customer_utr || matchedSession.bank_ref}`;
          }
        }

        entries.push({
          id: `wtx-${tx.id}`,
          date: tx.created_at,
          voucherType,
          voucherNo: tx.reference_id || `TXN-${String(tx.id).slice(0, 8).toUpperCase()}`,
          particulars,
          debit: !isCredit ? amountRs : 0,
          credit: isCredit ? amountRs : 0,
          balance: 0,
          balanceType: 'Cr',
          status: 'SUCCESS',
          paymentMethod: 'Corporate Wallet',
          paymentRef: tx.reference_id,
          rawItems: matchedSession?.items,
          orderId: ordId || undefined,
        });
      });

      // 2. Direct UPI / Orders not already accounted in wallet_tx
      upiSessionsList.forEach((s) => {
        if (s.order_id && coveredOrderIds.has(s.order_id)) return;
        if (coveredOrderIds.has(s.id)) return;

        const _isSuccess = ['SUCCESS', 'CONFIRMED', 'DELIVERED'].includes((s.status || '').toUpperCase());
        const amountRs = Number(s.amount_paise || 0) / 100;
        const isTopup = s.category === 'TOPUP';

        entries.push({
          id: `upi-${s.id}`,
          date: s.created_at,
          voucherType: isTopup ? 'Receipt (NEFT/UPI)' : 'Sales / Tax Invoice',
          voucherNo: s.order_id || `UPI-${s.id.slice(0, 8).toUpperCase()}`,
          particulars: isTopup
            ? `Corporate Wallet Top-up (Bank Ref: ${s.customer_utr || s.bank_ref || 'Direct'})`
            : `Gift Voucher Purchase | ${s.admin_remark || 'Direct Order'}`,
          debit: isTopup ? 0 : amountRs,
          credit: isTopup ? amountRs : 0,
          balance: 0,
          balanceType: 'Cr',
          status: s.status,
          paymentMethod: 'UPI Direct / Bank Transfer',
          paymentRef: s.customer_utr || s.bank_ref,
          rawItems: s.items,
          orderId: s.order_id,
        });
      });

      // Sort strictly chronologically
      entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Compute running double-entry balance
      let currentBalance = 0;
      entries.forEach((e) => {
        currentBalance += e.credit - e.debit;
        e.balance = Math.abs(currentBalance);
        e.balanceType = currentBalance >= 0 ? 'Cr' : 'Dr';
      });

      setLedgerEntries(entries);
    } catch (err) {
      console.error('Error loading corporate ledger entries:', err);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEntity?.id) {
      void loadLedgerData(selectedEntity.id);
    } else {
      setLedgerEntries([]);
    }
  }, [selectedEntity?.id, loadLedgerData]);

  const handleSelectEntity = (e: B2bEntity) => {
    setSelectedEntity(e);
    setIsDropdownOpen(false);
    setSearchParams({ customer: e.id });
  };

  const handleDatePresetChange = (preset: typeof datePreset) => {
    setDatePreset(preset);
    const { from, to } = getPresetDates(preset);
    setFromDate(from);
    setToDate(to);
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Filtered transactions for selected period & search query
  const filteredLedger = useMemo(() => {
    return ledgerEntries.filter((tx) => {
      if (fromDate) {
        const txDate = tx.date.split('T')[0];
        if (txDate < fromDate) return false;
      }
      if (toDate) {
        const txDate = tx.date.split('T')[0];
        if (txDate > toDate) return false;
      }
      if (voucherSearch.trim()) {
        const q = voucherSearch.toLowerCase().trim();
        const matchesVoucher = tx.voucherNo.toLowerCase().includes(q);
        const matchesParticulars = tx.particulars.toLowerCase().includes(q);
        const matchesRef = (tx.paymentRef || '').toLowerCase().includes(q);
        if (!matchesVoucher && !matchesParticulars && !matchesRef) return false;
      }
      return true;
    });
  }, [ledgerEntries, fromDate, toDate, voucherSearch]);

  // Double-entry ledger summary metrics
  const ledgerMetrics = useMemo(() => {
    let opening = 0;
    if (fromDate) {
      ledgerEntries.forEach((tx) => {
        const txDate = tx.date.split('T')[0];
        if (txDate < fromDate) {
          opening += tx.credit - tx.debit;
        }
      });
    }

    let periodDebit = 0;
    let periodCredit = 0;

    filteredLedger.forEach((tx) => {
      periodDebit += tx.debit;
      periodCredit += tx.credit;
    });

    const netClosing = opening + periodCredit - periodDebit;

    return {
      openingBalance: Math.abs(opening),
      openingType: opening >= 0 ? 'Cr' : 'Dr',
      totalDebit: periodDebit,
      totalCredit: periodCredit,
      closingBalance: Math.abs(netClosing),
      closingType: netClosing >= 0 ? 'Cr' : 'Dr',
    };
  }, [ledgerEntries, filteredLedger, fromDate]);

  // Open Invoice from ledger row
  const handleOpenRowInvoice = (tx: B2bLedgerEntry) => {
    if (!selectedEntity) return;
    const invItems = extractInvoiceItems(tx.rawItems, tx.debit || tx.credit);
    const inv: InvoiceData = {
      invoiceNumber: `INV-${tx.voucherNo}`,
      orderId: tx.orderId || tx.voucherNo,
      date: tx.date,
      paymentMethod: tx.paymentMethod || 'Corporate Wallet',
      paymentRef: tx.paymentRef,
      status: tx.status || 'CONFIRMED',
      customer: {
        name: selectedEntity.contact_person_name || selectedEntity.company_name,
        email: selectedEntity.email,
        phone: selectedEntity.phone,
        userId: selectedEntity.id,
        customerType: 'B2B',
        companyName: selectedEntity.company_name,
        brandTradeName: selectedEntity.brand_trade_name || undefined,
        gstin: selectedEntity.gstin || undefined,
        pan: selectedEntity.pan || undefined,
        billingAddress: selectedEntity.billing_address || undefined,
        billingState: selectedEntity.billing_state || undefined,
        billingCity: selectedEntity.billing_city || undefined,
        billingPincode: selectedEntity.billing_pincode || undefined,
      },
      items: invItems,
      subtotal: tx.debit || tx.credit,
      totalAmount: tx.debit || tx.credit,
      category: 'B2B_VOUCHER',
    };
    setSelectedInvoice(inv);
    setIsInvoiceOpen(true);
  };

  // Export GSTR-1 Friendly CSV
  const handleExportGstr1Csv = () => {
    if (!selectedEntity || filteredLedger.length === 0) return;

    const escapeCsv = (val: string | number | null | undefined) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'GSTIN/UIN of Recipient',
      'Receiver Legal Name',
      'Trade Name',
      'Invoice / Voucher Number',
      'Invoice date',
      'Invoice Value',
      'Place Of Supply',
      'Reverse Charge',
      'Applicable % of Tax Rate',
      'Rate (%)',
      'Taxable Value',
      'CGST Amount',
      'SGST Amount',
      'IGST Amount',
      'Cess Amount',
      'Voucher Type',
      'Particulars',
      'Payment Ref / UTR',
    ];

    const rows = filteredLedger.map((tx) => {
      const invValue = tx.debit > 0 ? tx.debit : tx.credit;
      const pos = selectedEntity.billing_state || '09-Uttar Pradesh';
      const isIgst = !pos.toLowerCase().includes('uttar pradesh') && !pos.startsWith('09');
      // For gift voucher margins / exempt supply (rule 32(6)), 18% GST applies on service margin; digital gift card face value itself is classified under non-GST money voucher. Here we output GSTR-1 compliant breakdown.
      const rate = 18;
      const taxableValue = Number((invValue / 1.18).toFixed(2));
      const totalTax = Number((invValue - taxableValue).toFixed(2));
      const cgst = isIgst ? 0 : Number((totalTax / 2).toFixed(2));
      const sgst = isIgst ? 0 : Number((totalTax / 2).toFixed(2));
      const igst = isIgst ? totalTax : 0;

      return [
        escapeCsv(selectedEntity.gstin || 'URP'),
        escapeCsv(selectedEntity.company_name),
        escapeCsv(selectedEntity.brand_trade_name || selectedEntity.company_name),
        escapeCsv(tx.voucherNo),
        escapeCsv(tx.date.split('T')[0]),
        invValue.toFixed(2),
        escapeCsv(pos),
        escapeCsv('N'),
        escapeCsv(''),
        rate,
        taxableValue.toFixed(2),
        cgst.toFixed(2),
        sgst.toFixed(2),
        igst.toFixed(2),
        '0.00',
        escapeCsv(tx.voucherType),
        escapeCsv(tx.particulars),
        escapeCsv(tx.paymentRef || ''),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GSTR1_B2B_Ledger_${selectedEntity.gstin || selectedEntity.company_name.replace(/\s+/g, '_')}_${fromDate || 'start'}_to_${toDate || 'today'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <AdminTopBar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Breadcrumb Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
            <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
              Admin
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 font-semibold">B2B Ledger</span>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/admin/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin Dashboard
            </Link>
          </div>
        </div>

        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-100 text-brand-700">
                <Building2 className="h-4 w-4" />
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Corporate B2B Ledger &amp; GST Reconciliation
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Double-entry account statement, corporate voucher debits/credits, and GSTR-1 compliant tax reporting.
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <Link
              to="/admin/b2b-customers"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              B2B Directory
            </Link>
            <button
              onClick={() => window.print()}
              disabled={!selectedEntity || filteredLedger.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-xs disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Statement
            </button>
            <button
              onClick={handleExportGstr1Csv}
              disabled={!selectedEntity || filteredLedger.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export GSTR-1 CSV
            </button>
          </div>
        </div>

        {/* Corporate Entity Selector & Date Filters Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            {/* Entity Selector Autocomplete */}
            <div className="lg:col-span-5 relative">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Select Corporate Client
              </label>
              <div
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white text-xs flex items-center justify-between cursor-pointer transition"
              >
                {selectedEntity ? (
                  <div className="truncate">
                    <span className="font-extrabold text-slate-900">{selectedEntity.company_name}</span>
                    {selectedEntity.gstin && (
                      <span className="ml-2 font-mono text-[11px] text-brand-700 font-bold">
                        [{selectedEntity.gstin}]
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-400">Choose a corporate client…</span>
                )}
                <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-90' : ''}`} />
              </div>

              {isDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden max-h-72 flex flex-col">
                  <div className="p-2 border-b border-slate-100 bg-slate-50">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        autoFocus
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="Search by company name, GSTIN, trade name..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:border-brand-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="overflow-y-auto divide-y divide-slate-100">
                    {entities
                      .filter((c) => {
                        const q = customerSearch.toLowerCase().trim();
                        return (
                          !q ||
                          c.company_name.toLowerCase().includes(q) ||
                          (c.brand_trade_name?.toLowerCase().includes(q) ?? false) ||
                          (c.gstin?.toLowerCase().includes(q) ?? false) ||
                          (c.email?.toLowerCase().includes(q) ?? false)
                        );
                      })
                      .map((ent) => (
                        <div
                          key={ent.id}
                          onClick={() => handleSelectEntity(ent)}
                          className={`p-3 text-xs cursor-pointer hover:bg-slate-50 transition flex items-center justify-between ${
                            selectedEntity?.id === ent.id ? 'bg-brand-50/60' : ''
                          }`}
                        >
                          <div>
                            <div className="font-bold text-slate-900">{ent.company_name}</div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                              {ent.gstin ? (
                                <span className="text-brand-800 font-semibold">{ent.gstin}</span>
                              ) : (
                                <span className="text-slate-400">No GSTIN</span>
                              )}
                              <span>·</span>
                              <span>{ent.email}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-slate-800">
                              {inr(ent.wallet_balance || 0)}
                            </span>
                            <span className="block text-[10px] text-slate-400">Balance</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Date Range & Presets */}
            <div className="lg:col-span-7 flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[240px]">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Accounting Period
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setDatePreset('all');
                    }}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-brand-500"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setDatePreset('all');
                    }}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="shrink-0 pt-4">
                <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'this_month', label: 'This Month' },
                      { id: 'last_month', label: 'Last Month' },
                      { id: 'financial_year', label: 'FY 24-25' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleDatePresetChange(p.id)}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                        datePreset === p.id
                          ? 'bg-white text-brand-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Selected Entity Identity Bar */}
          {selectedEntity && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-brand-50/60 to-slate-50 border border-brand-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="grid place-items-center h-10 w-10 rounded-xl bg-brand-600 text-white font-extrabold text-sm">
                  {selectedEntity.company_name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-slate-900">{selectedEntity.company_name}</span>
                    <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                      B2B Corporate
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-slate-600 mt-0.5">
                    {selectedEntity.gstin && (
                      <span>
                        <strong className="text-slate-800">GSTIN:</strong>{' '}
                        <span className="font-mono font-bold text-brand-800">{selectedEntity.gstin}</span>
                      </span>
                    )}
                    {selectedEntity.pan && (
                      <span>
                        <strong className="text-slate-800">PAN:</strong>{' '}
                        <span className="font-mono text-slate-700">{selectedEntity.pan}</span>
                      </span>
                    )}
                    <span>
                      <strong className="text-slate-800">Contact:</strong>{' '}
                      {selectedEntity.contact_person_name || 'Accounts Dept'} ({selectedEntity.email})
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Prepaid Balance</span>
                  <span className="font-mono text-base font-black text-slate-900">
                    {inr(selectedEntity.wallet_balance || 0)}
                  </span>
                </div>
                {selectedEntity.credit_limit > 0 && (
                  <div className="text-right border-l border-slate-200 pl-3">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Credit Limit</span>
                    <span className="font-mono text-sm font-bold text-purple-700">
                      {inr(selectedEntity.credit_limit)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Tally / Double-Entry Ledger Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Opening Balance</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">{inr(ledgerMetrics.openingBalance)}</span>
              <span className={`text-xs font-bold ${ledgerMetrics.openingType === 'Cr' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {ledgerMetrics.openingType}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Prior to period start</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Debit (Dr)</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-rose-600">{inr(ledgerMetrics.totalDebit)}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Voucher purchases &amp; adjustments</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Credit (Cr)</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-600">{inr(ledgerMetrics.totalCredit)}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Top-ups, NEFT deposits &amp; refunds</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Closing / Net Balance</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">{inr(ledgerMetrics.closingBalance)}</span>
              <span className={`text-xs font-bold ${ledgerMetrics.closingType === 'Cr' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {ledgerMetrics.closingType}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">As of latest transaction</p>
          </div>
        </div>

        {/* Voucher Search Bar */}
        <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={voucherSearch}
              onChange={(e) => setVoucherSearch(e.target.value)}
              placeholder="Search voucher no., reference, narration..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
            />
            {voucherSearch && (
              <button
                onClick={() => setVoucherSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Showing <strong>{filteredLedger.length}</strong> transactions
          </span>
        </div>

        {/* Double-Entry Ledger Statement Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {ledgerLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
              <p className="text-xs font-medium">Loading ledger entries…</p>
            </div>
          ) : !selectedEntity ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              Please select a corporate customer from the selector above to view their ledger.
            </div>
          ) : filteredLedger.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-300 stroke-[1.5]" />
              <p className="mt-3 text-sm font-bold text-slate-800">No transactions found for this period</p>
              <p className="text-xs text-slate-400 mt-1">
                Try expanding the date range filter or clearing the search query.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4 min-w-[130px]">Date &amp; Time</th>
                    <th className="py-3.5 px-4 min-w-[130px]">Voucher Type</th>
                    <th className="py-3.5 px-4 min-w-[160px]">Voucher No. / Ref</th>
                    <th className="py-3.5 px-4 min-w-[240px]">Particulars / Narration</th>
                    <th className="py-3.5 px-4 min-w-[110px] text-right">Debit (Dr) ₹</th>
                    <th className="py-3.5 px-4 min-w-[110px] text-right">Credit (Cr) ₹</th>
                    <th className="py-3.5 px-4 min-w-[120px] text-right">Balance ₹</th>
                    <th className="py-3.5 px-4 text-center min-w-[100px]">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredLedger.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Date */}
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap text-[11px]">
                        {formatDateTime(tx.date)}
                      </td>

                      {/* Voucher Type */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            tx.debit > 0
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {tx.voucherType}
                        </span>
                      </td>

                      {/* Voucher No */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 font-mono text-slate-900 font-semibold text-[11px]">
                          <span>{tx.voucherNo}</span>
                          <button
                            onClick={() => handleCopy(`v-${tx.id}`, tx.voucherNo)}
                            className="text-slate-400 hover:text-brand-600 p-0.5"
                            title="Copy voucher no."
                          >
                            {copiedKey === `v-${tx.id}` ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Particulars */}
                      <td className="py-3 px-4">
                        <div className="text-slate-800 text-[11px] leading-snug">{tx.particulars}</div>
                        {tx.paymentRef && (
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            Bank Ref: {tx.paymentRef}
                          </div>
                        )}
                      </td>

                      {/* Debit */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">
                        {tx.debit > 0 ? inrDecimal(tx.debit) : '—'}
                      </td>

                      {/* Credit */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                        {tx.credit > 0 ? inrDecimal(tx.credit) : '—'}
                      </td>

                      {/* Running Balance */}
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900">
                        {inrDecimal(tx.balance)}{' '}
                        <span className={`text-[10px] ${tx.balanceType === 'Cr' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {tx.balanceType}
                        </span>
                      </td>

                      {/* Invoice Action */}
                      <td className="py-3 px-4 text-center">
                        {tx.debit > 0 || tx.rawItems ? (
                          <button
                            onClick={() => handleOpenRowInvoice(tx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
                            title="View / Print Tax Invoice"
                          >
                            <FileText className="h-3 w-3" />
                            Invoice
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Tax Invoice Modal */}
      {selectedInvoice && (
        <OrderInvoiceModal
          invoice={selectedInvoice}
          isOpen={isInvoiceOpen}
          onClose={() => {
            setIsInvoiceOpen(false);
            setSelectedInvoice(null);
          }}
        />
      )}
    </div>
  );
}
