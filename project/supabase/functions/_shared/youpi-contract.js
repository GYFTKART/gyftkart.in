// supabase/functions/_shared/youpi-contract.js
//
// Pure, runtime-agnostic helpers implementing the YouPI-PG gateway
// contract as verified from its source (packages/common/src/crypto.js,
// packages/core/src/webhook-engine.js, packages/common/src/enums.js).
// Plain ES module (no Deno/node-only imports) so Edge Functions can
// import it and node --test can execute the unit tests against the
// exact same logic.
//
// Webhook wire format (WebhookEngine.dispatch):
//   JSON body: { event, paymentId, orderId, amount (rupees string),
//                amountPaise (number), currency, method, completedAt,
//                metadata }
//   headers:   X-Gateway-Event: <event>
//              X-Gateway-Signature: sha256=<hex>
//              X-Gateway-Delivery-Id: <uuid>   (NO gateway-side replay
//                                               cache — we must be
//                                               idempotent ourselves)
//   signature: HMAC-SHA256(webhookSecret, rawBodyString), lowercase hex

export const YOUPI_WEBHOOK_EVENTS = Object.freeze([
  'SUCCESS',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
]);

export async function generateYoupiHmac(rawBody, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(rawBody)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string comparison (XOR accumulate; no early return on
 * mismatch). Both strings are compared at the same stride to avoid
 * length-based timing internals.
 */
export function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i % ab.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
  }
  return diff === 0;
}

/**
 * Verifies an incoming webhook.
 * @returns {Promise<{ ok: true, event: string, body: object } |
 *                   { ok: false, error: string, rejectStatus?: number }>}
 */
export async function verifyYoupiWebhook({
  rawBody,
  signatureHeader,
  eventHeader,
  deliveryId,
  webhookSecret,
}) {
  if (!signatureHeader) {
    return { ok: false, error: 'Missing X-Gateway-Signature', rejectStatus: 401 };
  }
  const match = /^sha256=([a-f0-9]{64})$/.exec(signatureHeader);
  if (!match) {
    return { ok: false, error: 'Invalid signature format', rejectStatus: 401 };
  }
  const expected = await generateYoupiHmac(rawBody, webhookSecret);
  if (!timingSafeEqualHex(match[1], expected)) {
    return { ok: false, error: 'Invalid webhook signature', rejectStatus: 401 };
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: 'Malformed webhook payload', rejectStatus: 400 };
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !YOUPI_WEBHOOK_EVENTS.includes(body.event) ||
    typeof body.paymentId !== 'string' ||
    !body.paymentId ||
    typeof body.orderId !== 'string' ||
    !body.orderId ||
    body.currency !== 'INR'
  ) {
    return { ok: false, error: 'Invalid webhook payload fields', rejectStatus: 400 };
  }

  if (eventHeader && eventHeader !== body.event) {
    return { ok: false, error: 'Event header/payload mismatch', rejectStatus: 400 };
  }

  return { ok: true, event: body.event, body };
}

/**
 * Authoritative webhook decision: only SUCCESS events, and every field
 * must agree with the independently fetched gateway session record.
 * order/payment identity: gateway session wins, we never trust claimed
 * identifiers for anything but a cross-check.
 * @returns {{ action: 'confirm'|'record'|'ignore', reason?: string }}
 */
export function decideWebhookAction({
  event,
  webhook,
  session,
  expectedSession,
}) {
  if (!expectedSession) {
    return { action: 'failOpen', reason: 'YouPI_API_URL not configured' };
  }
  if (session.orderId !== webhook.orderId) {
    return { action: 'record', reason: 'order id mismatch with gateway session' };
  }
  if (webhook.currency !== session.currency) {
    return { action: 'record', reason: 'currency mismatch' };
  }
  if (session.amountPaise === undefined || session.amountPaise === null) {
    return { action: 'failOpen', reason: 'gateway record missing amount' };
  }
  if (Number(webhook.amountPaise) !== Number(session.amountPaise)) {
    return { action: 'record', reason: 'amount mismatch with gateway session' };
  }

  if (event === 'SUCCESS') {
    const sessionStatus = String(
      session.internalStatus ?? session.status ?? ''
    ).toUpperCase();
    if (sessionStatus !== 'SUCCESS') {
      return {
        action: 'ignore',
        reason: `gateway session not SUCCESS (${sessionStatus}) — treating as unverified`,
      };
    }
    return { action: 'confirm' };
  }

  // FAILED / EXPIRED / CANCELLED never trigger fulfilment.
  return { action: 'record', reason: `terminal ${event} recorded` };
}
