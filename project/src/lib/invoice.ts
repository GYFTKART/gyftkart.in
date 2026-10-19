export interface InvoiceItem {
  id?: string;
  name: string;
  brand?: string;
  brandName?: string;
  denomination?: number;
  unitPrice?: number;
  quantity: number;
  total?: number;
  totalPrice?: number;
  code?: string;
  recipientEmail?: string;
}

export interface InvoiceCustomer {
  name: string;
  email: string;
  phone?: string;
  userId?: string;
  address?: string;
  customerType?: 'B2C' | 'B2B';
  companyName?: string;
  brandTradeName?: string;
  gstin?: string;
  pan?: string;
  billingAddress?: string;
  billingState?: string;
  billingCity?: string;
  billingPincode?: string;
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

export const COMPANY_DETAILS = {
  legalName: 'Tecticon Technologies Pvt. Ltd.',
  brandName: 'GyftKart',
  cin: 'U74999UP2019PTC112218',
  gstin: '09AAHCT1158J1Z2',
  pan: 'AAHCT1158J',
  address: 'H.NO.AN/25, Lautabagh, Azadnagar, Barabanki, Uttar Pradesh – 225001, India',
  state: 'Uttar Pradesh',
  stateCode: '09',
  supportEmail: 'support@gyftkart.in',
  billingEmail: 'accounts@gyftkart.in',
  website: 'www.gyftkart.in',
} as const;

export const GYFTKART_SUPPLIER_STATE_CODE = '09';
export const GYFTKART_SUPPLIER_STATE = 'Uttar Pradesh';

export const GST_STATE_MAP: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

export interface PlaceOfSupplyResolution {
  stateName: string;
  stateCode: string;
  placeOfSupplyLabel: string;
  isIntraState: boolean;
}

/**
 * Determine Place of Supply and whether the transaction represents Intra-State supply
 * (Customer in Uttar Pradesh / Code 09 -> CGST + SGST) or Inter-State supply
 * (Customer outside Uttar Pradesh -> IGST).
 */
export function resolvePlaceOfSupply(customer?: Partial<InvoiceCustomer>): PlaceOfSupplyResolution {
  const gstin = (customer?.gstin || '').trim();
  const rawState = (customer?.billingState || '').trim();

  let stateCode: string | null = null;
  let stateName: string | null = null;

  // 1. Check GSTIN prefix (first 2 digits of 15-char GSTIN)
  if (gstin.length >= 2) {
    const prefix = gstin.slice(0, 2);
    if (/^\d{2}$/.test(prefix)) {
      stateCode = prefix;
      if (GST_STATE_MAP[prefix]) {
        stateName = GST_STATE_MAP[prefix];
      }
    }
  }

  // 2. Check billingState if stateName is not yet resolved
  if (rawState) {
    const cleaned = rawState.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (
      cleaned === '09' ||
      cleaned === 'up' ||
      cleaned === 'uttarpradesh' ||
      rawState.match(/\b(up|uttar\s*pradesh)\b/i) ||
      rawState.startsWith('09')
    ) {
      stateCode = '09';
      stateName = 'Uttar Pradesh';
    } else {
      // Look up in GST_STATE_MAP
      for (const [code, name] of Object.entries(GST_STATE_MAP)) {
        const normName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (
          normName === cleaned ||
          rawState.toLowerCase().includes(name.toLowerCase()) ||
          rawState.startsWith(code)
        ) {
          stateCode = code;
          stateName = name;
          break;
        }
      }

      if (!stateName) {
        stateName = rawState;
        if (!stateCode) {
          const matchCode = rawState.match(/^\d{2}/);
          stateCode = matchCode ? matchCode[0] : null;
        }
      }
    }
  }

  // Default fallback if neither provided
  if (!stateName) {
    stateName = 'Uttar Pradesh';
    stateCode = '09';
  } else if (!stateCode) {
    stateCode = '99';
  }

  // Ensure 2-digit format if numeric
  if (/^\d$/.test(stateCode)) {
    stateCode = `0${stateCode}`;
  }

  const isIntraState =
    stateCode === '09' ||
    stateName.toLowerCase().includes('uttar pradesh') ||
    stateName.trim().toUpperCase() === 'UP';

  const placeOfSupplyLabel = stateCode
    ? `${stateName} (${stateCode})`
    : stateName;

  return {
    stateName,
    stateCode,
    placeOfSupplyLabel,
    isIntraState,
  };
}

export interface TaxBreakdown {
  taxableAmount: number;
  totalTax: number;
  isIntraState: boolean;
  taxRatePercent: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
}

/**
 * Calculates GST tax breakdown based on Place of Supply.
 * Intra-State (UP to UP): CGST + SGST (split equally from total applicable tax).
 * Inter-State (UP to outside UP): IGST (full applicable tax).
 */
export function calculateInvoiceTax(
  taxableAmount: number,
  totalTaxAmount: number = 0,
  customer?: Partial<InvoiceCustomer>,
  taxRatePercent: number = 0
): TaxBreakdown {
  const { isIntraState } = resolvePlaceOfSupply(customer);

  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (isIntraState) {
    cgstRate = Number((taxRatePercent / 2).toFixed(2));
    sgstRate = Number((taxRatePercent / 2).toFixed(2));
    cgstAmount = Number((totalTaxAmount / 2).toFixed(2));
    sgstAmount = Number((totalTaxAmount - cgstAmount).toFixed(2));
    igstRate = 0;
    igstAmount = 0;
  } else {
    igstRate = taxRatePercent;
    igstAmount = totalTaxAmount;
    cgstRate = 0;
    cgstAmount = 0;
    sgstRate = 0;
    sgstAmount = 0;
  }

  return {
    taxableAmount,
    totalTax: totalTaxAmount,
    isIntraState,
    taxRatePercent,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
  };
}
