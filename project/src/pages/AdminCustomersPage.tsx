import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Download,
  RefreshCw,
  Mail,
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Lock,
  Unlock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { AdminTopBar } from '@/components/AdminHeader';
import { useToast } from '@/components/Toast';

export interface AdminCustomerRecord {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  customer_type: 'B2C' | 'B2B';
  is_blocked: boolean;
  phone_verified: boolean;
  email_confirmed_at: string | null;
  created_at: string;
  company_name?: string | null;
}

export default function AdminCustomersPage() {
  const { admin } = useAdminAuth();
  const navigate = useNavigate();
  const { push } = useToast();

  useEffect(() => {
    if (!admin) {
      navigate('/admin', { replace: true });
    }
  }, [admin, navigate]);

  const [customers, setCustomers] = useState<AdminCustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'BLOCKED'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'B2C' | 'B2B'>('ALL');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Checkbox selection state
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [bulkModalAction, setBulkModalAction] = useState<'BLOCK' | 'UNBLOCK' | null>(null);
  const [isUpdatingBulk, setIsUpdatingBulk] = useState(false);

  // Single customer modal states
  const [blockModalCustomer, setBlockModalCustomer] = useState<AdminCustomerRecord | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);

  const [resetModalCustomer, setResetModalCustomer] = useState<AdminCustomerRecord | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const fetchCustomers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Fetch customer profiles
      const { data: profs, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profError) throw profError;

      // Assemble customer records
      const records: AdminCustomerRecord[] = (profs ?? []).map((p) => {
        const isBlocked =
          Boolean(p.is_blocked) ||
          String(p.status || '').toLowerCase() === 'blocked' ||
          String(p.status || '').toLowerCase() === 'suspended';

        const emailConfirmed = p.email_confirmed_at || (p.created_at ? p.created_at : null);
        const phoneVerified = Boolean(p.phone_verified);

        return {
          id: p.id,
          full_name: String(p.full_name || p.contact_person_name || 'Customer').trim(),
          email: String(p.email || p.contact_email || '').trim().toLowerCase(),
          phone: String(p.phone || p.contact_phone || '').trim(),
          customer_type: (p.customer_type as 'B2C' | 'B2B') || 'B2C',
          is_blocked: isBlocked,
          phone_verified: phoneVerified,
          email_confirmed_at: emailConfirmed,
          created_at: p.created_at || new Date().toISOString(),
          company_name: p.company_name || null,
        };
      });

      setCustomers(records);
    } catch (err: unknown) {
      console.error('Failed to load customers:', err);
      const msg = err instanceof Error ? err.message : 'Could not fetch customer records';
      push(`Error loading customers: ${msg}`, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [push]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  // Single Block / Unblock action handler
  const handleToggleBlock = async () => {
    if (!blockModalCustomer) return;
    setIsUpdatingBlock(true);

    const newBlockedState = !blockModalCustomer.is_blocked;
    const targetId = blockModalCustomer.id;

    try {
      // 1. Try atomic RPC if installed
      const { error: rpcError } = await supabase.rpc(
        'admin_toggle_customer_block',
        {
          target_user_id: targetId,
          new_blocked: newBlockedState,
        }
      );

      // 2. If RPC not available, fallback to direct profiles table update
      if (rpcError) {
        console.warn('RPC admin_toggle_customer_block error, falling back to profiles update:', rpcError.message);
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            is_blocked: newBlockedState,
            status: newBlockedState ? 'inactive' : 'active',
          })
          .eq('id', targetId);

        if (updateError) throw updateError;
      }

      // Update local state immediately
      setCustomers((prev) =>
        prev.map((c) => (c.id === targetId ? { ...c, is_blocked: newBlockedState } : c))
      );

      const actionText = newBlockedState ? 'blocked & suspended' : 'unblocked & reactivated';
      push(
        `Customer ${blockModalCustomer.full_name || blockModalCustomer.email} is now ${actionText}.`,
        'success'
      );
      setBlockModalCustomer(null);
      setBlockReason('');
    } catch (err: unknown) {
      console.error('Failed to update customer block status:', err);
      const msg = err instanceof Error ? err.message : 'Failed to update customer status';
      push(`Block status update failed: ${msg}`, 'error');
    } finally {
      setIsUpdatingBlock(false);
    }
  };

  // Bulk Block / Unblock action handler
  const handleExecuteBulkAction = async () => {
    if (!bulkModalAction || selectedCustomerIds.size === 0) return;
    setIsUpdatingBulk(true);

    const newBlockedState = bulkModalAction === 'BLOCK';
    const targetIds = Array.from(selectedCustomerIds);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_blocked: newBlockedState,
          status: newBlockedState ? 'inactive' : 'active',
        })
        .in('id', targetIds);

      if (error) throw error;

      // Update state immediately
      setCustomers((prev) =>
        prev.map((c) =>
          selectedCustomerIds.has(c.id) ? { ...c, is_blocked: newBlockedState } : c
        )
      );

      const count = targetIds.length;
      push(`Successfully updated ${count} customers`, 'success');
      setSelectedCustomerIds(new Set());
      setBulkModalAction(null);
    } catch (err: unknown) {
      console.error('Failed bulk update:', err);
      const msg = err instanceof Error ? err.message : 'Bulk update failed';
      push(`Bulk update error: ${msg}`, 'error');
    } finally {
      setIsUpdatingBulk(false);
    }
  };

  // Password reset link handler
  const handleSendPasswordReset = async () => {
    if (!resetModalCustomer?.email) return;
    setIsSendingReset(true);

    try {
      const redirectUrl = `${window.location.origin}/login`;
      const { error } = await supabase.auth.resetPasswordForEmail(resetModalCustomer.email, {
        redirectTo: redirectUrl,
      });

      if (error) throw error;

      push(
        `Password reset link successfully sent to ${resetModalCustomer.email}`,
        'success'
      );
      setResetModalCustomer(null);
    } catch (err: unknown) {
      console.error('Failed to send password reset:', err);
      const msg = err instanceof Error ? err.message : 'Failed to send password reset link';
      push(`Reset failed: ${msg}`, 'error');
    } finally {
      setIsSendingReset(false);
    }
  };

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Status filter
      if (statusFilter === 'ACTIVE' && c.is_blocked) return false;
      if (statusFilter === 'BLOCKED' && !c.is_blocked) return false;

      // Type filter
      if (typeFilter !== 'ALL' && c.customer_type !== typeFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = c.full_name.toLowerCase().includes(q);
        const emailMatch = c.email.toLowerCase().includes(q);
        const phoneMatch = c.phone.includes(q);
        const idMatch = c.id.toLowerCase().includes(q);
        const compMatch = c.company_name?.toLowerCase().includes(q) ?? false;
        return nameMatch || emailMatch || phoneMatch || idMatch || compMatch;
      }

      return true;
    });
  }, [customers, statusFilter, typeFilter, searchQuery]);

  // Paginated customers
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  // Checkbox selection states
  const isAllCurrentPageSelected = useMemo(() => {
    if (paginatedCustomers.length === 0) return false;
    return paginatedCustomers.every((c) => selectedCustomerIds.has(c.id));
  }, [paginatedCustomers, selectedCustomerIds]);

  const isSomeCurrentPageSelected = useMemo(() => {
    if (paginatedCustomers.length === 0) return false;
    return (
      paginatedCustomers.some((c) => selectedCustomerIds.has(c.id)) &&
      !isAllCurrentPageSelected
    );
  }, [paginatedCustomers, selectedCustomerIds, isAllCurrentPageSelected]);

  const handleToggleSelectAll = () => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (isAllCurrentPageSelected) {
        paginatedCustomers.forEach((c) => next.delete(c.id));
      } else {
        paginatedCustomers.forEach((c) => next.add(c.id));
      }
      return next;
    });
  };

  const handleToggleSelect = (id: string) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Summary Metrics (Keep only 3 cards)
  const metrics = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => !c.is_blocked).length;
    const blocked = customers.filter((c) => c.is_blocked).length;
    return { total, active, blocked };
  }, [customers]);

  // CSV Export
  const handleExportCSV = () => {
    if (filteredCustomers.length === 0) {
      push('No customers to export', 'info');
      return;
    }

    const headers = [
      'Customer ID',
      'Name',
      'Email',
      'Email Verified',
      'Phone',
      'Phone Verified',
      'Customer Type',
      'Company Name',
      'Status',
      'Created At',
    ];

    const rows = filteredCustomers.map((c) => [
      `"${c.id}"`,
      `"${c.full_name.replace(/"/g, '""')}"`,
      `"${c.email}"`,
      c.email_confirmed_at ? 'Verified' : 'Unverified',
      `"${c.phone}"`,
      c.phone_verified ? 'Verified' : 'Unverified',
      c.customer_type,
      `"${(c.company_name || '').replace(/"/g, '""')}"`,
      c.is_blocked ? 'BLOCKED' : 'ACTIVE',
      c.created_at,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gyftkart-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    push(`Exported ${filteredCustomers.length} customer records to CSV`, 'success');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 2-Tier Admin Navigation Header */}
      <AdminTopBar />

      <main className="mx-auto max-w-7xl 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <Users className="h-7 w-7 text-brand-600" />
              Customer Management
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Complete oversight of B2C and B2B client accounts, verification flags, and security access.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => fetchCustomers(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition"
              title="Refresh Customer Directory"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-brand-600' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
              title="Download CSV Statement"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Export CSV
            </button>
            <Link
              to="/admin/b2b-customers"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700 transition"
            >
              <Building2 className="h-3.5 w-3.5" />
              B2B Accounts
            </Link>
          </div>
        </div>

        {/* ───── 3 KPI Summary Cards (Wallet Card Removed) ───── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Customers
              </span>
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-blue-50 text-blue-600">
                <Users className="h-4 w-4" />
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{metrics.total}</p>
            <p className="text-[11px] text-slate-400 mt-1">All registered accounts</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Active Accounts
              </span>
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600">
                <ShieldCheck className="h-4 w-4" />
              </span>
            </div>
            <p className="text-2xl font-black text-emerald-700 mt-2">{metrics.active}</p>
            <p className="text-[11px] text-slate-400 mt-1">Eligible to purchase &amp; login</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Blocked / Suspended
              </span>
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-rose-50 text-rose-600">
                <ShieldAlert className="h-4 w-4" />
              </span>
            </div>
            <p className="text-2xl font-black text-rose-600 mt-2">{metrics.blocked}</p>
            <p className="text-[11px] text-slate-400 mt-1">Prevented from login &amp; orders</p>
          </div>
        </div>

        {/* ───── Filter & Search Section ───── */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by customer name, email, phone, firm name, or UUID..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Selectors */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'BLOCKED');
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs focus:border-brand-500 focus:outline-none"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active Only</option>
                <option value="BLOCKED">Blocked Only</option>
              </select>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as 'ALL' | 'B2C' | 'B2B');
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs focus:border-brand-500 focus:outline-none"
              >
                <option value="ALL">All Customer Types</option>
                <option value="B2C">B2C Retail</option>
                <option value="B2B">B2B Corporate</option>
              </select>

              {/* Page Size Selector */}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs focus:border-brand-500 focus:outline-none"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
              </select>
            </div>
          </div>
        </div>

        {/* ───── Bulk Action Floating Toolbar (When items selected) ───── */}
        {selectedCustomerIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 text-white p-3.5 px-5 shadow-lg border border-slate-800 animate-slide-up">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center h-6 w-6 rounded-full bg-brand-500 text-white text-xs font-black">
                {selectedCustomerIds.size}
              </span>
              <span className="text-xs font-bold text-white">
                {selectedCustomerIds.size} {selectedCustomerIds.size === 1 ? 'customer' : 'customers'} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setBulkModalAction('BLOCK')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white px-3 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <Lock className="h-3.5 w-3.5" />
                Bulk Block
              </button>

              <button
                onClick={() => setBulkModalAction('UNBLOCK')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/50 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600 hover:text-white px-3 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <Unlock className="h-3.5 w-3.5" />
                Bulk Unblock
              </button>

              <button
                onClick={() => setSelectedCustomerIds(new Set())}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white px-3 py-1.5 text-xs font-bold transition cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                Deselect All
              </button>
            </div>
          </div>
        )}

        {/* ───── Customer Directory Table ───── */}
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600 mb-3" />
              <p className="text-sm font-semibold">Loading customer directory…</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <span className="grid place-items-center h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 mb-3">
                <Users className="h-7 w-7" />
              </span>
              <p className="text-sm font-bold text-slate-800">No customers found</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                {searchQuery || statusFilter !== 'ALL' || typeFilter !== 'ALL'
                  ? 'No accounts match the current filter or search criteria.'
                  : 'Customer accounts will appear here automatically when registered.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80">
                    {/* Header Checkbox (Select all on current page) */}
                    <th className="px-3.5 py-3.5 text-center w-[44px]">
                      <input
                        type="checkbox"
                        aria-label="Select all customers on current page"
                        checked={isAllCurrentPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isSomeCurrentPageSelected;
                        }}
                        onChange={handleToggleSelectAll}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[60px]">
                      S. NO.
                    </th>
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[240px]">
                      CUSTOMER
                    </th>
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[170px]">
                      PHONE
                    </th>
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[120px]">
                      STATUS
                    </th>
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[190px] text-right">
                      ACTIONS
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedCustomers.map((customer, index) => {
                    const totalCount = filteredCustomers.length;
                    const serialNo = totalCount - ((currentPage - 1) * pageSize + index);
                    const hasEmailVerification = Boolean(customer.email_confirmed_at);
                    const isB2B = customer.customer_type === 'B2B';
                    const isSelected = selectedCustomerIds.has(customer.id);

                    return (
                      <tr
                        key={customer.id}
                        className={`hover:bg-slate-50/60 transition-colors ${
                          isSelected
                            ? 'bg-brand-50/40'
                            : customer.is_blocked
                            ? 'bg-rose-50/20'
                            : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-3.5 py-3.5 text-center w-[44px]">
                          <input
                            type="checkbox"
                            aria-label={`Select ${customer.full_name}`}
                            checked={isSelected}
                            onChange={() => handleToggleSelect(customer.id)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                          />
                        </td>

                        {/* 1. S. NO. */}
                        <td className="px-3 py-3.5 font-mono text-slate-500 text-xs">
                          {serialNo}
                        </td>

                        {/* 2. CUSTOMER (Name & Email with Verification Badge) */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`grid place-items-center h-8 w-8 rounded-lg text-white font-black text-xs uppercase shrink-0 mt-0.5 ${
                                isB2B
                                  ? 'bg-gradient-to-br from-amber-600 to-amber-800'
                                  : 'bg-gradient-to-br from-brand-600 to-brand-800'
                              }`}
                            >
                              {customer.full_name.charAt(0) || 'C'}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 text-xs truncate">
                                  {customer.full_name}
                                </span>
                                {isB2B && (
                                  <span className="rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.2 text-[9px] font-bold text-amber-800">
                                    B2B {customer.company_name ? `· ${customer.company_name}` : ''}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[11px] text-slate-500 truncate max-w-[200px]">
                                  {customer.email || 'No email provided'}
                                </span>
                                {hasEmailVerification ? (
                                  <span
                                    className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700"
                                    title="Email Verified"
                                  >
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                    Verified
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.2 text-[9px] font-medium text-slate-500"
                                    title="Email Not Verified"
                                  >
                                    Unverified
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 3. PHONE (with Verification Badge) */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-0.5">
                            <p className="font-mono text-xs text-slate-700 font-semibold">
                              {customer.phone || '—'}
                            </p>
                            {customer.phone ? (
                              customer.phone_verified ? (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700">
                                  <CheckCircle2 className="h-2.5 w-2.5" /> Verified
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-slate-400">
                                  Unverified
                                </span>
                              )
                            ) : null}
                          </div>
                        </td>

                        {/* 4. STATUS (Active vs Blocked Badge) */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {customer.is_blocked ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-1 text-[10px] font-bold text-rose-700">
                              <XCircle className="h-3 w-3" />
                              Blocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Active
                            </span>
                          )}
                        </td>

                        {/* 5. ACTIONS (Block/Unblock, Password Reset) */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Block / Unblock Button */}
                            {customer.is_blocked ? (
                              <button
                                onClick={() => setBlockModalCustomer(customer)}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition shadow-xs"
                                title="Unblock & Reactivate Account"
                              >
                                <Unlock className="h-3 w-3" />
                                Unblock
                              </button>
                            ) : (
                              <button
                                onClick={() => setBlockModalCustomer(customer)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition shadow-xs"
                                title="Block & Suspend Account"
                              >
                                <Lock className="h-3 w-3" />
                                Block
                              </button>
                            )}

                            {/* Password Reset Button */}
                            <button
                              onClick={() => setResetModalCustomer(customer)}
                              disabled={!customer.email}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-brand-500 hover:text-brand-700 hover:bg-brand-50/50 disabled:opacity-40 transition shadow-xs"
                              title="Send Password Reset Link"
                            >
                              <KeyRound className="h-3 w-3 text-slate-500" />
                              Reset Pass
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ───── Pagination Footer ───── */}
          {filteredCustomers.length > 0 && (
            <div className="border-t border-slate-200/80 p-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-slate-500 font-medium">
                Showing{' '}
                <span className="font-bold text-slate-800">
                  {(currentPage - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-bold text-slate-800">
                  {Math.min(currentPage * pageSize, filteredCustomers.length)}
                </span>{' '}
                of{' '}
                <span className="font-bold text-slate-800">
                  {filteredCustomers.length}
                </span>{' '}
                customers
              </p>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5 && currentPage > 3) {
                      pageNum = currentPage - 2 + i;
                      if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`min-w-[2rem] h-8 rounded-lg text-xs font-bold transition ${
                          pageNum === currentPage
                            ? 'bg-brand-600 text-white shadow-xs'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ───── Modal 1: Single Block / Unblock Confirmation Modal ───── */}
      {blockModalCustomer && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm p-4 flex items-center justify-center animate-fade-in">
          <div
            className="fixed inset-0 -z-10"
            onClick={() => !isUpdatingBlock && setBlockModalCustomer(null)}
          />

          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 p-6 space-y-5 animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className={`grid place-items-center h-9 w-9 rounded-xl ${
                    blockModalCustomer.is_blocked
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {blockModalCustomer.is_blocked ? (
                    <Unlock className="h-5 w-5" />
                  ) : (
                    <Lock className="h-5 w-5" />
                  )}
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {blockModalCustomer.is_blocked
                      ? 'Reactivate Customer Account'
                      : 'Suspend & Block Customer'}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    ID: {blockModalCustomer.id.slice(0, 8)}…
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBlockModalCustomer(null)}
                disabled={isUpdatingBlock}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/70 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Customer:</span>
                <span className="font-bold text-slate-900">
                  {blockModalCustomer.full_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Email:</span>
                <span className="font-mono text-slate-700">
                  {blockModalCustomer.email}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Current Status:</span>
                <span
                  className={`font-bold ${
                    blockModalCustomer.is_blocked ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {blockModalCustomer.is_blocked ? 'BLOCKED' : 'ACTIVE'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">
                Administrative Reason / Audit Note (Optional)
              </label>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder={
                  blockModalCustomer.is_blocked
                    ? 'Reason for lifting suspension...'
                    : 'Reason for blocking (e.g. Chargeback investigation, suspicious activity, policy violation)...'
                }
                rows={2}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {blockModalCustomer.is_blocked
                ? 'Unblocking will immediately restore the customer’s ability to sign in and purchase gift vouchers.'
                : 'Blocking will immediately terminate active sessions and prevent this customer from logging in or placing new orders.'}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setBlockModalCustomer(null)}
                disabled={isUpdatingBlock}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleBlock}
                disabled={isUpdatingBlock}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition ${
                  blockModalCustomer.is_blocked
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isUpdatingBlock ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Updating…
                  </>
                ) : blockModalCustomer.is_blocked ? (
                  <>
                    <Unlock className="h-3.5 w-3.5" />
                    Confirm Unblock
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    Confirm Block
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── Modal 2: Bulk Block / Unblock Confirmation Modal ───── */}
      {bulkModalAction && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm p-4 flex items-center justify-center animate-fade-in">
          <div
            className="fixed inset-0 -z-10"
            onClick={() => !isUpdatingBulk && setBulkModalAction(null)}
          />

          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 p-6 space-y-5 animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span
                  className={`grid place-items-center h-9 w-9 rounded-xl ${
                    bulkModalAction === 'UNBLOCK'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {bulkModalAction === 'UNBLOCK' ? (
                    <Unlock className="h-5 w-5" />
                  ) : (
                    <Lock className="h-5 w-5" />
                  )}
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {bulkModalAction === 'UNBLOCK'
                      ? `Bulk Unblock ${selectedCustomerIds.size} Customers`
                      : `Bulk Block ${selectedCustomerIds.size} Customers`}
                  </h2>
                  <p className="text-[11px] text-slate-500">Mass Security &amp; Access Update</p>
                </div>
              </div>
              <button
                onClick={() => setBulkModalAction(null)}
                disabled={isUpdatingBulk}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/70 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Selected Count:</span>
                <span className="font-bold text-slate-900">
                  {selectedCustomerIds.size} {selectedCustomerIds.size === 1 ? 'customer' : 'customers'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Target Action:</span>
                <span
                  className={`font-bold ${
                    bulkModalAction === 'UNBLOCK' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {bulkModalAction === 'UNBLOCK' ? 'SET TO ACTIVE (UNBLOCKED)' : 'SET TO BLOCKED (SUSPENDED)'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {bulkModalAction === 'UNBLOCK'
                ? `Are you sure you want to reactivate access for all ${selectedCustomerIds.size} selected customer accounts? They will immediately be able to log in and purchase gift vouchers.`
                : `Are you sure you want to suspend access for all ${selectedCustomerIds.size} selected customer accounts? Their active sessions will be invalidated and they will be prevented from placing orders.`}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setBulkModalAction(null)}
                disabled={isUpdatingBulk}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkAction}
                disabled={isUpdatingBulk}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition ${
                  bulkModalAction === 'UNBLOCK'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isUpdatingBulk ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Updating…
                  </>
                ) : bulkModalAction === 'UNBLOCK' ? (
                  <>
                    <Unlock className="h-3.5 w-3.5" />
                    Confirm Bulk Unblock
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    Confirm Bulk Block
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── Modal 3: Password Reset Confirmation Modal ───── */}
      {resetModalCustomer && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm p-4 flex items-center justify-center animate-fade-in">
          <div
            className="fixed inset-0 -z-10"
            onClick={() => !isSendingReset && setResetModalCustomer(null)}
          />

          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 p-6 space-y-5 animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center h-9 w-9 rounded-xl bg-amber-100 text-amber-700">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Send Password Reset</h2>
                  <p className="text-[11px] text-slate-500">Security Credentials Action</p>
                </div>
              </div>
              <button
                onClick={() => setResetModalCustomer(null)}
                disabled={isSendingReset}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/70 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Customer:</span>
                <span className="font-bold text-slate-900">
                  {resetModalCustomer.full_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Recipient Email:</span>
                <span className="font-mono font-bold text-brand-700">
                  {resetModalCustomer.email}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This action triggers an official secure Supabase password recovery email to{' '}
              <span className="font-bold text-slate-900">{resetModalCustomer.email}</span>.
              The customer can click the link to securely update their account credentials.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setResetModalCustomer(null)}
                disabled={isSendingReset}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={isSendingReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm transition"
              >
                {isSendingReset ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sending Link…
                  </>
                ) : (
                  <>
                    <Mail className="h-3.5 w-3.5" />
                    Send Reset Link
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
