import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ShoppingBag, ArrowLeft, Gift, ShieldCheck, CreditCard, Loader2, Minus, Plus } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { inr } from '@/lib/format';

export default function CartPage() {
  const { items, remove, updateQuantity, subtotal, count, isLoading } = useCart();
  const navigate = useNavigate();

  // While the cart is still resolving (hard refresh, auth reattach,
  // localStorage/context hydration), `items` is transiently `[]`
  // regardless of what the cart actually contains — it hasn't been
  // read yet, it isn't *really* empty. Previously this fell through to
  // the full cart UI in that window, which is exactly what produced
  // the flash: "Order summary" / "Proceed to Pay" briefly rendered
  // with 0 items, then snapped to the empty-cart screen the instant
  // isLoading cleared. Checking isLoading first, on its own, means we
  // never render a conclusion (empty OR full) about cart contents
  // until we actually know it — a lightweight skeleton fills this gap
  // instead, and it's the same gap on every load so there's nothing
  // to visibly jump between.
  if (isLoading) {
    return (
      <div className="pt-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20 text-center">
          <Loader2 className="h-8 w-8 mx-auto animate-spin text-brand-600" />
        </div>
      </div>
    );
  }

  // Loading has finished, so `items.length === 0` here is a true
  // statement about the cart, not a hydration artifact — safe to show
  // the empty-cart screen.
  if (items.length === 0) {
    return (
      <div className="pt-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20 text-center">
          <span className="grid place-items-center h-20 w-20 rounded-3xl bg-brand-100 text-brand-600 mx-auto">
            <ShoppingBag className="h-10 w-10" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold text-slate-900">Your cart is empty</h1>
          <p className="mt-2 text-slate-500">
            Looks like you haven't added any gift cards yet. Explore brands to get started.
          </p>
          <Link
            to="/brands"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Browse gift cards
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
        {/* breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Cart</span>
        </nav>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* ===== LEFT: Items table ===== */}
          <div className="lg:col-span-2 rounded-[28px] border border-slate-100 bg-white shadow-card overflow-hidden">
            {/* table header - desktop only */}
            <div className="hidden sm:grid grid-cols-[1fr_110px_116px_44px] gap-4 px-6 py-4 bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              <span>Gift card</span>
              <span>Value</span>
              <span>Qty</span>
              <span />
            </div>

            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_110px_116px_44px] gap-3 sm:gap-4 items-center px-6 py-5"
                >
                  {/* Brand / voucher chip */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="grid place-items-center h-11 w-11 shrink-0 rounded-2xl text-white shadow-sm"
                      style={{
                        background: `linear-gradient(135deg, ${item.brand_color ?? '#6366F1'}, ${
                          item.brand_color2 ?? '#4338CA'
                        })`,
                      }}
                    >
                      <Gift className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-sm font-bold text-slate-900 truncate">
                        {item.brand_name}
                      </p>
                    </div>
                  </div>

                  {/* Value */}
                  <div className="flex sm:block items-center justify-between">
                    <span className="sm:hidden text-xs font-semibold text-slate-400">Value</span>
                    <span className="font-display text-sm font-bold text-slate-800">{inr(item.amount)}</span>
                  </div>

                  {/* Quantity selector */}
                  <div className="flex sm:block items-center justify-between">
                    <span className="sm:hidden text-xs font-semibold text-slate-400">Qty</span>
                    <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        aria-label={`Decrease quantity of ${item.brand_name}`}
                        className="grid place-items-center h-7 w-7 rounded-full bg-white text-slate-600 shadow-sm hover:text-brand-700 disabled:opacity-40 disabled:hover:text-slate-600 disabled:cursor-not-allowed transition-colors"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[1.75rem] text-center text-sm font-bold text-slate-700">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        aria-label={`Increase quantity of ${item.brand_name}`}
                        className="grid place-items-center h-7 w-7 rounded-full bg-white text-slate-600 shadow-sm hover:text-brand-700 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Delete */}
                  <div className="flex justify-end sm:justify-center">
                    <button
                      onClick={() => remove(item.id)}
                      aria-label={`Remove ${item.brand_name} gift card`}
                      className="grid place-items-center h-9 w-9 rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* ===== RIGHT: Order summary ===== */}
          <div className="lg:sticky lg:top-24 self-start">
            <div className="rounded-[28px] border border-slate-100 bg-white p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-slate-900">Order summary</h2>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Items ({count})</span>
                  <span className="font-semibold text-slate-700">{inr(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Delivery</span>
                  <span className="font-semibold text-emerald-600">Free</span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-gradient-to-r from-brand-50 to-white border border-brand-100 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Grand total</span>
                  <span className="font-display text-2xl font-extrabold text-slate-900">{inr(subtotal)}</span>
                </div>
              </div>

              <button
                onClick={() => navigate('/checkout')}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-4 text-sm font-bold text-white hover:shadow-glow transition-shadow"
              >
                <CreditCard className="h-4 w-4" />
                Proceed to Pay
              </button>

              <p className="mt-4 flex items-center gap-1.5 justify-center text-[11px] text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Secure checkout · Instant e-gift delivery
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
