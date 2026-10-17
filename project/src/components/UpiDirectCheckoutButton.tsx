import { useEffect, useRef, useState } from 'react';
import { Copy, Loader2, Smartphone, Wallet } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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

const POLL_INTERVAL_MS = 15_000;
const STALL_AFTER_ATTEMPTS = 3;

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
  const [phase, setPhase] = useState<'idle' | 'creating' | 'awaiting' | 'stalled' | 'expired' | 'verifying'>('idle');
  const [session, setSession] = useState<CreateUpiResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const pollRef = useRef<number | null>(null);

  // UPI deep links (upi://) only resolve where a UPI app intent handler
  // is registered — Android/iOS. On desktop (macOS included) the scheme
  //.has no handler and the browser logs "scheme does not have a
  // registered handler"; there we show QR + copyable details instead.
  const isMobile =
    typeof navigator !== 'undefined' &&
    (/Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent) ||
      navigator.maxTouchPoints > 1);

  const copy = (value: string, key: string) => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setCopied(null)
    );
  };

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
    if (error) {
      const message = error.message ?? '';
      if (message.includes('SESSION_EXPIRED') || message === 'EXPIRED') {
        throw new Error('EXPIRED');
      }
      throw new Error(message || 'Verification failed.');
    }
    if (data?.order) {
      return data.order as OrderRow;
    }
    return null;
  };

  const drivePolling = async (created: CreateUpiResponse, bumpAttempt = true) => {
    try {
      setPhase(attempts >= STALL_AFTER_ATTEMPTS ? 'stalled' : 'verifying');
      const order = await verifyNow(created);
      if (order) {
        setPhase('idle');
        setSession(null);
        onSuccess(order);
        return;
      }
      const nextAttempt = bumpAttempt ? attempts + 1 : attempts;
      setAttempts(nextAttempt);
      pollRef.current = window.setTimeout(() => void drivePolling(created), POLL_INTERVAL_MS);
      setPhase(nextAttempt >= STALL_AFTER_ATTEMPTS ? 'stalled' : 'awaiting');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed.';
      if (message === 'EXPIRED') {
        setPhase('expired');
        return;
      }
      pollRef.current = window.setTimeout(() => void drivePolling(created), POLL_INTERVAL_MS);
      setPhase(attempts >= STALL_AFTER_ATTEMPTS ? 'stalled' : 'awaiting');
    }
  };

  const handleClick = async () => {
    setPhase('creating');
    setAttempts(0);
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
      setPhase('verifying');
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
    setAttempts(0);
    onCancel?.();
  };

  const checkNow = () => {
    if (!session) return;
    if (pollRef.current) window.clearTimeout(pollRef.current);
    void drivePolling(session, false);
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
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:p-5">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {isMobile ? (
              <a
                href={session.upiUri}
                onClick={(e) => {
                  e.preventDefault();
                  try { window.location.href = session.upiUri; } catch { window.open(session.upiUri, '_blank'); }
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <Wallet className="h-4 w-4" /> Open UPI app
              </a>
            ) : (
              <div className="shrink-0 rounded-xl border border-emerald-100 bg-white p-2">
                <QRCodeSVG value={session.upiUri} size={120} />
              </div>
            )}
            <div className="min-w-0 w-full space-y-1.5">
              {[
                ['Pay to', session.vpa, 'font-mono', 'vpa', 'Copy payee UPI ID'],
                ['Payee name', session.payeeName, '', null, null],
                ['Amount', `₹${session.amount}`, 'font-mono', 'amount', 'Copy exact amount'],
                ['Reference', session.orderId, 'font-mono', 'ref', 'Copy payment reference'],
              ].map(([lbl, val, mono, key, title]) => (
                <div key={lbl as string} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 text-slate-500">{lbl}</span>
                  <span className={`min-w-0 truncate text-slate-900 ${mono}`}>{val}</span>
                  {key && (
                    <button
                      onClick={() => copy(String(val), String(key))}
                      className="shrink-0 rounded-md p-1 hover:bg-slate-200/70"
                      title={String(title)}
                    >
                      {copied === key ? (
                        <span className="text-[10px] font-bold text-emerald-700">copied</span>
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                      )}
                    </button>
                  )}
                </div>
              ))}
              <p className="pt-1 text-[11px] leading-snug text-slate-500">
                {isMobile
                  ? 'Opens your UPI app prefilled with these exact details.'
                  : 'Scan with any UPI app on your phone (GPay/PhonePe/Paytm).'}
                {' '}Gift cards are issued only after this payment is verified with the bank — links and clicks alone
                never trigger issuance.
              </p>
            </div>
          </div>

          <div
            className={`mt-4 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
              phase === 'expired'
                ? 'bg-rose-50 text-rose-700'
                : phase === 'stalled'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-white/70 text-slate-600'
            }`}
          >
            {phase === 'verifying' || phase === 'awaiting' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for bank confirmation… (re-checking every
                {` ${POLL_INTERVAL_MS / 1000}s`})
              </>
            ) : phase === 'stalled' ? (
              <>
                Payment not yet found. We keep checking — already paid? It gets confirmed via the bank reference in
                the UPI Direct admin tab, or contact support.
              </>
            ) : (
              <>Session expired — could not verify this one. Start a new payment or contact support.</>
            )}
            {phase === 'stalled' && (
              <button
                onClick={checkNow}
                className="rounded-lg border border-amber-200 bg-white px-2 py-1 font-bold text-amber-800 hover:bg-amber-50"
              >
                Check now
              </button>
            )}
            {phase === 'expired' ? (
              <button
                onClick={handleClick}
                className="rounded-lg bg-emerald-600 px-2.5 py-1.5 font-bold text-white hover:bg-emerald-700"
              >
                Start a new payment
              </button>
            ) : (
              <button onClick={cancelSession} className="ml-auto text-slate-500 hover:text-slate-700">
                Cancel
              </button>
             )}
           </div>
         </div>
       )}
     </div>
   );
 }
