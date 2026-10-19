import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  HelpCircle,
  Mail,
  Phone,
  Clock,
  Building2,
  ChevronRight,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { AdminTopBar, AdminBackButton } from '@/components/AdminHeader';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';

interface GeneralInquiry {
  id: string;
  source: 'Support' | 'Corporate' | 'General';
  sender_name: string;
  sender_email: string;
  sender_phone?: string;
  subject: string;
  message: string;
  status: 'new' | 'in_progress' | 'resolved';
  created_at: string;
}

export default function AdminGeneralInquiriesPage() {
  const { admin } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'in_progress' | 'resolved'>('all');
  const [inquiries, setInquiries] = useState<GeneralInquiry[]>([]);

  const fetchInquiries = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Query corporate inquiries as primary inquiries table and adapt
      const { data, error } = await supabase
        .from('corporate_inquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const adapted: GeneralInquiry[] = (data || []).map((item) => ({
        id: item.id,
        source: 'Corporate',
        sender_name: item.contact_name || item.company_name || 'Anonymous User',
        sender_email: item.email || 'no-email@gyftkart.in',
        sender_phone: item.phone,
        subject: item.company_name ? `Corporate Inquiry: ${item.company_name}` : 'General Order Inquiry',
        message: item.custom_requirements || `Estimated Budget: ₹${Number(item.budget || 0).toLocaleString('en-IN')}`,
        status: (item.status === 'contacted' ? 'in_progress' : item.status === 'closed' ? 'resolved' : 'new') as GeneralInquiry['status'],
        created_at: item.created_at,
      }));

      setInquiries(adapted);
      if (isRefresh) push('Enquiries refreshed successfully', 'success');
    } catch (err) {
      console.error('Failed to fetch inquiries:', err);
      push('Failed to load inquiries', 'error');
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
    fetchInquiries();
  }, [admin, navigate, fetchInquiries]);

  const updateStatus = async (id: string, newStatus: 'new' | 'in_progress' | 'resolved') => {
    try {
      const dbStatus = newStatus === 'in_progress' ? 'contacted' : newStatus === 'resolved' ? 'closed' : 'new';
      const { error } = await supabase
        .from('corporate_inquiries')
        .update({ status: dbStatus })
        .eq('id', id);

      if (error) throw error;

      setInquiries((prev) =>
        prev.map((inq) => (inq.id === id ? { ...inq, status: newStatus } : inq))
      );
      push(`Inquiry status updated to ${newStatus}`, 'success');
    } catch (err) {
      console.error('Update status error:', err);
      push('Failed to update status', 'error');
    }
  };

  const filteredInquiries = inquiries.filter((inq) => {
    const matchesSearch =
      inq.sender_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inq.sender_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inq.sender_phone && inq.sender_phone.includes(searchQuery)) ||
      inq.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inq.message.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || inq.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const counts = {
    total: inquiries.length,
    new: inquiries.filter((i) => i.status === 'new').length,
    in_progress: inquiries.filter((i) => i.status === 'in_progress').length,
    resolved: inquiries.filter((i) => i.status === 'resolved').length,
  };

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />

      <main className="mx-auto max-w-7xl 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
            <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
              Admin
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 font-semibold">General Enquiries</span>
          </nav>
          <div className="flex items-center gap-3">
            <AdminBackButton />
          </div>
        </div>

        {/* Page Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="grid place-items-center h-8 w-8 rounded-lg bg-amber-500 text-white shadow-xs">
              <HelpCircle className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-display text-base font-bold text-slate-900">
                General Enquiries &amp; Customer Support
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Support tickets, customer communications, helpdesk requests, and corporate inquiry sync.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/admin/corporate-inquiries"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
            >
              <Building2 className="h-3.5 w-3.5 text-amber-600" /> Corporate Leads Portal
            </Link>
            <button
              onClick={() => void fetchInquiries(true)}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 shadow-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-brand-600' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Support Channel Information Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="grid place-items-center h-9 w-9 rounded-xl bg-brand-50 text-brand-600">
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Support Hotline</p>
                <p className="text-base font-extrabold text-slate-900">09695393786</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-3 border-t border-slate-100">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>Available all days 10:00 AM - 6:00 PM</span>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="grid place-items-center h-9 w-9 rounded-xl bg-purple-50 text-purple-600">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Helpdesk Inboxes</p>
                <p className="text-sm font-extrabold text-slate-900">support@gyftkart.in</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 pt-3 border-t border-slate-100">
              Corporate Desk: <a href="mailto:corporate@gyftkart.in" className="text-brand-600 font-medium hover:underline">corporate@gyftkart.in</a>
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="grid place-items-center h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ticket Resolution</p>
                <p className="text-base font-extrabold text-emerald-700">
                  {counts.resolved} of {counts.total} Resolved
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
              <span>{counts.new} New Tickets</span>
              <span>{counts.in_progress} In Progress</span>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, phone, or keyword..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {(['all', 'new', 'in_progress', 'resolved'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors ${
                  statusFilter === status
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {status.replace('_', ' ')} ({status === 'all' ? counts.total : counts[status]})
              </button>
            ))}
          </div>
        </div>

        {/* Inquiries Table / Cards */}
        <div className="rounded-3xl border border-slate-200/80 bg-white shadow-card overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-brand-600" />
              <span>Loading customer inquiries...</span>
            </div>
          ) : filteredInquiries.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-grid place-items-center h-12 w-12 rounded-2xl bg-slate-100 text-slate-400 mb-3">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="font-display text-sm font-bold text-slate-800">No Enquiries Found</h3>
              <p className="text-xs text-slate-400 mt-1">
                {searchQuery || statusFilter !== 'all'
                  ? 'No enquiries match the current filters.'
                  : 'Customer inquiries submitted via the helpdesk will appear here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="px-5 py-3.5">Customer / Contact</th>
                    <th className="px-5 py-3.5">Subject &amp; Requirements</th>
                    <th className="px-5 py-3.5">Submitted On</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInquiries.map((inq) => (
                    <tr key={inq.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-900">{inq.sender_name}</p>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">{inq.sender_email}</p>
                        {inq.sender_phone && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{inq.sender_phone}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 max-w-sm">
                        <p className="font-semibold text-slate-800">{inq.subject}</p>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {inq.message}
                        </p>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-slate-500 font-medium">
                        {new Date(inq.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {inq.status === 'resolved' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> Resolved
                          </span>
                        ) : inq.status === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Clock className="h-3 w-3" /> In Progress
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertCircle className="h-3 w-3" /> New
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {inq.status !== 'in_progress' && (
                            <button
                              onClick={() => updateStatus(inq.id, 'in_progress')}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
                            >
                              In Progress
                            </button>
                          )}
                          {inq.status !== 'resolved' && (
                            <button
                              onClick={() => updateStatus(inq.id, 'resolved')}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
                            >
                              Mark Resolved
                            </button>
                          )}
                          <a
                            href={`mailto:${inq.sender_email}?subject=RE: ${encodeURIComponent(inq.subject)}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 transition"
                          >
                            <Mail className="h-3 w-3" /> Reply
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
