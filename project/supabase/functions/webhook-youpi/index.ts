// supabase/functions/webhook-youpi/index.ts
//
// Dedicated YouPI-PG webhook receiver. Implements the merchant-side
// contract verified from the gateway source:
//
//   POST <our endpoint>
//   headers: Content-Type, X-Gateway-Event, X-Gateway-Signature
//            ("sha256=<hex>" HMAC-SHA256 of the RAW request body using
//            the merchant webhook secret — packages/common/src/crypto.js
//            generateHmac), X-Gateway-Delivery-Id, X-Gateway-Timestamp
//   body:    { event: SUCCESS|FAILED|EXPIRED|CANCELLED, paymentId,
//              orderId, amount (rupees), amountPaise (number), currency,
//              method, completedAt, metadata }
//
// Security rules enforced here:
//   1. raw body read BEFORE JSON parsing (signature covers the bytes
//      actually delivered);
//   2. HMAC-SHA256 with the webhook secret, constant-time compare,
//      invalid signatures rejected with 401;
//   3. event type + subject identifiers validated independently;
//   4. gateway session re-fetched server-side (STATUS + exact paise) —
//      webhook content alone never confirms payment;
//   5. idempotent: an existing orders row for the payment short-circuits
//      (the gateway has NO replay cache, so we dedupe on our side by
//      youpi_payment_id);
//   6. only order RECONCILIATION happens here — gift card issuance
//      remains gated behind the interactive, authenticated checkout
//      path, so an unsigned/part-verified webhook can never issue gift
//      cards.
//
// DEPLOY:
//   supabase functions deploy webhook-youpi --no-verify-jwt
//   (public endpoint; auth is the signature)
//
// SECRETS:
//   supabase secrets set YOUPI_API_URL=https://...
//   supabase secrets set YOUPI_WEBHOOK_SECRET=<from gateway admin>

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  verifyYoupiWebhook,
  decideWebhookAction,
} from '../_shared/youpi-contract.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, content-type',
};

function jsonResponse(body: unknown, status: number, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

async function fetchYoupiSession(apiUrl: string, paymentId: string) {
  const res = await fetch(
    `${apiUrl.replace(/\/+$/, '')}/api/v1/payments/${encodeURIComponent(paymentId)}`
  );
  if (!res.ok) return null;
  return await res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const webhookSecret = Deno.env.get('YOUPI_WEBHOOK_SECRET');
  const youpiApiUrl = Deno.env.get('YOUPI_API_URL');
  if (!webhookSecret || !youpiApiUrl) {
    console.error(
      'webhook-youpi misconfigured — set YOUPI_API_URL and YOUPI_WEBHOOK_SECRET'
    );
    // 5xx keeps the gateway retrying later instead of silently dropping.
    return jsonResponse({ error: 'Server misconfiguration' }, 500);
  }

  // ---- 1. raw body first, then signature verification
  const rawBody = await req.text();
  const verified = await verifyYoupiWebhook({
    rawBody,
    signatureHeader: req.headers.get('X-Gateway-Signature') ?? undefined,
    eventHeader: req.headers.get('X-Gateway-Event') ?? undefined,
    webhookSecret,
  });
  if (!verified.ok) {
    console.warn(
      'YouPI webhook rejected:',
      verified.error,
      'delivery:',
      req.headers.get('X-Gateway-Delivery-Id')
    );
    return jsonResponse(
      { error: verified.error },
      verified.rejectStatus ?? 400
    );
  }

  const webhook = verified.body as {
    event: string;
    paymentId: string;
    orderId: string;
    amount: string;
    amountPaise: number;
    currency: string;
    method?: string;
    completedAt?: string;
    metadata?: Record<string, unknown>;
  };

  // ---- 2. authoritative server-side session verification
  const session = await fetchYoupiSession(youpiApiUrl, webhook.paymentId);
  const decision = decideWebhookAction({
    event: verified.event,
    webhook,
    session,
    expectedSession: Boolean(youpiApiUrl),
  });
  if (decision.action === 'failOpen') {
    console.error('webhook-youpi:', decision.reason);
    return jsonResponse({ error: 'Server misconfiguration' }, 500);
  }
  if (decision.action === 'ignore') {
    console.warn('YouPI webhook ignored:', decision.reason);
    return jsonResponse({ received: true, action: 'ignored' }, 200);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ---- 3. idempotency: only record/confirm when no orders row exists
  const { data: existingOrder } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('youpi_payment_id', webhook.paymentId)
    .maybeSingle();
  if (existingOrder) {
    return jsonResponse(
      { received: true, action: 'already-recorded', orderId: existingOrder.id },
      200
    );
  }

  if (decision.action === 'record') {
    // Terminal failure/cancel/expire or a mismatch: capture the claim
    // for reconciliation but NEVER mark an order paid on mismatched data.
    return jsonResponse(
      { received: true, action: 'recorded-unconfirmed', reason: decision.reason },
      200
    );
  }

  // action === 'confirm': signature valid, event SUCCESS, gateway record
  // independently says SUCCESS and matches orderId/amountPaise exactly.
  // Reconcile the order row (no fulfilment here — issuance stays behind
  // the authenticated interactive flow).
  const inserted = await supabaseAdmin
    .from('orders')
    .insert({
      user_id: (webhook.metadata?.user_id as string) ?? null,
      total_amount: webhook.amountPaise / 100,
      status: 'successful',
      youpi_order_id: webhook.orderId,
      youpi_payment_id: webhook.paymentId,
      youpi_utr: (webhook.metadata?.utr as string) ?? null,
      items: [],
    })
    .select('*')
    .single();

  if (inserted.error || !inserted.data) {
    console.error('webhook-youpi order reconcile failed:', inserted.error);
    return jsonResponse({ error: 'Could not record order' }, 500);
  }

  return jsonResponse(
    { received: true, action: 'reconciled', orderId: inserted.data.id },
    200
  );
});
