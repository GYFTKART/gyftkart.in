import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { AdminTopBar, AdminBackButton } from '@/components/AdminHeader';
import AdminPaymentsTab from '@/components/AdminPaymentsTab';

export default function AdminUpiDirectPage() {
  const { admin } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!admin) {
      navigate('/admin', { replace: true });
    }
  }, [admin, navigate]);

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb / Back Navigation */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
            <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
              Admin
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 font-semibold">UPI Direct</span>
          </nav>
          <div className="flex items-center gap-3">
            <AdminBackButton />
          </div>
        </div>

        <div>
          <AdminPaymentsTab />
        </div>
      </div>
    </div>
  );
}
