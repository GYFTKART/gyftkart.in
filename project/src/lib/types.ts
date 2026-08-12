export type TextOnColor = 'white' | 'dark';

export interface Brand {
  id: string;
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  color: string;
  color2: string;
  text_on_color: TextOnColor;
  offer_badge: string;
  discount_percent: number;
  denominations: number[];
  min_amount: number;
  max_amount: number;
  trending: boolean;
  popularity: number;
  created_at: string;
  is_active: boolean;
  occasions: string[];
  logo_url: string;
  banner_url: string;
}

export interface CartItem {
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

/**
 * The shape of a row in the Supabase `cart_items` table. This is the
 * same field set as `CartItem` — since our cart fields are already
 * snake_case — plus the ownership and bookkeeping columns that only
 * exist server-side and never need to reach the cart UI.
 */
export interface DbCartItem extends CartItem {
  user_id: string;
  created_at: string;
  updated_at: string;
}

export type LedgerTransactionType = 'credit' | 'debit';
export type CompanyTransactionType = 'revenue' | 'brand_payout' | 'expense' | 'refund';

export interface CustomerLedgerEntry {
  id: string;
  user_id: string;
  transaction_type: LedgerTransactionType;
  amount: number;
  description: string;
  reference_order_id: string | null;
  created_at: string;
}

export interface CompanyLedgerEntry {
  id: string;
  transaction_type: CompanyTransactionType;
  amount: number;
  description: string;
  reference_id: string | null;
  created_at: string;
}

export interface Purchase {
  id: string;
  session_id: string;
  /** Null for guest checkouts — only set when a logged-in account made the purchase. */
  user_id: string | null;
  brand_slug: string;
  brand_name: string;
  brand_color: string;
  brand_color2: string;
  amount: number;
  quantity: number;
  recipient_name: string;
  recipient_email: string;
  recipient_phone: string;
  message: string;
  occasion: string;
  gift_card_code: string;
  status: string;
  balance: number;
  created_at: string;
}