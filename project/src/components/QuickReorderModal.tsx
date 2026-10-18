import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  RotateCcw,
  Plus,
  Minus,
  ShoppingCart,
  ArrowRight,
} from 'lucide-react';
import { inr } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/components/Toast';

export interface ReorderItemInput {
  brand_slug?: string;
  brand_name?: string;
  brand_color?: string;
  brand_color2?: string;
  category?: string;
  amount?: number | string;
  denomination?: number | string;
  quantity?: number;
  recipient_name?: string;
  recipient_email?: string;
  recipient_phone?: string;
  message?: string;
  occasion?: string;
}

interface QuickReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderRef: string;
  rawItems: unknown;
  fallbackAmount?: number;
}

interface NormalizedItem {
  id: string;
  brand_slug: string;
  brand_name: string;
  brand_color: string;
  brand_color2: string;
  category: string;
  amount: number;
  quantity: number;
  recipient_name: string;
  recipient_email: string;
  recipient_phone: string;
  message: string;
  occasion: string;
}

export function QuickReorderModal({
  isOpen,
  onClose,
  orderRef,
  rawItems,
  fallbackAmount = 500,
}: QuickReorderModalProps) {
  const { add, open } = useCart();
  const { push } = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<NormalizedItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parse and normalize raw order items whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    const list: NormalizedItem[] = [];
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      rawItems.forEach((it, idx) => {
        if (!it || typeof it !== 'object') return;
        const row = it as ReorderItemInput;
        const name = String(row.brand_name || 'Gift Card').trim();
        const slug =
          String(row.brand_slug || '') ||
          name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const amount = Number(row.amount ?? row.denomination ?? fallbackAmount) || fallbackAmount;
        const quantity = Math.max(1, Number(row.quantity ?? 1));

        list.push({
          id: `item-${idx}-${Date.now()}`,
          brand_slug: slug,
          brand_name: name,
          brand_color: String(row.brand_color || '#991b1b'),
          brand_color2: String(row.brand_color2 || '#7f1d1d'),
          category: String(row.category || 'Shopping'),
          amount,
          quantity,
          recipient_name: String(row.recipient_name || ''),
          recipient_email: String(row.recipient_email || ''),
          recipient_phone: String(row.recipient_phone || ''),
          message: String(row.message || ''),
          occasion: String(row.occasion || 'General'),
        });
      });
    }

    if (list.length === 0) {
      list.push({
        id: `item-fallback-${Date.now()}`,
        brand_slug: 'gyftkart-voucher',
        brand_name: 'GyftKart Voucher',
        brand_color: '#991b1b',
        brand_color2: '#7f1d1d',
        category: 'Shopping',
        amount: fallbackAmount,
        quantity: 1,
        recipient_name: '',
        recipient_email: '',
        recipient_phone: '',
        message: '',
        occasion: 'General',
      });
    }

    setItems(list);
  }, [isOpen, rawItems, fallbackAmount]);

  if (!isOpen) return null;

  const handleUpdateQty = (idx: number, delta: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      })
    );
  };

  const handleRemoveItem = (idx: number) => {
    if (items.length <= 1) {
      push('You must have at least one item to reorder', 'info');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalAmount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const executeAddAll = () => {
    items.forEach((item) => {
      add({
        brand_slug: item.brand_slug,
        brand_name: item.brand_name,
        brand_color: item.brand_color,
        brand_color2: item.brand_color2,
        category: item.category,
        amount: item.amount,
        quantity: item.quantity,
        recipient_name: item.recipient_name,
        recipient_email: item.recipient_email,
        recipient_phone: item.recipient_phone,
        message: item.message,
        occasion: item.occasion,
      });
    });
  };

  const handleAddToCart = () => {
    setIsSubmitting(true);
    executeAddAll();
    push(`Added ${totalItemCount} item${totalItemCount > 1 ? 's' : ''} to your cart`, 'success');
    onClose();
    open();
    setIsSubmitting(false);
  };

  const handleReorderAndCheckout = () => {
    setIsSubmitting(true);
    executeAddAll();
    push(`Re-order items loaded into checkout`, 'success');
    onClose();
    navigate('/checkout');
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm p-4 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 -z-10" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-100 text-brand-700">
              <RotateCcw className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Quick Re-order</h2>
              <p className="text-[11px] text-slate-500 font-mono">From Order #{orderRef}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Item List */}
        <div className="p-6 max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
          <p className="text-xs text-slate-500 mb-3">
            Review and adjust quantities for your previous gift card order:
          </p>

          {items.map((item, idx) => (
            <div key={item.id} className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="grid place-items-center h-10 w-10 shrink-0 rounded-xl text-white font-black text-sm uppercase shadow-xs"
                  style={{ backgroundColor: item.brand_color }}
                >
                  {item.brand_name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{item.brand_name}</p>
                  <p className="text-[11px] text-slate-500">{inr(item.amount)} each</p>
                </div>
              </div>

              {/* Quantity Stepper & Line Total */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                  <button
                    type="button"
                    onClick={() => handleUpdateQty(idx, -1)}
                    disabled={item.quantity <= 1}
                    className="p-1.5 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Decrease quantity"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-8 text-center text-xs font-bold text-slate-800">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateQty(idx, 1)}
                    className="p-1.5 hover:bg-slate-200 text-slate-600 transition"
                    title="Increase quantity"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                <div className="w-20 text-right">
                  <p className="text-xs font-extrabold text-slate-900">
                    {inr(item.amount * item.quantity)}
                  </p>
                </div>

                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="text-slate-400 hover:text-rose-600 p-1 transition"
                    title="Remove item"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary Footer */}
        <div className="bg-slate-50/90 border-t border-slate-100 p-6 space-y-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Total Items: {totalItemCount}</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-slate-500">Total Amount:</span>
              <span className="text-base font-black text-slate-900">{inr(totalAmount)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:border-brand-500 hover:text-brand-700 transition"
            >
              <ShoppingCart className="h-4 w-4 text-brand-600" />
              Add to Cart
            </button>
            <button
              type="button"
              onClick={handleReorderAndCheckout}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:from-brand-700 hover:to-brand-800 transition"
            >
              Checkout Now
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
