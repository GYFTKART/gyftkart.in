import { Link } from 'react-router-dom';
import { ArrowLeft, Gift, CheckCircle2, Clock, Mail } from 'lucide-react';

interface Order {
  id: string;
  brand: string;
  amount: string;
  status: 'Delivered' | 'Processing';
  deliveryNote: string;
  date: string;
}

const mockOrders: Order[] = [
  {
    id: 'GK-9831',
    brand: 'Amazon Gift Card',
    amount: '₹1,000',
    status: 'Delivered',
    deliveryNote: 'Delivered via Email to recipient',
    date: '18 Jul 2026',
  },
  {
    id: 'GK-9742',
    brand: 'Flipkart Gift Card',
    amount: '₹500',
    status: 'Processing',
    deliveryNote: 'Preparing for delivery',
    date: '22 Jul 2026',
  },
];

function StatusBadge({ status }: { status: Order['status'] }) {
  if (status === 'Delivered') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Delivered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
      <Clock className="h-3.5 w-3.5" />
      Processing
    </span>
  );
}

export default function OrdersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50/40 via-white to-white pt-28 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
              My Orders
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Track and review your recent gift card purchases.
            </p>
          </div>
          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white shadow-card overflow-hidden">
          {mockOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <span className="grid place-items-center h-14 w-14 rounded-2xl bg-brand-50 text-brand-600 mb-4">
                <Gift className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-slate-700">No orders yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Your gift card purchases will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {mockOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 sm:p-6 hover:bg-slate-50/60 transition-colors"
                >
                  <span className="grid place-items-center h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-sm">
                    <Gift className="h-5 w-5" />
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-slate-900">{order.brand}</p>
                      <span className="text-xs text-slate-400">•</span>
                      <p className="text-xs font-medium text-slate-500">Order #{order.id}</p>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <Mail className="h-3.5 w-3.5" />
                      {order.deliveryNote}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{order.date}</p>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 sm:gap-2 shrink-0">
                    <p className="text-base font-extrabold text-slate-900">{order.amount}</p>
                    <StatusBadge status={order.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 flex justify-center sm:hidden">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
