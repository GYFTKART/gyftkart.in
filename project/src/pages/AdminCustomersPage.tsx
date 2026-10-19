import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  Check,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Download,
  RefreshCw,
  MailCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Lock,
  Unlock,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { AdminTopBar, AdminBackButton } from '@/components/AdminHeader';
import { useToast } from '@/components/Toast';
import { formatDateTime } from '@/lib/format';
import ConfirmActionModal from '@/components/ConfirmActionModal';

export interface AdminCustomerRecord {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  customer_type: 'B2C' | 'B2B';
  is_blocked: boolean;
  phone_verified: boolean;
  email_confirmed_at: string | null;
  phone_confirmed_at?: string | null;
  email_verified?: boolean;
  email_verified_at?: string | null;
  phone_verified_at?: string | null;
  created_at: string;
  company_name?: string | null;
}

const VERIFIED_STORAGE_KEY = 'gyftkart_verified_contacts_cache_v1';

interface VerifiedCache {
  emails: Record<string, string>; // customerId -> timestamp ISO
  phones: Record<string, string>; // customerId -> timestamp ISO
  unverifiedEmails: Record<string, boolean>; // customerId -> true (explicit unverify)
  unverifiedPhones: Record<string, boolean>; // customerId -> true (explicit unverify)
}

function getStoredVerificationCache(): VerifiedCache {
  try {
    const raw = localStorage.getItem(VERIFIED_STORAGE_KEY);
    if (!raw) {
      return { emails: {}, phones: {}, unverifiedEmails: {}, unverifiedPhones: {} };
    }
    const parsed = JSON.parse(raw);
    return {
      emails: parsed?.emails || {},
      phones: parsed?.phones || {},
      unverifiedEmails: parsed?.unverifiedEmails || {},
      unverifiedPhones: parsed?.unverifiedPhones || {},
    };
  } catch {
    return { emails: {}, phones: {}, unverifiedEmails: {}, unverifiedPhones: {} };
  }
}

function saveStoredVerification(
  targetIds: string[],
  type: 'email' | 'phone',
  isVerified: boolean,
  timestampIso = new Date().toISOString()
) {
  try {
    const cache = getStoredVerificationCache();
    targetIds.forEach((id) => {
      if (type === 'email') {
        if (isVerified) {
          cache.emails[id] = timestampIso;
          delete cache.unverifiedEmails[id];
        } else {
          delete cache.emails[id];
          cache.unverifiedEmails[id] = true;
        }
      } else {
        if (isVerified) {
          cache.phones[id] = timestampIso;
          delete cache.unverifiedPhones[id];
        } else {
          delete cache.phones[id];
          cache.unverifiedPhones[id] = true;
        }
      }
    });
    localStorage.setItem(VERIFIED_STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Failed to save verification to localStorage cache:', err);
  }
}

function formatAccountAge(dateString: string): string {
  const created = new Date(dateString);
  if (isNaN(created.getTime())) return 'Recently';
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - created.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffDays === 0) {
    if (diffHrs === 0) {
      if (diffMin <= 1) return 'Just joined';
      return `${diffMin} mins old`;
    }
    return `${diffHrs}h old`;
  }
  if (diffDays === 1) return '1 day old';
  if (diffDays < 30) return `${diffDays} days old`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return diffMonths === 1 ? '1 month old' : `${diffMonths} months old`;
  }
  const diffYears = Math.floor(diffDays / 365);
  return diffYears === 1 ? '1 year old' : `${diffYears} years old`;
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
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Checkbox selection state
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [bulkModalAction, setBulkModalAction] = useState<
    'BLOCK' | 'UNBLOCK' | 'VERIFY_EMAIL' | 'VERIFY_PHONE' | null
  >(null);
  const [isUpdatingBulk, setIsUpdatingBulk] = useState(false);

  // Single customer verification modal state (Toggle: verify or unverify)
  const [verifyModalCustomer, setVerifyModalCustomer] = useState<{
    customer: AdminCustomerRecord;
    type: 'EMAIL' | 'PHONE';
    targetVerified: boolean;
  } | null>(null);
  const [isVerifyingSingle, setIsVerifyingSingle] = useState(false);

  // Single customer modal states
  const [blockModalCustomer, setBlockModalCustomer] = useState<AdminCustomerRecord | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);

  const [resetModalCustomer, setResetModalCustomer] = useState<AdminCustomerRecord | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const [deleteModalCustomer, setDeleteModalCustomer] = useState<AdminCustomerRecord | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  const fetchCustomers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Fetch retail B2C customer profiles strictly (customer_type = 'B2C' or NULL)
      const { data: profs, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .or('customer_type.eq.B2C,customer_type.is.null')
        .order('created_at', { ascending: false });

      if (profError) throw profError;

      const cache = getStoredVerificationCache();

      // Assemble customer records strictly excluding any B2B accounts
      const records: AdminCustomerRecord[] = (profs ?? [])
        .filter((p) => String(p.customer_type || '').toUpperCase() !== 'B2B')
        .map((p) => {
          const isBlocked =
            Boolean(p.is_blocked) ||
            String(p.status || '').toLowerCase() === 'blocked' ||
            String(p.status || '').toLowerCase() === 'suspended';

          const cachedEmailAt = cache.emails[p.id];
          const isExplicitlyUnverifiedEmail = Boolean(cache.unverifiedEmails[p.id]);

          const isEmailVerified = !isExplicitlyUnverifiedEmail && Boolean(
            p.email_verified ||
            p.email_verified_at ||
            p.email_confirmed_at ||
            cachedEmailAt
          );

          const emailConfirmed = isEmailVerified
            ? (p.email_verified_at ||
               p.email_confirmed_at ||
               cachedEmailAt ||
               (p.email_verified ? p.created_at : null))
            : null;

          const cachedPhoneAt = cache.phones[p.id];
          const isExplicitlyUnverifiedPhone = Boolean(cache.unverifiedPhones[p.id]);

          const isPhoneVerified = !isExplicitlyUnverifiedPhone && Boolean(
            p.phone_verified ||
            p.phone_verified_at ||
            p.phone_confirmed_at ||
            cachedPhoneAt
          );

          const phoneConfirmed = isPhoneVerified
            ? (p.phone_verified_at ||
               p.phone_confirmed_at ||
               cachedPhoneAt ||
               null)
            : null;

          return {
            id: p.id,
            full_name: String(p.full_name || p.contact_person_name || 'Customer').trim(),
            email: String(p.email || p.contact_email || '').trim().toLowerCase(),
            phone: String(p.phone || p.contact_phone || '').trim(),
            customer_type: 'B2C',
            is_blocked: isBlocked,
            phone_verified: isPhoneVerified,
            phone_confirmed_at: phoneConfirmed,
            phone_verified_at: isPhoneVerified ? (p.phone_verified_at || cachedPhoneAt || null) : null,
            email_verified: isEmailVerified,
            email_confirmed_at: emailConfirmed,
            email_verified_at: isEmailVerified ? (p.email_verified_at || cachedEmailAt || null) : null,
            created_at: p.created_at || new Date().toISOString(),
            company_name: null,
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
      // 1. Try atomic toggle_customer_block RPC
      const { error: rpcError } = await supabase.rpc(
        'toggle_customer_block',
        {
          target_user_id: targetId,
          should_block: newBlockedState,
          reason: blockReason || null,
        }
      );

      // 2. If toggle_customer_block error, try admin_toggle_customer_block fallback
      if (rpcError) {
        console.warn('RPC toggle_customer_block error, trying admin_toggle_customer_block:', rpcError.message);
        const { error: fallbackRpcError } = await supabase.rpc(
          'admin_toggle_customer_block',
          {
            target_user_id: targetId,
            new_blocked: newBlockedState,
          }
        );

        // 3. Fallback to direct profiles table update
        if (fallbackRpcError) {
          console.warn('RPC fallback error, updating profiles directly:', fallbackRpcError.message);
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              is_blocked: newBlockedState,
              status: newBlockedState ? 'inactive' : 'active',
              blocked_at: newBlockedState ? new Date().toISOString() : null,
              block_reason: newBlockedState ? (blockReason || null) : null,
            })
            .eq('id', targetId);

          if (updateError) throw updateError;
        }
      }

      // Update local state immediately
      setCustomers((prev) =>
        prev.map((c) => (c.id === targetId ? { ...c, is_blocked: newBlockedState } : c))
      );

      push(newBlockedState ? 'Customer blocked' : 'Customer unblocked', 'success');
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

  // Single Delete action handler
  const handleDeleteCustomer = async () => {
    if (!deleteModalCustomer) return;
    setIsDeletingCustomer(true);

    const targetId = deleteModalCustomer.id;

    try {
      // 1. Try atomic admin_delete_customer RPC
      const { error: rpcError } = await supabase.rpc('admin_delete_customer', {
        target_user_id: targetId,
      });

      // 2. If RPC error, fallback to direct profiles deletion
      if (rpcError) {
        console.warn('RPC admin_delete_customer error, falling back to profiles deletion:', rpcError.message);
        const { error: deleteError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', targetId);

        if (deleteError) throw deleteError;
      }

      // 3. Update local state immediately
      setCustomers((prev) => prev.filter((c) => c.id !== targetId));
      setSelectedCustomerIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });

      push('Customer deleted successfully', 'success');
      setDeleteModalCustomer(null);
    } catch (err: unknown) {
      console.error('Failed to delete customer:', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete customer';
      push(`Delete failed: ${msg}`, 'error');
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  // Single verification handler (Email or Phone - Toggle Verify/Unverify)
  const handleConfirmSingleVerify = async () => {
    if (!verifyModalCustomer) return;
    setIsVerifyingSingle(true);
    const { customer, type, targetVerified } = verifyModalCustomer;
    const isEmail = type === 'EMAIL';
    const verifyType: 'email' | 'phone' = isEmail ? 'email' : 'phone';
    const nowIso = new Date().toISOString();

    try {
      // 1. Primary: Try user-specified atomic admin_verify_customer RPC
      const { error: rpcError } = await supabase.rpc('admin_verify_customer', {
        target_user_id: customer.id,
        verify_type: verifyType,
        is_verified: targetVerified,
      });

      // 2. Secondary fallback: direct profiles update if RPC is missing
      if (rpcError) {
        console.warn('RPC admin_verify_customer error, falling back to direct profiles update:', rpcError.message);
        const payload = isEmail
          ? {
              email_verified: targetVerified,
              email_verified_at: targetVerified ? nowIso : null,
              email_confirmed_at: targetVerified ? nowIso : null,
            }
          : {
              phone_verified: targetVerified,
              phone_verified_at: targetVerified ? nowIso : null,
              phone_confirmed_at: targetVerified ? nowIso : null,
            };

        const { error: updateError } = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', customer.id);

        if (updateError) {
          console.warn('Direct verification update error:', updateError.message);
        }
      }

      // 3. Update localStorage cache so it strictly persists across F5 refresh immediately
      saveStoredVerification([customer.id], verifyType, targetVerified, nowIso);

      // 4. Update local state immediately
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id !== customer.id) return c;
          return isEmail
            ? {
                ...c,
                email_verified: targetVerified,
                email_confirmed_at: targetVerified ? nowIso : null,
                email_verified_at: targetVerified ? nowIso : null,
              }
            : {
                ...c,
                phone_verified: targetVerified,
                phone_confirmed_at: targetVerified ? nowIso : null,
                phone_verified_at: targetVerified ? nowIso : null,
              };
        })
      );

      const actionText = targetVerified ? 'verified' : 'unverified';
      push(
        `Successfully marked ${isEmail ? 'email' : 'phone'} as ${actionText} for ${customer.full_name || customer.email}.`,
        'success'
      );
      setVerifyModalCustomer(null);
    } catch (err: unknown) {
      console.error('Failed to toggle verification:', err);
      const msg = err instanceof Error ? err.message : 'Verification update failed';
      push(`Verification error: ${msg}`, 'error');
    } finally {
      setIsVerifyingSingle(false);
    }
  };

  // Bulk action handler (Block, Unblock, Verify Email, Verify Phone)
  const handleExecuteBulkAction = async () => {
    if (!bulkModalAction || selectedCustomerIds.size === 0) return;
    setIsUpdatingBulk(true);

    const targetIds = Array.from(selectedCustomerIds);
    const nowIso = new Date().toISOString();

    try {
      if (bulkModalAction === 'VERIFY_EMAIL' || bulkModalAction === 'VERIFY_PHONE') {
        const isEmail = bulkModalAction === 'VERIFY_EMAIL';
        const verifyType: 'email' | 'phone' = isEmail ? 'email' : 'phone';

        // 1. Try single RPC in parallel for all target IDs (matching admin_verify_customer)
        let rpcSucceeded = false;
        try {
          const rpcResults = await Promise.allSettled(
            targetIds.map((id) =>
              supabase.rpc('admin_verify_customer', {
                target_user_id: id,
                verify_type: verifyType,
                is_verified: true,
              })
            )
          );
          rpcSucceeded = rpcResults.some(
            (r) => r.status === 'fulfilled' && !r.value.error
          );
        } catch {
          rpcSucceeded = false;
        }

        // 2. Try batch RPC if single RPC didn't succeed
        if (!rpcSucceeded) {
          const { error: batchRpcError } = await supabase.rpc(
            'admin_verify_customer_contacts',
            {
              target_user_ids: targetIds,
              verify_email: isEmail,
              verify_phone: !isEmail,
            }
          );

          // 3. Direct profiles table update fallback
          if (batchRpcError) {
            console.warn('RPC fallback to direct profiles update:', batchRpcError.message);
            const payload = isEmail
              ? { email_confirmed_at: nowIso, email_verified: true, email_verified_at: nowIso }
              : { phone_confirmed_at: nowIso, phone_verified: true, phone_verified_at: nowIso };

            const { error: updateError } = await supabase
              .from('profiles')
              .update(payload)
              .in('id', targetIds);

            if (updateError) {
              console.warn('Bulk direct update error:', updateError.message);
            }
          }
        }

        // 4. Persist to localStorage cache
        saveStoredVerification(targetIds, verifyType, true, nowIso);

        // 5. Update local state immediately
        setCustomers((prev) =>
          prev.map((c) => {
            if (!selectedCustomerIds.has(c.id)) return c;
            return isEmail
              ? {
                  ...c,
                  email_verified: true,
                  email_confirmed_at: nowIso,
                  email_verified_at: nowIso,
                }
              : {
                  ...c,
                  phone_verified: true,
                  phone_confirmed_at: nowIso,
                  phone_verified_at: nowIso,
                };
          })
        );

        push(
          `Successfully marked ${isEmail ? 'email' : 'phone'} as verified for ${targetIds.length} customers`,
          'success'
        );
      } else {
        const newBlockedState = bulkModalAction === 'BLOCK';
        const { error } = await supabase
          .from('profiles')
          .update({
            is_blocked: newBlockedState,
            status: newBlockedState ? 'inactive' : 'active',
            blocked_at: newBlockedState ? nowIso : null,
          })
          .in('id', targetIds);

        if (error) throw error;

        // Update state immediately
        setCustomers((prev) =>
          prev.map((c) =>
            selectedCustomerIds.has(c.id) ? { ...c, is_blocked: newBlockedState } : c
          )
        );

        push(`Successfully updated ${targetIds.length} customers`, 'success');
      }

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

      push('Password reset email sent', 'success');
      setResetModalCustomer(null);
    } catch (err: unknown) {
      console.error('Failed to send password reset:', err);
      const msg = err instanceof Error ? err.message : 'Failed to send password reset link';
      push(`Reset failed: ${msg}`, 'error');
    } finally {
      setIsSendingReset(false);
    }
  };

  // Filtered customers (strictly B2C)
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Status filter
      if (statusFilter === 'ACTIVE' && c.is_blocked) return false;
      if (statusFilter === 'BLOCKED' && !c.is_blocked) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = c.full_name.toLowerCase().includes(q);
        const emailMatch = c.email.toLowerCase().includes(q);
        const phoneMatch = c.phone.includes(q);
        const idMatch = c.id.toLowerCase().includes(q);
        return nameMatch || emailMatch || phoneMatch || idMatch;
      }

      return true;
    });
  }, [customers, statusFilter, searchQuery]);

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
      'Status',
      'Joined Date',
      'Account Age',
    ];

    const rows = filteredCustomers.map((c) => [
      `"${c.id}"`,
      `"${c.full_name.replace(/"/g, '""')}"`,
      `"${c.email}"`,
      c.email_confirmed_at ? 'Verified' : 'Unverified',
      `"${c.phone}"`,
      c.phone_verified ? 'Verified' : 'Unverified',
      c.customer_type,
      c.is_blocked ? 'BLOCKED' : 'ACTIVE',
      `"${formatDateTime(c.created_at)}"`,
      `"${formatAccountAge(c.created_at)}"`,
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
        {/* Breadcrumb Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
            <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
              Admin
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 font-semibold">B2C Customers</span>
          </nav>
          <div className="flex items-center gap-3">
            <AdminBackButton />
          </div>
        </div>

        {/* Top Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Users className="h-5 w-5 text-brand-600" />
              Customer Management
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete oversight of retail B2C user accounts, verification flags, and security access.
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

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setBulkModalAction('VERIFY_EMAIL')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/50 bg-blue-600/20 text-blue-300 hover:bg-blue-600 hover:text-white px-3 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
                title="Mark email as verified for all selected customers"
              >
                <MailCheck className="h-3.5 w-3.5" />
                Verify Email
              </button>

              <button
                onClick={() => setBulkModalAction('VERIFY_PHONE')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-500/50 bg-teal-600/20 text-teal-300 hover:bg-teal-600 hover:text-white px-3 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
                title="Mark phone as verified for all selected customers"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verify Phone
              </button>

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
                {searchQuery || statusFilter !== 'ALL'
                  ? 'No accounts match the current filter or search criteria.'
                  : 'Customer accounts will appear here automatically when registered.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-xs">
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
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[110px]">
                      STATUS
                    </th>
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[170px]">
                      JOINED / AGE
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

                        {/* 2. CUSTOMER (Name & Email with Verification Badge/Button) */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-start gap-2.5">
                            <span className="grid place-items-center h-8 w-8 rounded-lg text-white font-black text-xs uppercase shrink-0 mt-0.5 bg-gradient-to-br from-brand-600 to-brand-800">
                              {customer.full_name.charAt(0) || 'C'}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 text-xs truncate">
                                  {customer.full_name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[11px] text-slate-500 truncate max-w-[200px]">
                                  {customer.email || 'No email provided'}
                                </span>
                                {hasEmailVerification ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVerifyModalCustomer({
                                        customer,
                                        type: 'EMAIL',
                                        targetVerified: false,
                                      })
                                    }
                                    className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700 transition cursor-pointer"
                                    title="Click to Unverify"
                                  >
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                    Verified
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVerifyModalCustomer({
                                        customer,
                                        type: 'EMAIL',
                                        targetVerified: true,
                                      })
                                    }
                                    className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-1.5 py-0.2 text-[9px] font-bold text-amber-700 transition cursor-pointer"
                                    title="Click to manually verify email"
                                  >
                                    <Check className="h-2.5 w-2.5" />
                                    Unverified
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 3. PHONE (with Verification Badge/Button) */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-0.5">
                            <p className="font-mono text-xs text-slate-700 font-semibold">
                              {customer.phone || '—'}
                            </p>
                            {customer.phone ? (
                              customer.phone_verified ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setVerifyModalCustomer({
                                      customer,
                                      type: 'PHONE',
                                      targetVerified: false,
                                    })
                                  }
                                  className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700 transition cursor-pointer"
                                  title="Click to Unverify"
                                >
                                  <CheckCircle2 className="h-2.5 w-2.5" /> Verified
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setVerifyModalCustomer({
                                      customer,
                                      type: 'PHONE',
                                      targetVerified: true,
                                    })
                                  }
                                  className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-1.5 py-0.2 text-[9px] font-bold text-amber-700 transition cursor-pointer"
                                  title="Click to manually verify phone"
                                >
                                  <Check className="h-2.5 w-2.5" /> Unverified
                                </button>
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

                        {/* 5. JOINED / AGE */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-slate-800">
                              {formatDateTime(customer.created_at)}
                            </p>
                            <p className="text-[11px] font-medium text-slate-400">
                              {formatAccountAge(customer.created_at)}
                            </p>
                          </div>
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

                            {/* Delete Button */}
                            <button
                              onClick={() => setDeleteModalCustomer(customer)}
                              className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 text-xs px-2.5 py-1 rounded-md font-medium transition shadow-xs"
                              title="Delete Customer Account"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
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
      <ConfirmActionModal
        isOpen={Boolean(blockModalCustomer)}
        actionType={blockModalCustomer?.is_blocked ? 'UNBLOCK' : 'BLOCK'}
        title={blockModalCustomer?.is_blocked ? 'Unblock Customer?' : 'Block Customer?'}
        description={
          blockModalCustomer?.is_blocked
            ? 'Are you sure you want to unblock this customer? Their access to log in and make purchases will be restored.'
            : 'Are you sure you want to block this customer? They will immediately lose access to log in and make purchases.'
        }
        confirmLabel={blockModalCustomer?.is_blocked ? 'Yes, Unblock' : 'Yes, Block'}
        customerName={blockModalCustomer?.full_name}
        customerEmail={blockModalCustomer?.email}
        isProcessing={isUpdatingBlock}
        reason={blockReason}
        onReasonChange={setBlockReason}
        showReasonInput={true}
        onConfirm={handleToggleBlock}
        onClose={() => {
          if (!isUpdatingBlock) {
            setBlockModalCustomer(null);
            setBlockReason('');
          }
        }}
      />

      {/* ───── Modal 2: Bulk Action Confirmation Modal ───── */}
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
                    bulkModalAction === 'VERIFY_EMAIL'
                      ? 'bg-blue-100 text-blue-700'
                      : bulkModalAction === 'VERIFY_PHONE'
                      ? 'bg-teal-100 text-teal-700'
                      : bulkModalAction === 'UNBLOCK'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {bulkModalAction === 'VERIFY_EMAIL' ? (
                    <MailCheck className="h-5 w-5" />
                  ) : bulkModalAction === 'VERIFY_PHONE' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : bulkModalAction === 'UNBLOCK' ? (
                    <Unlock className="h-5 w-5" />
                  ) : (
                    <Lock className="h-5 w-5" />
                  )}
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {bulkModalAction === 'VERIFY_EMAIL'
                      ? `Bulk Verify Email (${selectedCustomerIds.size} Customers)`
                      : bulkModalAction === 'VERIFY_PHONE'
                      ? `Bulk Verify Phone (${selectedCustomerIds.size} Customers)`
                      : bulkModalAction === 'UNBLOCK'
                      ? `Bulk Unblock ${selectedCustomerIds.size} Customers`
                      : `Bulk Block ${selectedCustomerIds.size} Customers`}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    {bulkModalAction === 'VERIFY_EMAIL' || bulkModalAction === 'VERIFY_PHONE'
                      ? 'Manual Contact Verification'
                      : 'Mass Security & Access Update'}
                  </p>
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
                    bulkModalAction === 'VERIFY_EMAIL'
                      ? 'text-blue-700'
                      : bulkModalAction === 'VERIFY_PHONE'
                      ? 'text-teal-700'
                      : bulkModalAction === 'UNBLOCK'
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {bulkModalAction === 'VERIFY_EMAIL'
                    ? 'MARK EMAIL AS VERIFIED'
                    : bulkModalAction === 'VERIFY_PHONE'
                    ? 'MARK PHONE AS VERIFIED'
                    : bulkModalAction === 'UNBLOCK'
                    ? 'SET TO ACTIVE (UNBLOCKED)'
                    : 'SET TO BLOCKED (SUSPENDED)'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {bulkModalAction === 'VERIFY_EMAIL'
                ? `Are you sure you want to mark Email as verified for all ${selectedCustomerIds.size} selected customers?`
                : bulkModalAction === 'VERIFY_PHONE'
                ? `Are you sure you want to mark Phone as verified for all ${selectedCustomerIds.size} selected customers?`
                : bulkModalAction === 'UNBLOCK'
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
                  bulkModalAction === 'VERIFY_EMAIL'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : bulkModalAction === 'VERIFY_PHONE'
                    ? 'bg-teal-600 hover:bg-teal-700'
                    : bulkModalAction === 'UNBLOCK'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isUpdatingBulk ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Updating…
                  </>
                ) : bulkModalAction === 'VERIFY_EMAIL' ? (
                  <>
                    <MailCheck className="h-3.5 w-3.5" />
                    Confirm Email Verification
                  </>
                ) : bulkModalAction === 'VERIFY_PHONE' ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirm Phone Verification
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
      <ConfirmActionModal
        isOpen={Boolean(resetModalCustomer)}
        actionType="RESET_PASSWORD"
        title="Send Password Reset Link?"
        description={`Are you sure you want to send a password reset link to ${resetModalCustomer?.email || 'this customer'}?`}
        confirmLabel="Yes, Send Link"
        customerName={resetModalCustomer?.full_name}
        customerEmail={resetModalCustomer?.email}
        isProcessing={isSendingReset}
        onConfirm={handleSendPasswordReset}
        onClose={() => !isSendingReset && setResetModalCustomer(null)}
      />

      {/* ───── Modal 4: Delete Customer Confirmation Modal ───── */}
      <ConfirmActionModal
        isOpen={Boolean(deleteModalCustomer)}
        actionType="DELETE"
        title="Delete Customer Account?"
        description="Are you sure you want to delete this customer? This action cannot be undone and will permanently remove their access."
        confirmLabel="Yes, Delete"
        customerName={deleteModalCustomer?.full_name}
        customerEmail={deleteModalCustomer?.email}
        isProcessing={isDeletingCustomer}
        onConfirm={handleDeleteCustomer}
        onClose={() => !isDeletingCustomer && setDeleteModalCustomer(null)}
      />

      {/* ───── Modal 5: Single Contact Verification Confirmation Modal ───── */}
      {verifyModalCustomer && (
        <ConfirmActionModal
          isOpen={Boolean(verifyModalCustomer)}
          actionType={
            verifyModalCustomer.targetVerified
              ? verifyModalCustomer.type === 'EMAIL'
                ? 'VERIFY_EMAIL'
                : 'VERIFY_PHONE'
              : verifyModalCustomer.type === 'EMAIL'
              ? 'UNVERIFY_EMAIL'
              : 'UNVERIFY_PHONE'
          }
          title={
            verifyModalCustomer.targetVerified
              ? verifyModalCustomer.type === 'EMAIL'
                ? 'Verify Customer Email?'
                : 'Verify Customer Phone?'
              : verifyModalCustomer.type === 'EMAIL'
              ? 'Unverify Customer Email?'
              : 'Unverify Customer Phone?'
          }
          description={
            verifyModalCustomer.targetVerified
              ? verifyModalCustomer.type === 'EMAIL'
                ? `Are you sure you want to mark ${verifyModalCustomer.customer.email || 'this email'} as verified for ${verifyModalCustomer.customer.full_name}?`
                : `Are you sure you want to mark phone ${verifyModalCustomer.customer.phone || ''} as verified for ${verifyModalCustomer.customer.full_name}?`
              : `Are you sure you want to mark ${
                  verifyModalCustomer.type === 'EMAIL'
                    ? verifyModalCustomer.customer.email || 'email'
                    : verifyModalCustomer.customer.phone || 'phone'
                } as unverified for ${verifyModalCustomer.customer.full_name}?`
          }
          confirmLabel={
            verifyModalCustomer.targetVerified
              ? verifyModalCustomer.type === 'EMAIL'
                ? 'Yes, Verify Email'
                : 'Yes, Verify Phone'
              : 'Yes, Unverify'
          }
          customerName={verifyModalCustomer.customer.full_name}
          customerEmail={verifyModalCustomer.customer.email}
          isProcessing={isVerifyingSingle}
          onConfirm={handleConfirmSingleVerify}
          onClose={() => !isVerifyingSingle && setVerifyModalCustomer(null)}
        />
      )}
    </div>
  );
}
