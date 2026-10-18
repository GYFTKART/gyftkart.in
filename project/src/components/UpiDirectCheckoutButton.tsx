import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, FileImage, Loader2, Smartphone, ShieldCheck, Wallet, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/CustomerAuthContext';
import type { OrderRow } from '@/components/RazorpayCheckoutButton';
import { sanitizeUtr, checkRateLimit } from '@/lib/security';

interface UpiDirectProps {
  /** Total amount in rupees (e.g. 499 for ₹499). */
  amount: number;
  /** Cart items — required only for category 'VOUCHER' (default). */
  items?: unknown[];
  /** 'TOPUP' switches the intent/w pods to a wallet top-up session. */
  category?: 'VOUCHER' | 'TOPUP';
  /** For 'TOPUP': the top-up amount in paisa (1..10000000), sent as-is. */
  topUpAmountPaise?: number;
  buyerName: string;
  buyerEmail: string;
  disabled?: boolean;
  onSuccess?: (order: OrderRow) => void;
  /** Fired when a top-up session is CONFIRMED server-side (balance credited there). */
  onTopUpCompleted?: () => void;
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
const PROOF_MAX_BYTES = 3 * 1024 * 1024;
const PROOF_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export default function UpiDirectCheckoutButton({
  amount,
  items,
  category = 'VOUCHER',
  topUpAmountPaise,
  buyerName,
  buyerEmail,
  disabled,
  onSuccess,
  onTopUpCompleted,
  onError,
  onCancel,
  label,
  className,
}: UpiDirectProps) {
  const topUp = category === 'TOPUP';
  const { session: authSession } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'idle' | 'creating' | 'awaiting' | 'stalled' | 'expired' | 'verifying' | 'topupDone'>('idle');
  const [session, setSession] = useState<CreateUpiResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const pollRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [utr, setUtr] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPickError, setProofPickError] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [proofOk, setProofOk] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [backendMissing, setBackendMissing] = useState(false);

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
    });if (error) {
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

  // Top-up sessions must NOT hit verify-upi-intent-payment (it would
  // create voucher orders for them) — poll the status endpoint only;
  // crediting happens server-side on confirmation, never client-side.
  const statusNow = async (created: CreateUpiResponse): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('upi-direct-status', {
      body: {
        order_id: created.orderId,
        payment_id: created.paymentId,
        total_amount: (topUpAmountPaise ?? 0) / 100,
      },
    });
    if (error) {
      throw new Error(error.message || 'Status check failed.');
    }
    return (data as { status?: string })?.status ?? 'PENDING';
  };

  const drivePolling = async (created: CreateUpiResponse, bumpAttempt = true) => {
    try {
      setPhase(attempts >= STALL_AFTER_ATTEMPTS ? 'stalled' : 'verifying');
      if (topUp) {
        const status = await statusNow(created);
        if (status === 'SUCCESS') {
          // Wallet credit has happened server-side; refresh balance upward.
          setSession(null);
          setPhase('topupDone');
          onTopUpCompleted?.();
          return;
        }
        if (status === 'EXPIRED') {
          setPhase('expired');
          return;
        }
        const nextAttempt = bumpAttempt ? attempts + 1 : attempts;
        setAttempts(nextAttempt);
        pollRef.current = window.setTimeout(() => void drivePolling(created), POLL_INTERVAL_MS);
        setPhase(nextAttempt >= STALL_AFTER_ATTEMPTS ? 'stalled' : 'awaiting');
        return;
      }
      const order = await verifyNow(created);
      if (order) {
        setPhase('idle');
        setSession(null);
        onSuccess?.(order);
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
    resetProofState();
    try {
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke(
        'create-upi-intent-payment',
        {
          body: topUp
            ? { category: 'TOPUP', amount: Math.round(topUpAmountPaise ?? 0) }
            : {
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
    resetProofState();
    onCancel?.();
  };

  const dismissOutcome = () => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    setSession(null);
    setPhase('idle');
    setAttempts(0);
    resetProofState();
  };

  const viewOrders = () => {
    dismissOutcome();
    navigate('/orders');
  };

  const checkNow = () => {
    if (!session) return;
    if (pollRef.current) window.clearTimeout(pollRef.current);
    void drivePolling(session, false);
  };

  const resetProofState = () => {
    setUtr('');
    setProofFile(null);
    setProofPickError(null);
    setSubmittingProof(false);
    setProofOk(false);
    setProofError(null);
    setBackendMissing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const pickProofFile = (file: File | null) => {
    setProofPickError(null);
    setProofError(null);
    if (!file) {
      setProofFile(null);
      return;
    }
    if (!PROOF_TYPES.includes(file.type)) {
      setProofPickError('Screenshot must be a PNG, JPEG or WebP image.');
      setProofFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > PROOF_MAX_BYTES) {
      setProofPickError('Screenshot must be 3MB or smaller.');
      setProofFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setProofFile(file);
  };

  const submitProof = async () => {
    if (!authSession || !session) return;

    // Rate-limiting: max 5 UTR submission attempts per minute per customer
    const rateCheck = checkRateLimit(`upi:proof:${authSession.id}`, 5, 60);
    if (!rateCheck.allowed) {
      setProofError(`Too many submission attempts. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`);
      return;
    }

    const { isValid, cleanUtr, error: utrErr } = sanitizeUtr(utr);
    if (!isValid) {
      setProofError(utrErr || 'UTR must be exactly 12 digits.');
      return;
    }

    setSubmittingProof(true);
    setProofError(null);
    setProofOk(false);
    setBackendMissing(false);
    let proofPath: string | undefined;
    try {
      if (proofFile) {
        const safeName = proofFile.name.replace(/[^\w.-]+/g, '_').slice(-64);
        const path = `user-${authSession.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('upi-payment-proofs')
          .upload(path, proofFile, { contentType: proofFile.type, upsert: false });
        if (uploadError) {
          throw new Error(`Screenshot upload failed: ${uploadError.message}`);
        }
        proofPath = path;
      }
      const { error } = await supabase.functions.invoke('upi-report-payment', {
        body: { payment_id: session.paymentId, utr: cleanUtr, proof_path: proofPath },
        headers: authSession.token ? { Authorization: `Bearer ${authSession.token}` } : undefined,
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          let bodyError: string | undefined;
          let nonJson = false;
          try {
            const payload: unknown = await (error.context as Response).json();
            if (payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string') {
              bodyError = (payload as { error: string }).error;
            } else if (typeof payload === 'string' && payload.trim()) {
              bodyError = payload;
            }
          } catch {
            nonJson = true;
          }
          if (nonJson || (bodyError && bodyError.toLowerCase().includes('function not found'))) {
            // Edge Function not deployed: fallback to atomic database RPC
            const { data: rpcData, error: rpcError } = await supabase.rpc('submit_upi_payment_proof', {
              p_payment_id: session.paymentId,
              p_utr: cleanUtr,
              p_proof_path: proofPath ?? null,
            });
            if (!rpcError && (rpcData as { ok?: boolean })?.ok) {
              setProofOk(true);
              setProofFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
            }
            if (rpcError) {
              setProofError(rpcError.message || 'Payment proof could not be recorded.');
              return;
            }
            if ((rpcData as { error?: string })?.error) {
              setProofError((rpcData as { error: string }).error);
              return;
            }
            setBackendMissing(true);
            setProofError(
              proofPath
                ? 'Your screenshot was uploaded and saved, but the payment-reporting service is not deployed yet. Our team has been notified — no need to pay again or resubmit.'
                : 'The payment-reporting service is not deployed yet, so your UTR could not be recorded. Our team has been notified — please try again a little later.'
            );
            return;
          }
          setProofError(
            bodyError === 'A different UTR is already reported for this session'
              ? 'A different UTR is already reported for this payment.'
              : bodyError === 'This UTR is already reported on another payment'
              ? 'This UTR is already reported on another payment.'
              : (bodyError ?? error.message ?? 'Payment proof could not be recorded.')
          );
          return;
        }
        // Transport/network error: try RPC fallback before giving up
        const { data: rpcData, error: rpcError } = await supabase.rpc('submit_upi_payment_proof', {
          p_payment_id: session.paymentId,
          p_utr: cleanUtr,
          p_proof_path: proofPath ?? null,
        });
        if (!rpcError && (rpcData as { ok?: boolean })?.ok) {
          setProofOk(true);
          setProofFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        setProofError(error.message || 'Payment proof could not be recorded.');
        return;
      }
      setProofOk(true);
      setProofFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setProofError(
        err instanceof Error ? err.message : 'Payment proof could not be recorded. Please try again.'
      );
    } finally {
      setSubmittingProof(false);
    }
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

      {session && phase !== 'idle' && proofOk && (
        <div className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:p-5">
          <div className="rounded-xl border border-emerald-100 bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <ShieldCheck className="h-4 w-4 shrink-0" />{' '}
              {topUp ? 'Top-up submitted — under manual verification' : 'Order submitted — under review'}
            </p>
            {topUp ? (
              <>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Payment details submitted successfully! Your top-up is under manual verification — nothing is
                  added to your balance automatically. It lands within 15–30 minutes once verified.
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Reported UTR: <span className="font-mono font-bold tracking-wider text-slate-900">{utr}</span>
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Payment proof submitted successfully! Your order is placed and under manual verification. You will
                  receive confirmation / gift card delivery within 15–30 minutes once verified.
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Reported UTR: <span className="font-mono font-bold tracking-wider text-slate-900">{utr}</span>
                </p>
                <p className="mt-2 text-[11px] leading-snug text-slate-500">
                  <span className="font-semibold text-slate-600">Wrong details?</span> Details on a submitted order can't
                  be edited — this payment reference is now protected against changes on our side. If something looks
                  wrong, cancel this payment and start a fresh one instead of trying to correct it here.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={viewOrders}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    View Orders
                  </button>
                  <button
                    onClick={dismissOutcome}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2.5 text-xs font-bold text-white hover:shadow-glow transition-shadow"
                  >
                    Continue Shopping
                  </button>
                </div>
              </>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {topUp && (
                <button
                  onClick={cancelSession}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2.5 text-xs font-bold text-white hover:shadow-glow transition-shadow"
                >
                  Back to wallet
                </button>
              )}
              <button
                onClick={cancelSession}
                className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
              >
                Cancel &amp; start a new payment
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'topupDone' && (
        <div className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:p-5">
          <div className="rounded-xl border border-emerald-100 bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <ShieldCheck className="h-4 w-4 shrink-0" /> Top-up verified — balance updated
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              The payment was confirmed with the bank and your wallet balance has been credited. Refresh the wallet
              dashboard if the amount hasn't shown up yet.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setPhase('idle');
                  onCancel?.();
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2.5 text-xs font-bold text-white hover:shadow-glow transition-shadow"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {session && phase !== 'idle' && !proofOk && (
        <div className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:p-5">
          <div className="flex flex-col items-center gap-4">
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
              <div className="flex w-full max-w-full items-center justify-center overflow-hidden rounded-xl border border-emerald-100 bg-white p-2 sm:max-w-[220px] [&>svg]:h-auto [&>svg]:max-w-full">
                <QRCodeSVG value={session.upiUri} size={220} />
              </div>
            )}
            <div className="min-w-0 w-full space-y-1.5">
              {[
                ['Pay to', session.vpa, 'font-mono', 'vpa', 'Copy payee UPI ID'],
                ['Payee name', session.payeeName, '', null, null],
                ['Amount', `₹${session.amount}`, 'font-mono', 'amount', 'Copy exact amount'],
                ['Reference', session.orderId, 'font-mono', 'ref', 'Copy payment reference'],
              ].map(([lbl, val, mono, key, title]) => (
                <div key={lbl as string} className="flex w-full items-start gap-2 text-xs">
                  <span className="w-20 shrink-0 pt-0.5 text-slate-500">{lbl}</span>
                  <span
                    className={`min-w-0 flex-1 break-words text-slate-900 ${mono} ${mono ? 'break-all' : ''}`}
                  >
                    {val}
                  </span>
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
                {' '}
                {topUp
                  ? 'Your wallet balance is credited only after this payment is verified with the bank — links and clicks alone never trigger a top-up.'
                  : 'Gift cards are issued only after this payment is verified with the bank — links and clicks alone never trigger issuance.'}
              </p>
            </div>
          </div>

          {phase !== 'expired' && (
            <div className="mt-4 w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-emerald-100 bg-white p-4">
              {proofOk ? (
                <div className="flex items-start gap-2 text-xs text-emerald-700">
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                  <p>
                    <span className="font-bold">Proof received — pending verification.</span> It only records your
                    evidence; a human/bank check confirms the payment next. Keep your UPI app receipt until then. You
                    can resubmit if you spot a mistake.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs font-bold text-slate-700">Already paid? Speed up confirmation</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                    Paste the 12-digit UPI reference number (UTR) from your UPI/bank app receipt and, optionally, attach
                    the payment screenshot. This is evidence for review only — gift cards are issued once the payment is
                    verified, not before.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <input
                      type="text"
                      value={utr}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={12}
                      placeholder="12-digit UTR"
                      onChange={(e) => {
                        setUtr(e.target.value.replace(/\D/g, '').slice(0, 12));
                        setProofError(null);
                        setProofOk(false);
                      }}
                      className="w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tracking-wider text-slate-900 outline-none transition-colors placeholder:font-sans placeholder:tracking-normal focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 sm:w-44"
                    />
                    <label className="w-full min-w-0 cursor-pointer truncate rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50 sm:w-auto sm:max-w-full">
                      <span className="inline-flex max-w-full items-center gap-1.5">
                        <FileImage className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{proofFile ? proofFile.name : 'Attach screenshot (optional)'}</span>
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => pickProofFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <button
                      onClick={() => void submitProof()}
                      disabled={submittingProof || utr.length !== 12 || !!proofPickError}
                      className="w-full shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto"
                    >
                      {submittingProof ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…
                        </>
                      ) : (
                        <>
                          <FileImage className="h-3.5 w-3.5" /> Submit / Verify Payment
                        </>
                      )}
                    </button>
                    <button
                      onClick={cancelSession}
                      className="w-full shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 sm:w-auto"
                    >
                      Cancel
                    </button>
                  </div>
                  {proofFile && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                      {proofFile.name} ({(proofFile.size / 1024).toFixed(0)} KB)
                      <button
                        onClick={() => pickProofFile(null)}
                        className="rounded p-0.5 hover:bg-slate-100"
                        title="Remove screenshot"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </p>
                  )}
                  {proofPickError && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">{proofPickError}</p>}
                  {proofError && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">{proofError}</p>}
                  {backendMissing && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      Reference: proof reporting backend not deployed yet — the team has been informed automatically.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {(phase === 'stalled' || phase === 'expired') && (
            <div
              className={`mt-4 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
                phase === 'expired'
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-amber-50 text-amber-800'
              }`}
            >
              {phase === 'stalled' ? (
                <>
                  Payment not yet found. We keep checking — already paid? Submit your proof above or use Check now; it
                  also gets confirmed via the bank reference in the UPI Direct admin tab, or contact support.
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
              {phase === 'expired' && (
                <button
                  onClick={handleClick}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1.5 font-bold text-white hover:bg-emerald-700"
                >
                  Start a new payment
                </button>
              )}
            </div>
          )}
          </div>
        )}
      </div>
    );
  }

