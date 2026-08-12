import { Link } from 'react-router-dom';
import { Gift, ArrowLeft, Home } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="pt-16 min-h-screen flex items-center justify-center bg-gradient-to-b from-brand-50/40 to-white px-4">
      <div className="text-center max-w-md">
        <span className="grid place-items-center h-24 w-24 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 text-white mx-auto animate-float shadow-glow">
          <Gift className="h-12 w-12" />
        </span>
        <p className="mt-6 font-display text-7xl font-extrabold text-gradient">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-2 text-slate-500">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Home className="h-4 w-4" /> Back home
          </Link>
          <Link
            to="/brands"
            className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Browse brands
          </Link>
        </div>
      </div>
    </div>
  );
}
