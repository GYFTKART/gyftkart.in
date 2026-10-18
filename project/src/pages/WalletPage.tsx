import { Link } from 'react-router-dom';
import WalletLedgerPanel from '@/components/WalletLedgerPanel';

export default function WalletPage() {
  return (
    <div className="pt-16 min-h-screen bg-gradient-to-b from-brand-50/40 to-white">
      {/* Breadcrumb */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/" className="text-gray-400 hover:text-brand-700 transition-colors">
            Home
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">Wallet</span>
        </nav>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        <WalletLedgerPanel />
      </div>
    </div>
  );
}
