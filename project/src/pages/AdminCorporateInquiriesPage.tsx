import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  Search,
  X,
  FileSpreadsheet,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Mail,
  Phone,
  Users,
  IndianRupee,
  Calendar,
  Sparkles,
  CheckCircle2,
  Clock,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';
import { AdminTopBar, AdminBackButton } from '@/components/AdminHeader';
import { formatDateTime } from '@/lib/format';

export type Inquiry = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  employee_count: string;
  budget: string;
  occasions: string;
  message: string;
  status: string;
  created_at: string;
};

export default function AdminCorporateInquiriesPage() {
  const { admin } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'contacted' | 'closed'>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Selected modal inquiry
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadInquiries = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('corporate_inquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInquiries((data ?? []) as Inquiry[]);
      if (isRefresh) push('Inquiries refreshed', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to load corporate inquiries', 'error');
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
    loadInquiries();
  }, [admin, navigate, loadInquiries]);

  // Update inquiry status
  const updateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('corporate_inquiries')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setInquiries((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i))
      );
      if (selectedInquiry && selectedInquiry.id === id) {
        setSelectedInquiry((prev) => (prev ? { ...prev, status: newStatus } : null));
      }

      push(`Inquiry marked as ${newStatus}`, 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // Filtered inquiries
  const filteredInquiries = useMemo(() => {
    let result = inquiries;

    if (statusFilter !== 'all') {
      result = result.filter((i) => (i.status || '').toLowerCase() === statusFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.company_name.toLowerCase().includes(q) ||
          i.contact_name.toLowerCase().includes(q) ||
          i.email.toLowerCase().includes(q) ||
          i.phone.toLowerCase().includes(q) ||
          (i.occasions && i.occasions.toLowerCase().includes(q)) ||
          (i.message && i.message.toLowerCase().includes(q))
      );
    }

    return result;
  }, [inquiries, statusFilter, search]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredInquiries.length / pageSize));
  const paginatedInquiries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInquiries.slice(start, start + pageSize);
  }, [filteredInquiries, currentPage, pageSize]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = inquiries.length;
    const newCount = inquiries.filter((i) => (i.status || '').toLowerCase() === 'new').length;
    const contactedCount = inquiries.filter((i) => (i.status || '').toLowerCase() === 'contacted').length;
    const closedCount = inquiries.filter((i) => (i.status || '').toLowerCase() === 'closed').length;
    return { total, newCount, contactedCount, closedCount };
  }, [inquiries]);

  // Export CSV
  const handleExportCsv = () => {
    if (filteredInquiries.length === 0) {
      push('No inquiry data to export', 'error');
      return;
    }

    const headers = [
      'S.No.',
      'Company Name',
      'Contact Person',
      'Email',
      'Phone',
      'Employee Count',
      'Estimated Budget',
      'Occasions',
      'Message',
      'Status',
      'Created At',
    ];

    const rows = filteredInquiries.map((i, idx) => [
      String(idx + 1),
      `"${(i.company_name || '').replace(/"/g, '""')}"`,
      `"${(i.contact_name || '').replace(/"/g, '""')}"`,
      i.email,
      i.phone,
      `"${(i.employee_count || '').replace(/"/g, '""')}"`,
      `"${(i.budget || '').replace(/"/g, '""')}"`,
      `"${(i.occasions || '').replace(/"/g, '""')}"`,
      `"${(i.message || '').replace(/"/g, '""')}"`,
      i.status,
      i.created_at,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GyftKart-Corporate-Inquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    push(`Exported ${filteredInquiries.length} inquiries to CSV`, 'success');
  };

  const statusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'new') return 'bg-gold-100 text-gold-800 border-gold-200';
    if (s === 'contacted') return 'bg-brand-100 text-brand-800 border-brand-200';
    if (s === 'closed') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
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
            <span className="text-slate-900 font-semibold">Corporate Inquiries</span>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadInquiries(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-brand-600 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <AdminBackButton />
          </div>
        </div>

        {/* Page Title & Overview */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-brand-50 text-brand-700 border border-brand-100 shadow-sm">
                <Building2 className="h-5 w-5" />
              </span>
              Corporate Inquiries
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Dedicated management table for B2B corporate gifting leads, employee rewards, and bulk orders.
            </p>
          </div>

          <button
            onClick={handleExportCsv}
            disabled={filteredInquiries.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Export CSV ({filteredInquiries.length})
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Inquiries</span>
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-slate-100 text-slate-700">
                <Building2 className="h-4 w-4" />
              </span>
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-2">{metrics.total}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">All time corporate lead submissions</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">New Leads</span>
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-gold-50 text-gold-700">
                <Clock className="h-4 w-4" />
              </span>
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-2">{metrics.newCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Awaiting initial response / follow-up</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">In Contact</span>
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-50 text-brand-700">
                <Users className="h-4 w-4" />
              </span>
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-2">{metrics.contactedCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Active negotiation or proposal sent</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Closed / Won</span>
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            <p className="font-display text-2xl font-extrabold text-slate-900 mt-2">{metrics.closedCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Completed orders or resolved inquiries</p>
          </div>
        </div>

        {/* Search & Status Filter Toolbar */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft mb-6 space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Status Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                { id: 'all' as const, label: `All (${inquiries.length})` },
                { id: 'new' as const, label: `New (${metrics.newCount})` },
                { id: 'contacted' as const, label: `Contacted (${metrics.contactedCount})` },
                { id: 'closed' as const, label: `Closed (${metrics.closedCount})` },
              ]).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    statusFilter === f.id
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company, contact, email, phone…"
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
          </div>
        </div>

        {/* Dedicated Corporate Inquiries Table */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-soft overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl shimmer" />
              ))}
            </div>
          ) : filteredInquiries.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 className="mx-auto h-10 w-10 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">No corporate inquiries found</p>
              <p className="text-xs text-slate-400 mt-1">Try switching the status filter or clearing your search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4 w-14 text-center">S. No.</th>
                    <th className="py-3.5 px-4">Company & Occasion</th>
                    <th className="py-3.5 px-4">Contact Person</th>
                    <th className="py-3.5 px-4">Direct Contact</th>
                    <th className="py-3.5 px-4">Size & Budget</th>
                    <th className="py-3.5 px-4">Message Preview</th>
                    <th className="py-3.5 px-4">Submitted Date</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-center">Follow-up Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedInquiries.map((inq, idx) => {
                    const displayIndex = filteredInquiries.length - ((currentPage - 1) * pageSize + idx);
                    const isUpdating = updatingId === inq.id;

                    return (
                      <tr key={inq.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400 text-center font-bold">
                          #{displayIndex}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <p className="font-extrabold text-slate-900 text-sm">{inq.company_name}</p>
                          {inq.occasions && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {inq.occasions.split(',').slice(0, 2).map((occ) => (
                                <span
                                  key={occ}
                                  className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700"
                                >
                                  {occ.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-bold text-slate-800">{inq.contact_name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          <a
                            href={`mailto:${inq.email}?subject=Re: Corporate Gifting Inquiry - ${inq.company_name}`}
                            className="block font-medium text-brand-700 hover:underline text-xs"
                          >
                            {inq.email}
                          </a>
                          {inq.phone && (
                            <a
                              href={`tel:${inq.phone}`}
                              className="block text-[11px] text-slate-400 hover:text-slate-600 mt-0.5"
                            >
                              {inq.phone}
                            </a>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            <Users className="h-3 w-3 text-slate-400" /> {inq.employee_count || '—'} staff
                          </span>
                          <span className="block text-[11px] font-bold text-slate-900 mt-1">
                            {inq.budget ? `Budget: ${inq.budget}` : '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-[220px]">
                          <p className="text-slate-600 truncate italic">
                            {inq.message ? `"${inq.message}"` : '—'}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                          {formatDateTime(inq.created_at)}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold capitalize ${statusBadge(inq.status)}`}>
                            {inq.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedInquiry(inq)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50 hover:border-brand-300 transition shadow-xs"
                              title="View full lead details"
                            >
                              <Eye className="h-3 w-3" /> View
                            </button>

                            {inq.status !== 'contacted' && (
                              <button
                                onClick={() => updateStatus(inq.id, 'contacted')}
                                disabled={isUpdating}
                                className="rounded-lg bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-800 px-2 py-1 text-[10px] font-bold transition disabled:opacity-50"
                                title="Mark inquiry contacted"
                              >
                                Contacted
                              </button>
                            )}

                            {inq.status !== 'closed' ? (
                              <button
                                onClick={() => updateStatus(inq.id, 'closed')}
                                disabled={isUpdating}
                                className="rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 px-2 py-1 text-[10px] font-bold transition disabled:opacity-50"
                                title="Mark inquiry closed"
                              >
                                Close
                              </button>
                            ) : (
                              <button
                                onClick={() => updateStatus(inq.id, 'new')}
                                disabled={isUpdating}
                                className="rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 px-2 py-1 text-[10px] font-bold transition disabled:opacity-50"
                                title="Reopen lead"
                              >
                                <RotateCcw className="h-3 w-3 inline mr-0.5" /> Reopen
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {!loading && filteredInquiries.length > 0 && (
            <div className="border-t border-slate-100 p-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, filteredInquiries.length)} of {filteredInquiries.length} inquiries
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

      {/* Inquiry Detail Modal */}
      {selectedInquiry && (
        <InquiryModal
          inquiry={selectedInquiry}
          onClose={() => setSelectedInquiry(null)}
          onUpdate={updateStatus}
          updating={updatingId === selectedInquiry.id}
          statusBadge={statusBadge}
        />
      )}
    </div>
  );
}

function InquiryModal({
  inquiry,
  onClose,
  onUpdate,
  updating,
  statusBadge,
}: {
  inquiry: Inquiry;
  onClose: () => void;
  onUpdate: (id: string, status: string) => void;
  updating: boolean;
  statusBadge: (s: string) => string;
}) {
  return (
    <div className="fixed inset-0 z-[150] grid place-items-center p-4">
      <div className="absolute inset-0 bg-brand-950/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-glow animate-scale-in max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-sm">
              <Building2 className="h-6 w-6" />
            </span>
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900">{inquiry.company_name}</h3>
              <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold capitalize mt-1 ${statusBadge(inquiry.status)}`}>
                {inquiry.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center h-9 w-9 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Contact Person
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{inquiry.contact_name}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email
              </p>
              <a href={`mailto:${inquiry.email}`} className="mt-1 text-sm font-semibold text-brand-700 hover:underline block break-all">
                {inquiry.email}
              </a>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Phone
              </p>
              <a href={`tel:${inquiry.phone}`} className="mt-1 text-sm font-semibold text-slate-800 hover:text-brand-700 block">
                {inquiry.phone || '—'}
              </a>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Employee Count
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{inquiry.employee_count || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <IndianRupee className="h-3.5 w-3.5" /> Estimated Budget
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{inquiry.budget || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Submitted On
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{formatDateTime(inquiry.created_at)}</p>
            </div>
          </div>

          {inquiry.occasions && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-brand-600" /> Occasions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {inquiry.occasions.split(',').map((o) => (
                  <span key={o} className="rounded-full bg-brand-50 border border-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
                    {o.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {inquiry.message && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Inquiry Message</p>
              <p className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-700 leading-relaxed italic whitespace-pre-wrap">
                "{inquiry.message}"
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <a
            href={`mailto:${inquiry.email}?subject=Re: Corporate gifting inquiry - ${inquiry.company_name}`}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-700 transition shadow-sm"
          >
            <Mail className="h-4 w-4" /> Reply by email
          </a>

          <div className="flex items-center gap-2">
            {inquiry.status !== 'contacted' && (
              <button
                onClick={() => onUpdate(inquiry.id, 'contacted')}
                disabled={updating}
                className="rounded-full bg-brand-50 border border-brand-200 px-3.5 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100 transition disabled:opacity-40"
              >
                <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" /> Mark Contacted
              </button>
            )}
            {inquiry.status !== 'closed' ? (
              <button
                onClick={() => onUpdate(inquiry.id, 'closed')}
                disabled={updating}
                className="rounded-full bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-40"
              >
                <Clock className="h-3.5 w-3.5 inline mr-1" /> Close
              </button>
            ) : (
              <button
                onClick={() => onUpdate(inquiry.id, 'new')}
                disabled={updating}
                className="rounded-full bg-slate-100 border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5 inline mr-1" /> Reopen Lead
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
