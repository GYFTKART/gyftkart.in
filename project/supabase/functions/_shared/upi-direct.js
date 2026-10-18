// supabase/functions/_shared/upi-direct.js
//
// Pure, runtime-agnostic helpers for the Supabase-native direct-UPPI
// flow ("UPI Direct"): bank credit-email parsing, session-decision
// logic, and UPI deep-link construction. Plain ES module so Edge
// Functions import it and node --test executes the same logic locally.
//
// SAFETY RULES:
//   * only "credited in to your account / money received" style phrases
//     admit a payment — debits, reversals and balances are ignored;
//   * buyer/sender identities are never used as proof, only refs;
//   * bank_ref (UTR) is the replay guard: exactly one session per UTR;
//   * every check is exact paise; no rounding drift ever.

export const OPEN_STATUSES = ['INITIATED', 'ACTIVE'];
export const TERMINAL_STATUSES = ['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'];

const CREDIT_RX =
  /\b(?:credited|received|money received|received in|deposited in|added to)\b/i;
const DEBIT_RX =
  /\b(?:debited|spent|payment failed|transaction failed|reversed|chargeback|withdrawn)\b/i;
const AMOUNT_RX = /(?:rs\.?|inr|₹)\s*([0-9]{1,3}(?:,[0-9]{2,3})*|[0-9]+)(?:\.([0-9]{1,2}))?\b/i;
const REF_RX =
  /\b(?:rrn|utr|upi ref(?:erence)?(?: no\.?)?|ref(?:erence)? no)\.?\s*[:=-]?\s*([0-9]{9,18})\b/i;

/** rupees (number) -> exact paise integer (BigInt-safe rounding) */
export function rupeesToPaise(rupees) {
  const n = Number(rupees);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** "1,234.50" | "1234.5" -> paise int | null */
function parseRupeeText(text) {
  const m = AMOUNT_RX.exec((text ?? '').replace(/[ ,]/g, (c) => (c === ',' ? '' : c)));
  if (!m) return null;
  const whole = m[1];
  const frac = (m[2] ?? '').padEnd(2, '0').slice(0, 2);
  const value = `${whole}.${frac || '00'}`;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [w, f = '00'] = value.split('.');
  const paise = BigInt(w) * 100n + BigInt(f);
  return paise > 0n ? paise : null;
}

/**
 * Bank credit alert parser (email alerts; the SMS path is out of scope
 * without an owned device, see report).
 * @returns {{ amountPaise: bigint, bankRef: string|null, credited: true } |
 *                   { credited: false, reason: string } | null}
 */
export function parseBankCreditEmail({ subject, body, from } = {}) {
  if (!from) return null;
  const text = `${subject ?? ''}\n${body ?? ''}`;
  // Debit/mixed-activity alerts are never proof of a credit — even when
  // a credit phrase also appears (e.g. reversal mails re-referencing an
  // earlier credit). Conservative by design.
  if (DEBIT_RX.test(text)) {
    return { credited: false, reason: 'DEBIT_PHRASE_PRESENT' };
  }
  if (!CREDIT_RX.test(text)) {
    return { credited: false, reason: 'NO_CREDIT_PHRASE' };
  }
  const amountPaise = parseRupeeText(text);
  if (!amountPaise) {
    return { credited: false, reason: 'NO_AMOUNT' };
  }
  const refM = REF_RX.exec(text);
  const bankRef = refM ? refM[1] : null;
  return { credited: true, amountPaise, bankRef };
}

/** Sender allowlist of major Indian banks' alert domains (suffix match). */
const BANK_SENDER_SUFFIXES = [
  '@icicibank.com',
  '@hdfcbank.net',
  '@hdfcbank.com',
  '@sbi.co.in',
  '@sbicard.com',
  '@axisbank.com',
  '@kotak.com',
  '@paytm.com',
  '@gpay.com',
  '@google.com',
  '@ybl.co.in',
  '@okaxis.com',
  '@okhdfcbank.com',
  '@okicici.com',
  '@oksbi.com',
];

export function isKnownBankSender(from, allowlist = BANK_SENDER_SUFFIXES) {
  const lower = String(from ?? '').toLowerCase();
  return allowlist.some((suffix) => lower.endsWith(suffix));
}

/**
 * Decision matrix for the authoritative reconcile step
 * (verify-upi-intment-payment / observe-upi-payments / manual confirm).
 * @returns {{ action: 'confirm'|'pending'|'expired'|'reject', reason?: string }}
 */
export function decideUpiSession({
  session,
  claimed,
  expectedPaise,
  now = new Date(),
}) {
  if (!session) return { action: 'reject', reason: 'SESSION_NOT_FOUND' };
  if (claimed.user_id && claimed.user_id !== session.user_id) {
    return { action: 'reject', reason: 'OWNERSHIP_MISMATCH' };
  }
  if (claimed.order_id && claimed.order_id !== session.order_id) {
    return { action: 'reject', reason: 'ORDER_MISMATCH' };
  }
  if (expectedPaise !== undefined && Number(session.amount_paise) !== Number(expectedPaise)) {
    return { action: 'reject', reason: 'AMOUNT_MISMATCH' };
  }
  if (session.currency !== 'INR') {
    return { action: 'reject', reason: 'CURRENCY_MISMATCH' };
  }
  const status = String(session.status).toUpperCase();
  if (status === 'SUCCESS') return { action: 'confirm' };
  if (TERMINAL_STATUSES.includes(status)) {
    return { action: 'reject', reason: `SESSION_${status}` };
  }
  if (new Date(session.expires_at).getTime() < now.getTime()) {
    return { action: 'expired', reason: 'SESSION_EXPIRED' };
  }
  if (OPEN_STATUSES.includes(status)) {
    return { action: 'pending', reason: `SESSION_${status}` };
  }
  return { action: 'reject', reason: 'SESSION_UNKNOWN_STATUS' };
}

/** UPI deep link + copyable payload string (payments URI v1.0). */
export function buildUpiUri({ vpa, payeeName, amountPaise, note }) {
  if (!vpa || !payeeName || !amountPaise) return null;
  const rupees = (Number(amountPaise) / 100).toFixed(2);
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: rupees,
    cu: 'INR',
  });
  if (note) params.set('tn', note.slice(0, 48));
  return `upi://pay?${params.toString()}`;
}
