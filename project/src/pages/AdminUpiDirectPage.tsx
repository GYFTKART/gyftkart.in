import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { AdminTopBar, AdminNavTabs } from '@/components/AdminHeader';
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
        <AdminNavTabs activeTab="payments" />

        <div className="mt-6">
          <AdminPaymentsTab />
        </div>
      </div>
    </div>
  );
}
