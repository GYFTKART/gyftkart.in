import { Link } from 'react-router-dom';
import WalletLedgerPanel from '@/components/WalletLedgerPanel';

export default function WalletPage() {
  return (
    <div className="pt-16 min-h-screen bg-gradient-to-b from-brand-50/40 to-white">
      {/* Breadcrumb (BrandsPage pattern) — replaces the old hero header */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Wallet</span>
        </nav>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        <WalletLedgerPanel />
      </div>
    </div>
  );
}
