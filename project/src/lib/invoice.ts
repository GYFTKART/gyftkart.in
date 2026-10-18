export interface InvoiceItem {
  id?: string;
  name: string;
  brand?: string;
  denomination: number;
  quantity: number;
  total: number;
  code?: string;
  recipientEmail?: string;
}

export interface InvoiceCustomer {
  name: string;
  email: string;
  phone?: string;
  userId?: string;
  address?: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  orderId: string;
  date: string;
  completedAt?: string | null;
  paymentMethod: string;
  paymentRef?: string | null;
  status: string;
  customer: InvoiceCustomer;
  items: InvoiceItem[];
  subtotal: number;
  discount?: number;
  tax?: number;
  totalAmount: number;
  category?: string;
  notes?: string;
}

/**
 * Robust utility to parse raw cart/order line items into structured invoice line items.
 */
export function extractInvoiceItems(rawItems: unknown, fallbackAmount: number): InvoiceItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [
      {
        id: '1',
        name: 'GyftKart Digital Gift Voucher',
        brand: 'GyftKart',
        denomination: fallbackAmount,
        quantity: 1,
        total: fallbackAmount,
      },
    ];
  }

  const items: InvoiceItem[] = [];
  rawItems.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') return;
    const it = raw as Record<string, unknown>;
    const brand = String(it.brand_name || it.brand || '').trim();
    const nameRaw = String(it.name || it.gift_card_name || it.brand_name || 'Gift Card').trim();
    const dup = brand && brand.toLowerCase().replace(/\s+/g, ' ') === nameRaw.toLowerCase().replace(/\s+/g, ' ');
    const displayName = dup ? `${brand} Gift Card` : [brand, nameRaw].filter(Boolean).join(' - ') || 'Gift Voucher';
    const denom = Number(it.amount ?? it.denomination ?? 0) || fallbackAmount;
    const qty = Math.max(1, Number(it.quantity ?? it.qty ?? 1));
    const total = denom * qty;

    items.push({
      id: String(idx + 1),
      name: displayName,
      brand: brand || 'GyftKart',
      denomination: denom,
      quantity: qty,
      total,
      code: it.gift_card_code ? String(it.gift_card_code) : undefined,
      recipientEmail: it.recipient_email ? String(it.recipient_email) : undefined,
    });
  });

  return items.length > 0
    ? items
    : [
        {
          id: '1',
          name: 'GyftKart Digital Gift Voucher',
          brand: 'GyftKart',
          denomination: fallbackAmount,
          quantity: 1,
          total: fallbackAmount,
        },
      ];
}
