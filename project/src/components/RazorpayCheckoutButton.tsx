import { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Minimal typing for the bits of the Razorpay SDK we actually use —
// the full SDK has no official TypeScript types.
interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open: () => void };
  }
}

let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

export interface OrderRow {
  id: string;
  user_id: string;
  total_amount: number;
  status: 'pending' | 'successful' | 'failed';
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  items: unknown[];
  created_at: string;
}

interface RazorpayCheckoutButtonProps {
  /** Total amount in rupees (e.g. 1009 for ₹1,009). */
  amount: number;
  /** Whatever you want stored in orders.items — typically the cart items. */
  items: unknown[];
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  disabled?: boolean;
  onSuccess: (order: OrderRow) => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
  label?: string;
  className?: string;
}

export default function RazorpayCheckoutButton({
  amount,
  items,
  buyerName,
  buyerEmail,
  buyerPhone,
  disabled,
  onSuccess,
  onError,
  onCancel,
  label,
  className,
}: RazorpayCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await loadRazorpayScript();

      // Step 1 — ask our Edge Function (server-side, has the secret key)
      // to create a Razorpay order for this amount.
      const { data: orderData, error: orderError } = await supabase.functions.invoke(
        'create-razorpay-order',
        { body: { amount } }
      );
      if (orderError || !orderData?.id) {
        throw new Error(orderError?.message ?? 'Could not start payment. Please try again.');
      }

      const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string;

      // Step 2 — open the actual Razorpay modal. This is where the person
      // picks UPI / card / netbanking / wallet — Razorpay handles all of
      // that UI for us.
      const razorpay = new window.Razorpay({
        key: keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'GyftKart',
        description: 'Gift card purchase',
        order_id: orderData.id,
        prefill: { name: buyerName, email: buyerEmail, contact: buyerPhone },
        theme: { color: '#7C3AED' },
        handler: async (response) => {
          // Step 3 — never trust this "success" callback by itself.
          // Send it to our Edge Function, which recomputes the
          // signature with the secret key and only then writes the
          // order row as "successful".
          try {
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
              'verify-razorpay-payment',
              {
                body: {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  total_amount: amount,
                  items,
                },
              }
            );
            if (verifyError || !verifyData?.order) {
              throw new Error(verifyError?.message ?? 'Payment verification failed.');
            }
            onSuccess(verifyData.order as OrderRow);
          } catch (err) {
            onError?.(err instanceof Error ? err.message : 'Payment verification failed.');
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            // Person closed the modal without paying.
            setLoading(false);
            onCancel?.();
          },
        },
      });

      razorpay.open();
    } catch (err) {
      setLoading(false);
      onError?.(err instanceof Error ? err.message : 'Something went wrong starting payment.');
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      className={
        className ??
        'w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-4 text-sm font-bold text-white hover:shadow-glow transition-shadow disabled:opacity-70 disabled:cursor-not-allowed'
      }
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> Processing payment…
        </>
      ) : (
        <>
          <Lock className="h-4 w-4" /> {label ?? 'Pay now'}
        </>
      )}
    </button>
  );
}
