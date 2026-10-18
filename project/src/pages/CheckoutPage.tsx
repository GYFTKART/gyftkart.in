import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  Lock,
  ShieldCheck,
  ArrowLeft,
  Gift,
  CheckCircle2,
  Sparkles,
  PartyPopper,
  Copy,
  Loader2,
  Wallet as WalletIcon,
} from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/CustomerAuthContext';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { getSessionId } from '@/lib/session';
import { inr, inrDecimal } from '@/lib/format';
import type { CartItem, Purchase } from '@/lib/types';
import type { OrderRow } from '@/components/RazorpayCheckoutButton';
import RazorpayCheckoutButton from '@/components/RazorpayCheckoutButton';
import UpiDirectCheckoutButton from '@/components/UpiDirectCheckoutButton';
import {
  getPublicPaymentSettings,
  type PaymentGatewaySettings,
  DEFAULT_PAYMENT_SETTINGS,
  SETTINGS_UPDATED_EVENT,
} from '@/lib/paymentSettings';

type Step = 'review' | 'pay' | 'success';
type Gateway = 'upi' | 'wallet' | 'razorpay';

const stepsMeta: { id: Step; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'pay', label: 'Payment' },
  { id: 'success', label: 'Done' },
];

function genCode(): string {
  const seg = () => Math.random().toString(16).slice(2, 6).toUpperCase();
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

export default function CheckoutPage() {
  const { items: cartItems, subtotal: cartSubtotal, clear, count: cartCount, isLoading } = useCart();
  const { session } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // If BrandProductPage sent us here via "Buy Now", we checkout only that
  // single item and never touch the shared cart — not its contents, and
  // not clearing it on success either.
  const buyNowItem = (location.state as { buyNowItem?: CartItem } | null)?.buyNowItem ?? null;
  const isBuyNow = Boolean(buyNowItem);

  const items = isBuyNow ? [buyNowItem as CartItem] : cartItems;
  const subtotal = isBuyNow ? (buyNowItem as CartItem).amount * (buyNowItem as CartItem).quantity : cartSubtotal;
  const count = isBuyNow ? (buyNowItem as CartItem).quantity : cartCount;

  const [step, setStep] = useState<Step>('review');
  const [gateway, setGateway] = useState<Gateway>('upi');
  const [paymentSettings, setPaymentSettings] = useState<PaymentGatewaySettings>(DEFAULT_PAYMENT_SETTINGS);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');

  // Load public payment gateway configuration
  useEffect(() => {
    let mounted = true;
    void getPublicPaymentSettings().then((s) => {
      if (mounted) setPaymentSettings(s);
    });

    const handleSettingsUpdated = (e: Event) => {
      const detail = (e as CustomEvent<PaymentGatewaySettings>).detail;
      if (detail && mounted) {
        setPaymentSettings(detail);
      }
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => {
      mounted = false;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, []);

  // Ensure only enabled gateways can be selected
  useEffect(() => {
    if (gateway === 'razorpay' && !paymentSettings.razorpay_enabled) {
      setGateway('upi');
    }
  }, [gateway, paymentSettings.razorpay_enabled]);

  // Sender details ("Your details") used to be a visible form — now we
  // just pull them from the logged-in session automatically.
  useEffect(() => {
    if (session) {
      setBuyerName(session.name);
      setBuyerEmail(session.email);
    }
  }, [session]);

  // redirect to brands if cart empties (but not right after success clear,
  // and never for a Buy Now checkout — that flow never touches the cart)
  useEffect(() => {
    if (isBuyNow) return; // Buy Now never touches the shared cart, skip check
    if (isLoading) return; // cart still resolving (hard refresh, auth reattach) — don't judge yet
    if (items.length === 0 && step !== 'success') {
      navigate('/brands', { replace: true });
    }
  }, [isBuyNow, isLoading, items.length, step, navigate]);

  const convenienceFee = 0;
  const total = subtotal + convenienceFee;

  const validBuyer = buyerName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail);
  const upiDirectReady = paymentSettings.upi_direct_enabled;

  // Runs only after the chosen gateway (Razorpay or YouPI) has been
  // verified server-side (see the verify-*payment Edge Functions). This
  // is what actually issues the gift cards. The verified gateway payment
  // id is stamped onto every issued row — with the
  // `uq_purchases_one_batch_per_payment` unique index this makes
  // duplicate issuance (double callbacks, re-submits, races) impossible
  // at the DB level for both gateways. Wallet orders carry NO gateway
  // payment id (null label) and are issued through the same helper.
  const insertPurchaseRows = async (
    issuedUnderPaymentId: string | null
  ): Promise<Purchase[]> => {
    const sid = getSessionId();
    // Guest checkouts (no session) leave this null — the ledger
    // trigger still records the sale as company revenue, it just
    // won't have a customer wallet to debit.
    const uid = session?.id ?? null;
    const rows = items.map((it) => ({
      session_id: sid,
      user_id: uid,
      brand_slug: it.brand_slug,
      brand_name: it.brand_name,
      brand_color: it.brand_color,
      brand_color2: it.brand_color2,
      amount: it.amount,
      quantity: it.quantity,
      recipient_name: it.recipient_name,
      recipient_email: it.recipient_email,
      recipient_phone: it.recipient_phone,
      message: it.message,
      occasion: it.occasion,
      gift_card_code: genCode(),
      status: 'active',
      balance: it.amount * it.quantity,
      issued_under_payment_id: issuedUnderPaymentId,
    }));
    const { data, error } = await supabase.from('purchases').insert(rows).select('*');
    if (error) throw error;
    return (data ?? []) as Purchase[];
  };

  const issueGiftCards = async (verifiedOrder?: OrderRow) => {
    try {
      const issuedUnderPaymentId =
        verifiedOrder?.youpi_payment_id ?? verifiedOrder?.upi_payment_id ?? verifiedOrder?.razorpay_payment_id ?? null;
      const data = await insertPurchaseRows(issuedUnderPaymentId);
      setPurchases(data);
      if (!isBuyNow) clear();
      setStep('success');
      push('Payment successful! Gift cards delivered.', 'success');
    } catch (err) {
      // The payment itself already succeeded and is recorded in
      // `orders` at this point — this only covers gift-card issuance
      // failing afterwards, which should be rare but is worth its own
      // message so it doesn't look like the payment failed.
      push(
        err instanceof Error
          ? `Payment succeeded, but issuing gift cards failed: ${err.message}`
          : 'Payment succeeded, but issuing gift cards failed.',
        'error'
      );
    }
  };

  const handlePaymentSuccess = (verifiedOrder?: OrderRow) => {
    void issueGiftCards(verifiedOrder);
  };

  const handlePaymentError = (message: string) => {
    push(message, 'error');
  };

  // ---- GyftKart Wallet option (v1: full-balance purchase only) -------
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!session?.token) {
      setWalletBalance(null);
      return;
    }
    (async () => {
      const { data, error: err } = await supabase.rpc('ensure_wallet');
      if (!active) return;
      setWalletBalance(err ? null : Number((data as unknown as { balance?: number })?.balance ?? 0));
    })();
    return () => {
      active = false;
    };
  }, [session?.token]);

  const walletCanPay =
    !!session?.token && walletBalance !== null && walletBalance >= Math.round(total * 100);

  const handleWalletPay = async () => {
    if (!session?.token || walletBusy) return;
    setWalletBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'wallet-checkout',
        {
          body: { items },
          headers: session.token ? { Authorization: `Bearer ${session.token}` } : undefined,
        }
      );
      if (error) {
        let bodyError: string | undefined;
        if (error instanceof FunctionsHttpError) {
          try {
            const payload: unknown = await (error.context as Response).json();
            if (payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string') {
              bodyError = (payload as { error: string }).error;
            }
          } catch {
            /* fall through */
          }
        }
        throw new Error(bodyError ?? error.message ?? 'Wallet payment failed.');
      }
      if (data?.error) {
        throw new Error(String(data.error));
      }
      // Same client issuance path as every gateway (issued_under_payment_id
      // stays null for wallet orders — purchases rows are identical).
      await insertPurchaseRows(null);
      setWalletBalance(Number(data.balance_after));
      push(
        `Paid via GyftKart Wallet — ${inr(total)}. Order #${data.order_id} placed and voucher issued.`,
        'success'
      );
      if (!isBuyNow) clear();
      navigate('/orders');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Wallet payment failed.', 'error');
    } finally {
      setWalletBusy(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  };

  const stepIndex = stepsMeta.findIndex((s) => s.id === step);

  return (
    <div className="pt-16 min-h-screen bg-gradient-to-b from-brand-50/40 to-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/brands"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-brand-700 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Continue shopping
        </Link>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 sm:gap-4 mb-10">
          {stepsMeta.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={s.id} className="flex items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`grid place-items-center h-9 w-9 rounded-full text-sm font-bold transition-all ${
                      done
                        ? 'bg-emerald-500 text-white'
                        : active
                        ? 'bg-brand-600 text-white shadow-glow-sm'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {done ? <Check className="h-5 w-5" /> : i + 1}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      active ? 'text-brand-700' : done ? 'text-slate-700' : 'text-slate-400'
                    } hidden sm:inline`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < stepsMeta.length - 1 && (
                  <ChevronRight className={`h-5 w-5 ${done ? 'text-emerald-400' : 'text-slate-300'}`} />
                )}
              </div>
            );
          })}
        </div>

        {step === 'success' ? (
          <SuccessView purchases={purchases} buyerEmail={buyerEmail} copied={copied} copyCode={copyCode} />
        ) : (
          <div className="grid lg:grid-cols-5 gap-8 items-start">
            {/* Left: step content */}
            <div className="lg:col-span-3">
              {step === 'review' && (
                <div className="rounded-3xl border border-slate-100 bg-white p-6 sm:p-7 shadow-card animate-fade-in">
                  <h2 className="font-display text-2xl font-bold text-slate-900">Review your order</h2>
                  <p className="text-sm text-slate-500 mt-1">{count} gift card{count !== 1 ? 's' : ''} in this order.</p>

                  <div className="mt-6 space-y-3">
                    {items.map((it) => (
                      <div key={it.id} className="flex gap-3 rounded-2xl border border-slate-100 p-3">
                        <div
                          className="h-14 w-14 shrink-0 rounded-xl flex items-center justify-center text-white font-display font-bold text-[10px]"
                          style={{ background: `linear-gradient(135deg, ${it.brand_color}, ${it.brand_color2})` }}
                        >
                          {it.brand_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900 truncate">{it.brand_name}</p>
                            <p className="font-bold text-slate-900 shrink-0">{inr(it.amount * it.quantity)}</p>
                          </div>
                          <p className="text-xs text-slate-500 truncate">
                            {inr(it.amount)} × {it.quantity} · To: {it.recipient_name}
                          </p>
                          {it.message && (
                            <p className="mt-1 text-xs italic text-slate-400 truncate">"{it.message}"</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* what happens next */}
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <div className="rounded-2xl bg-brand-50/70 p-4 text-xs text-slate-600">
                      <p className="flex items-center gap-2 font-semibold text-brand-700">
                        <Gift className="h-4 w-4" /> What happens next?
                      </p>
                      <p className="mt-1.5 leading-relaxed">
                        Once you pay, gift card codes are generated instantly and emailed to each recipient.
                        You'll find them all on your /orders page.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {step === 'pay' && (
                <div className="rounded-3xl border border-slate-100 bg-white p-6 sm:p-7 shadow-card animate-fade-in">
                  <div className="flex items-center gap-2.5">
                    <span className="grid place-items-center h-10 w-10 rounded-2xl bg-brand-100 text-brand-700">
                      <Lock className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-display text-2xl font-bold text-slate-900">Secure payment</h2>
                      <p className="text-xs text-slate-500">
                        {gateway === 'upi'
                          ? 'Powered by UPI Direct · 0% gateway fees'
                          : gateway === 'wallet'
                          ? 'Powered by GyftKart Digital Wallet'
                          : 'Powered by Razorpay'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
                    {gateway === 'upi' ? (
                      "You'll scan a UPI QR or open your preferred UPI app (GPay, PhonePe, Paytm, BHIM) and confirm with your 12-digit UTR reference."
                    ) : gateway === 'wallet' ? (
                      "Pay directly and instantly using your GyftKart wallet balance."
                    ) : (
                      "You'll be able to choose card or net banking in the next step — Razorpay's secure checkout window handles that for you."
                    )}
                  </div>

                  <div className="mt-5 flex items-center gap-2 text-xs text-slate-400">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    256-bit encrypted · PCI-DSS compliant
                  </div>
                </div>
              )}
            </div>

            {/* Right: order summary */}
            <div className="lg:col-span-2 lg:sticky lg:top-24">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card">
                <h3 className="font-display text-lg font-bold text-slate-900">Order summary</h3>
                <div className="mt-4 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Subtotal ({count} item{count !== 1 ? 's' : ''})</span>
                    <span className="font-semibold text-slate-800">{inr(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Convenience fee</span>
                    <span className="font-semibold text-slate-800">{inr(convenienceFee)}</span>
                  </div>
                  <div className="flex items-center justify-between text-emerald-600">
                    <span>Instant delivery</span>
                    <span className="font-semibold">FREE</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="font-display font-bold text-slate-900">Total</span>
                  <span className="font-display text-2xl font-extrabold text-slate-900">{inr(total)}</span>
                </div>

                {step === 'review' && (
                  <button
                    onClick={() => (validBuyer ? setStep('pay') : push('Please log in to continue', 'error'))}
                    className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-4 text-sm font-bold text-white hover:shadow-glow transition-shadow"
                  >
                    Proceed to payment <ChevronRight className="h-4 w-4" />
                  </button>
                )}

                {step === 'pay' && (
                  <div className="mt-5">
                    {/* Gateway selector — UPI Direct & Wallet Balance active; Razorpay only if enabled by admin */}
                    <div className={`grid gap-2.5 ${paymentSettings.razorpay_enabled ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
                      {/* 1. UPI Direct */}
                      <button
                        type="button"
                        onClick={() => setGateway('upi')}
                        disabled={!upiDirectReady}
                        title={upiDirectReady ? undefined : 'Direct UPI is not enabled yet'}
                        className={`rounded-2xl border p-3 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          gateway === 'upi'
                            ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-slate-900">UPI Direct</p>
                          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">0% fee</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">QR · GPay · PhonePe · Paytm</p>
                      </button>

                      {/* 2. GyftKart Wallet */}
                      <button
                        type="button"
                        onClick={() => setGateway('wallet')}
                        disabled={!session?.token}
                        title={session?.token ? undefined : 'Sign in to use your GyftKart Wallet'}
                        className={`rounded-2xl border p-3 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          gateway === 'wallet'
                            ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <p className="text-xs font-bold text-slate-900">GyftKart Wallet</p>
                        <p className="mt-0.5 text-[11px]">
                          {walletCanPay ? (
                            <span className="text-emerald-700 font-semibold">Balance {inrDecimal(walletBalance! / 100)}</span>
                          ) : (
                            <Link
                              to="/wallet"
                              className="font-semibold text-amber-700 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Low Balance — Add Money
                            </Link>
                          )}
                        </p>
                      </button>

                      {/* 3. Razorpay (ONLY if enabled in Admin Settings) */}
                      {paymentSettings.razorpay_enabled && (
                        <button
                          type="button"
                          onClick={() => setGateway('razorpay')}
                          className={`rounded-2xl border p-3 text-left transition-all ${
                            gateway === 'razorpay'
                              ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <p className="text-xs font-bold text-slate-900">Razorpay</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">Cards · Netbanking</p>
                        </button>
                      )}
                    </div>

                    {gateway === 'upi' ? (
                      <div className="mt-3">
                        <UpiDirectCheckoutButton
                          amount={total}
                          items={items}
                          buyerName={buyerName}
                          buyerEmail={buyerEmail}
                          disabled={!validBuyer}
                          onSuccess={handlePaymentSuccess}
                          onError={handlePaymentError}
                          onCancel={() => setGateway('upi')}
                          label={`Pay ${inr(total)}`}
                        />
                      </div>
                    ) : gateway === 'wallet' ? (
                      <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
                        {!session?.token ? (
                          <p className="text-xs font-semibold text-amber-700">
                            Sign in to pay with your GyftKart Wallet.
                          </p>
                        ) : walletBalance !== null && walletCanPay ? (
                          <div className="flex flex-col items-center justify-center gap-2 text-center">
                            <p className="text-xs font-bold text-slate-700">Full-balance payment via your wallet</p>
                            <p className="text-[11px] text-slate-500">
                              Spends your entire balance on this order — the voucher codes will be generated and
                              listed on your /orders page on success.
                            </p>
                            <button
                              onClick={() => void handleWalletPay()}
                              disabled={walletBusy || !validBuyer}
                              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-4 text-sm font-bold text-white hover:shadow-glow transition-shadow disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                              {walletBusy ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" /> Debiting wallet…
                                </>
                              ) : (
                                <>
                                  <WalletIcon className="h-4 w-4" /> Pay {inr(total)} with Wallet
                                </>
                              )}
                            </button>
                            <p className="mt-2 text-[11px] font-semibold text-amber-700">
                              Low Balance — Add Money on the <Link to="/wallet" className="underline">Wallet page</Link>.
                            </p>
                          </div>
                        ) : (
                          <p className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                            <WalletIcon className="h-3.5 w-3.5 shrink-0" />
                            Low Balance — Add Money on the Wallet page (/wallet) to pay with the wallet.
                          </p>
                        )}
                      </div>
                    ) : gateway === 'razorpay' && paymentSettings.razorpay_enabled ? (
                      <div className="mt-3">
                        <RazorpayCheckoutButton
                          amount={total}
                          items={items}
                          buyerName={buyerName}
                          buyerEmail={buyerEmail}
                          disabled={!validBuyer}
                          onSuccess={handlePaymentSuccess}
                          onError={handlePaymentError}
                          label={`Pay ${inr(total)}`}
                        />
                      </div>
                    ) : null}
                    <button
                      onClick={() => setStep('review')}
                      className="mt-3 w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      Back to review
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SuccessView({
  purchases,
  buyerEmail,
  copied,
  copyCode,
}: {
  purchases: Purchase[];
  buyerEmail: string;
  copied: string | null;
  copyCode: (code: string) => void;
}) {
  const total = purchases.reduce((s, p) => s + Number(p.amount) * p.quantity, 0);
  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* hero success */}
      <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-8 sm:p-12 text-white text-center shadow-glow">
        <div className="absolute inset-0 bg-grid opacity-[0.1] pointer-events-none" />
        <div className="absolute -top-16 -left-10 h-56 w-56 rounded-full bg-white/15 blur-3xl pointer-events-none" />
        <span className="relative inline-grid place-items-center h-20 w-20 rounded-3xl bg-white/20 mx-auto animate-pop">
          <PartyPopper className="h-10 w-10" />
        </span>
        <h2 className="relative mt-5 font-display text-3xl sm:text-4xl font-extrabold">Payment successful!</h2>
        <p className="relative mt-2 text-emerald-50 max-w-md mx-auto">
          {purchases.length} gift card{purchases.length !== 1 ? 's' : ''} worth {inr(total)} delivered.
          A receipt{buyerEmail ? ` was sent to ${buyerEmail}` : ''}.
        </p>
        <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            <Sparkles className="h-4 w-4" /> View your orders
          </Link>
          <Link
            to="/brands"
            className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/30 px-6 py-3 text-sm font-bold text-white hover:bg-white/25 transition-colors"
          >
            Send another gift
          </Link>
        </div>
      </div>

      {/* codes */}
      <div className="mt-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-card">
        <h3 className="font-display text-lg font-bold text-slate-900">Your gift card codes</h3>
        <p className="text-sm text-slate-500 mt-0.5">Copy and share, or find them anytime on your /orders page.</p>
        <div className="mt-5 space-y-3">
          {purchases.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-100 p-4 flex items-center gap-4">
              <div
                className="h-12 w-12 shrink-0 rounded-xl flex items-center justify-center text-white font-display font-bold text-[11px]"
                style={{ background: `linear-gradient(135deg, ${p.brand_color}, ${p.brand_color2})` }}
              >
                {p.brand_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm">{p.brand_name}</p>
                <p className="text-xs text-slate-400 truncate">
                  {inr(Number(p.amount))} · To: {p.recipient_name}
                </p>
                <p className="mt-1 font-mono text-sm font-bold tracking-wider text-brand-700">{p.gift_card_code}</p>
              </div>
              <button
                onClick={() => copyCode(p.gift_card_code)}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100 transition-colors shrink-0"
              >
                {copied === p.gift_card_code ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
