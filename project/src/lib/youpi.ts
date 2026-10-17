export interface YoupiPayResult {
  status: 'SUCCESS' | 'FAILED' | 'SUSPICIOUS' | 'EXPIRED' | 'CANCELLED';
  order_id: string;
  payment_mode?: string;
  amount_received?: number;
  utr?: string;
  reason?: string;
  timestamp?: string;
  raw?: unknown;
}

export interface YoupiPayOptions {
  key?: string;
  order_id?: string;
  orderId?: string;
  amount?: number | string;
  currency?: string;
  name?: string;
  description?: string;
  customer?: { name?: string; email?: string; phone?: string };
  metadata?: Record<string, unknown>;
  paymentId?: string;
  checkoutUrl?: string;
  portalUrl?: string;
  apiUrl?: string;
  theme?: { color?: string };
  handler?: (result: YoupiPayResult) => void;
  onSuccess?: (result: YoupiPayResult) => void;
  onFailed?: (result: YoupiPayResult) => void;
  onExpired?: (result: YoupiPayResult) => void;
  onCancelled?: (result: YoupiPayResult) => void;
  onClose?: () => void;
}

interface YoupiCheckoutInstance {
  open: () => void;
  close: (callback?: () => void) => void;
}

declare global {
  interface Window {
    Youpi?: { pay: (options: YoupiPayOptions) => Promise<YoupiCheckoutInstance> };
    YoupiCheckout?: { pay: (options: YoupiPayOptions) => Promise<YoupiCheckoutInstance> };
  }
}

let youpiScriptPromise: Promise<void> | null = null;

export function loadYoupiScript(): Promise<void> {
  if (window.Youpi || window.YoupiCheckout) return Promise.resolve();
  if (youpiScriptPromise) return youpiScriptPromise;

  youpiScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/youpi.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      youpiScriptPromise = null;
      reject(new Error('Failed to load YouPI SDK'));
    };
    document.body.appendChild(script);
  });

  return youpiScriptPromise;
}

/**
 * Kill-switch for the whole YouPI checkout option: the self-hosted
 * gateway URL must be configured before the selector shows it at all
 * (matches the `VITE_YOUPI_API_URL` env var — see .env.example).
 */
export function isYoupiConfigured(): boolean {
  return Boolean(import.meta.env.VITE_YOUPI_API_URL);
}
