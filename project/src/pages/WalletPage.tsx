import { Wallet } from 'lucide-react';
import WalletLedgerPanel from '@/components/WalletLedgerPanel';
import Reveal from '@/components/Reveal';

export default function WalletPage() {
  return (
    <div className="pt-16 min-h-screen bg-gradient-to-b from-brand-50/40 to-white">
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white border-b border-slate-100">
        <div className="absolute inset-0 bg-grid opacity-50 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
              <Wallet className="h-3.5 w-3.5" /> GyftKart Wallet
            </span>
            <h1 className="mt-3 font-display text-4xl sm:text-5xl font-extrabold text-slate-900">
              Your Wallet
            </h1>
            <p className="mt-2 text-slate-600 max-w-xl">
              Check your spendable balance, add money via UPI and track every top-up and transaction.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <WalletLedgerPanel />
      </div>
    </div>
  );
}
