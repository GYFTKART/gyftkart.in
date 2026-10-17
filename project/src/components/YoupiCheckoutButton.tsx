import { useState } from 'react';
import { Lock, Loader2, Smartphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { loadYoupiScript, type YoupiPayResult } from '@/lib/youpi';
import type { OrderRow } from '@/components/RazorpayCheckoutButton';

interface YoupiCheckoutButtonProps {
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

interface CreatePaymentResponse {
  paymentId: string;
  orderId: string;
  amount: string;
  currency: string;
  checkoutUrl: string;
}

export default function YoupiCheckoutButton({
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
}: YoupiCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await loadYoupiScript();

      // Step 1 — create the payment session server-side via our Edge
      // Function (it holds the YouPI merchant config), so the caller
      // is authenticated and the amount can't be forged in the browser.
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke(
        'create-youpi-payment',
        {
          body: {
            amount,
            customer: { name: buyerName, email: buyerEmail, phone: buyerPhone },
          },
        }
      );
      if (paymentError || !paymentData?.checkoutUrl) {
        throw new Error(paymentError?.message ?? 'Could not start payment. Please try again.');
      }
      const session = paymentData as CreatePaymentResponse;

      const Youpi = window.Youpi ?? window.YoupiCheckout;
      if (!Youpi) throw new Error('YouPI checkout failed to initialize.');

      // Step 2 — open the YouPI checkout modal (UPI QR / app deep links,
      // WhatsApp OTP — all handled inside the gateway's iframe).
      await Youpi.pay({
        order_id: session.orderId,
        paymentId: session.paymentId,
        checkoutUrl: session.checkoutUrl,
        amount,
        currency: session.currency ?? 'INR',
        name: 'GyftKart',
        description: 'Gift card purchase',
        customer: { name: buyerName, email: buyerEmail, phone: buyerPhone },
        onClose: () => {
          setLoading(false);
          onCancel?.();
        },
        handler: async (result: YoupiPayResult) => {
          // Step 3 — the browser event is never trusted by itself. Our
          // Edge Function re-checks the session server-to-server against
          // the gateway and only then writes the order row.
          try {
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
              'verify-youpi-payment',
              {
                body: {
                  order_id: result.order_id,
                  payment_id: session.paymentId,
                  utr: result.utr,
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
      });
    } catch (err) {
      setLoading(false);
      onError?.(err instanceof Error ? err.message : 'Something went wrong starting YouPI payment.');
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
          <Smartphone className="h-4 w-4" /> {label ?? 'Pay with YouPI (UPI)'}
          <Lock className="ml-1 h-3.5 w-3.5 opacity-60" />
        </>
      )}
    </button>
  );
}
