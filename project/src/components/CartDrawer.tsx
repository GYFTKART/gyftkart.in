import { Link, useNavigate } from 'react-router-dom';
import { X, ShoppingBag, Trash2, Plus, Minus, ArrowRight, Gift } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { inr } from '@/lib/format';

export default function CartDrawer() {
  const { items, isOpen, close, remove, updateQuantity, subtotal, count } = useCart();
  const navigate = useNavigate();

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[120] bg-brand-950/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={close}
        aria-hidden={!isOpen}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-[130] h-full w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-white">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center h-10 w-10 rounded-2xl bg-brand-600 text-white shadow-glow-sm">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Your Cart</h2>
              <p className="text-xs text-slate-500">{count} item{count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={close}
            className="grid place-items-center h-10 w-10 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="grid place-items-center h-24 w-24 rounded-full bg-brand-50 text-brand-300 animate-float">
              <Gift className="h-10 w-10" />
            </div>
            <div>
              <p className="font-display text-lg font-bold text-slate-800">Your cart is empty</p>
              <p className="text-sm text-slate-500 mt-1">
                Pick a brand and send a beautiful gift card to someone you love.
              </p>
            </div>
            <button
              onClick={() => {
                close();
                navigate('/brands');
              }}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-glow-sm"
            >
              Browse brands <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 no-scrollbar">
            {items.map((item) => (
              <div
                key={item.id}
                className="group rounded-2xl border border-slate-100 bg-white p-3 shadow-soft hover:shadow-card transition-shadow animate-slide-in-right"
              >
                <div className="flex gap-3">
                  <div
                    className="relative h-16 w-16 shrink-0 rounded-xl flex items-center justify-center overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${item.brand_color}, ${item.brand_color2})` }}
                  >
                    <span className="font-display font-extrabold text-white text-sm px-1 text-center leading-tight">
                      {item.brand_name}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{item.brand_name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {item.recipient_name ? `To: ${item.recipient_name}` : 'To be filled'}
                        </p>
                      </div>
                      <button
                        onClick={() => remove(item.id)}
                        className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="inline-flex items-center rounded-full border border-slate-200">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="grid place-items-center h-7 w-7 text-slate-600 hover:text-brand-600 transition-colors"
                          aria-label="Decrease"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-7 text-center text-sm font-semibold text-slate-800">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="grid place-items-center h-7 w-7 text-slate-600 hover:text-brand-600 transition-colors"
                          aria-label="Increase"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="font-bold text-slate-900">{inr(item.amount * item.quantity)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-4 bg-gradient-to-r from-white to-brand-50/60">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-500">Subtotal</span>
              <span className="font-display text-xl font-bold text-slate-900">{inr(subtotal)}</span>
            </div>
            <Link
              to="/checkout"
              onClick={close}
              className="flex items-center justify-center gap-2 w-full rounded-full bg-brand-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-glow-sm group"
            >
              Proceed to checkout
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="text-center text-[11px] text-slate-400 mt-2.5">
              Secure checkout · Demo payment gateway
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
