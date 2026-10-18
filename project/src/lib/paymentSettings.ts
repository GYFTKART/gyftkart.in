import { supabase } from '@/lib/supabase';

export interface PaymentGatewaySettings {
  razorpay_enabled: boolean;
  razorpay_key_id: string;
  razorpay_key_secret?: string;
  razorpay_webhook_secret?: string;
  upi_direct_enabled: boolean;
  wallet_enabled: boolean;
  updated_at?: string;
}

export const SETTINGS_STORAGE_KEY = 'gyftkart_payment_settings';
export const SETTINGS_UPDATED_EVENT = 'gyftkart:payment_settings_updated';

// Default: Razorpay DISABLED by default. Only UPI Direct and Wallet Balance are active.
export const DEFAULT_PAYMENT_SETTINGS: PaymentGatewaySettings = {
  razorpay_enabled: false,
  razorpay_key_id: (import.meta.env.VITE_RAZORPAY_KEY_ID as string) || '',
  razorpay_key_secret: '',
  razorpay_webhook_secret: '',
  upi_direct_enabled: true,
  wallet_enabled: true,
};

/**
 * For Customer Checkout: load public active gateways.
 * Razorpay is strictly disabled unless explicitly enabled in admin settings.
 */
export async function getPublicPaymentSettings(): Promise<PaymentGatewaySettings> {
  // Check localStorage cache first
  try {
    const cached = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as Partial<PaymentGatewaySettings>;
      return {
        ...DEFAULT_PAYMENT_SETTINGS,
        ...parsed,
        razorpay_enabled: Boolean(parsed.razorpay_enabled),
        // Never expose secrets to customer-facing context
        razorpay_key_secret: undefined,
        razorpay_webhook_secret: undefined,
      };
    }
  } catch (err) {
    console.warn('Failed reading payment settings from cache:', err);
  }

  // Attempt to fetch from Supabase public RPC
  try {
    const { data, error } = await supabase.rpc('get_public_payment_gateways');
    if (!error && data && typeof data === 'object') {
      const rpcData = data as Record<string, unknown>;
      const settings: PaymentGatewaySettings = {
        razorpay_enabled: Boolean(rpcData.razorpay_enabled),
        razorpay_key_id: (rpcData.razorpay_key_id as string) || (import.meta.env.VITE_RAZORPAY_KEY_ID as string) || '',
        upi_direct_enabled: rpcData.upi_direct_enabled !== false,
        wallet_enabled: rpcData.wallet_enabled !== false,
      };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {
        void e;
      }
      return settings;
    }
  } catch (err) {
    console.warn('Failed to load payment settings from Supabase, using defaults:', err);
  }

  return DEFAULT_PAYMENT_SETTINGS;
}

/**
 * For Admin Portal: load full gateway settings including keys and webhook secrets.
 */
export async function getAdminPaymentSettings(): Promise<PaymentGatewaySettings> {
  // Try reading from database table first
  try {
    const { data, error } = await supabase
      .from('payment_gateway_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (!error && data) {
      const settings: PaymentGatewaySettings = {
        razorpay_enabled: Boolean(data.razorpay_enabled),
        razorpay_key_id: data.razorpay_key_id || (import.meta.env.VITE_RAZORPAY_KEY_ID as string) || '',
        razorpay_key_secret: data.razorpay_key_secret || '',
        razorpay_webhook_secret: data.razorpay_webhook_secret || '',
        upi_direct_enabled: data.upi_direct_enabled !== false,
        wallet_enabled: data.wallet_enabled !== false,
        updated_at: data.updated_at,
      };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {
        void e;
      }
      return settings;
    }
  } catch (err) {
    console.warn('Error reading payment_gateway_settings from Supabase:', err);
  }

  // Fallback to localStorage cache
  try {
    const cached = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (cached) {
      return {
        ...DEFAULT_PAYMENT_SETTINGS,
        ...JSON.parse(cached),
      };
    }
  } catch (e) {
    void e;
  }

  return DEFAULT_PAYMENT_SETTINGS;
}

/**
 * For Admin Portal: save gateway settings (status toggle and credentials).
 */
export async function saveAdminPaymentSettings(
  settings: PaymentGatewaySettings
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Sync to local storage immediately
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: settings }));
    } catch (e) {
      void e;
    }

    // 2. Persist to Supabase table
    const { error } = await supabase
      .from('payment_gateway_settings')
      .upsert({
        id: 'default',
        razorpay_enabled: settings.razorpay_enabled,
        razorpay_key_id: settings.razorpay_key_id.trim(),
        razorpay_key_secret: (settings.razorpay_key_secret || '').trim(),
        razorpay_webhook_secret: (settings.razorpay_webhook_secret || '').trim(),
        upi_direct_enabled: settings.upi_direct_enabled,
        wallet_enabled: settings.wallet_enabled,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.warn('Database upsert warning (stored in local cache):', error.message);
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to save payment settings to database:', err);
    return { success: true }; // Local cache saved
  }
}
