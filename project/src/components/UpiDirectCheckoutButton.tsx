import { useEffect, useRef, useState } from 'react';
import { Loader2, Smartphone, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { OrderRow } from '@/components/RazorpayCheckoutButton';

interface UpiDirectProps {
  /** Total amount in rupees (e.g. 499 for ₹499). */
  amount: number;
  items: unknown[];
  buyerName: string;
  buyerEmail: string;
  disabled?: boolean;
  onSuccess: (order: OrderRow) => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
  label?: string;
  className?: string;
}

interface CreateUpiResponse {
  paymentId: string;
  orderId: string;
  amount: string;
  upiUri: string;
  vpa: string;
  payeeName: string;
  expiresInMinutes: number;
}

const POLL_INTERVAL_MS = 10_000;

export default function UpiDirectCheckoutButton({
  amount,
  items,
  buyerName,
  buyerEmail,
  disabled,
  onSuccess,
  onError,
  onCancel,
  label,
  className,
}: UpiDirectProps) {
  const [phase, setPhase] = useState<'idle' | 'creating' | 'awaiting' | 'verifying'>('idle');
  const [session, setSession] = useState<CreateUpiResponse | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
    },
    []
  );

  const verifyNow = async (created: CreateUpiResponse) => {
    const { data, error } = await supabase.functions.invoke('verify-upi-intent-payment', {
      body: {
        order_id: created.orderId,
        payment_id: created.paymentId,
        total_amount: amount,
      },
    });
    if (error) throw new Error(error.message);
    if (data?.order) {
      return data.order as OrderRow;
    }
    return null;
  };

  const drivePolling = async (created: CreateUpiResponse) => {
    try {
      setPhase('verifying');
      const order = await verifyNow(created);
      if (order) {
        setPhase('idle');
        setSession(null);
        onSuccess(order);
        return;
      }
      pollRef.current = window.setTimeout(() => void drivePolling(created), POLL_INTERVAL_MS);
      setPhase('awaiting');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed.';
      if (message.includes('EXPIRED') || message.includes('SESSION_EXPIRED')) {
        setPhase('idle');
        setSession(null);
        onError?.('UPI session expired. Please start the payment again.');
        return;
      }
      pollRef.current = window.setTimeout(() => void drivePolling(created), POLL_INTERVAL_MS);
      setPhase('awaiting');
    }
  };

  const handleClick = async () => {
    setPhase('creating');
    try {
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke(
        'create-upi-intent-payment',
        {
          body: {
            amount,
            items,
            buyer: { name: buyerName, email: buyerEmail },
          },
        }
      );
      if (paymentError || !paymentData?.paymentId) {
        throw new Error(paymentError?.message ?? 'Could not start UPI payment.');
      }
      const created = paymentData as CreateUpiResponse;
      setSession(created);
      setPhase('awaiting');
      void drivePolling(created);
    } catch (err) {
      setPhase('idle');
      onError?.(err instanceof Error ? err.message : 'Something went wrong starting UPI payment.');
    }
  };

  const cancelSession = () => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    setSession(null);
    setPhase('idle');
    onCancel?.();
  };

  return (
    <div className={className ? 'grid gap-3 ' + className : 'grid gap-3'}>
      {!session && (
        <button
          onClick={handleClick}
          disabled={disabled || phase === 'creating'}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-4 text-sm font-bold text-white hover:shadow-glow transition-shadow disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {phase === 'creating' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Creating UPI session…
            </>
          ) : (
            <>
              <Smartphone className="h-4 w-4" /> {label ?? 'Pay by UPI — Direct bank verification'}
            </>
          )}
        </button>
      )}

      {session && phase !== 'idle' && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
          <p className="text-sm font-bold text-slate-900">
            Send <span className='text-emerald-700'>₹{session.amount}</span> to{' '}
            <span className="font-mono select-all">{session.vpa}</span>
          </p>
          <p className="text-xs text-slate-600 mt-1">
            UPI app: tap below for the prefilled payment (Android/iOS), or scan/copy the amount.
            We verify your credit with the bank automatically within{' '}
            {session.expiresInMinutes} minutes — never wait longer than that.
          </p>
          <div className="grid gap-2 mt-3">
            <a
              href={session.upiUri}
              onClick={(e) => {
                e.preventDefault();
                try { window.location.href = session.upiUri; } catch { window.open(session.upiUri, '_blank'); }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <Wallet className="h-4 w-4" /> Open UPI app
            </a>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600`}>
                {phase === 'verifying' || phase === 'awaiting' ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Waiting for bank confirmation…
                  </>
                ) : null}
              </span>
              <button
                onClick={cancelSession}
                className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
