// supabase/functions/verify-youpi-payment/index.ts
//
// Called by YoupiCheckoutButton.tsx's handler after the YouPI checkout
// modal reports success. The browser event is never trusted by itself —
// this function re-checks the payment session server-to-server against
// the YouPI Payment API (the authoritative record) and only then writes
// the `orders` row your revenue trigger / admin panel reads from.
//
// Gateway contract (apps/payment-api/src/routes/payments.routes.js):
//   GET <YOUPI_API_URL>/api/v1/payments/:paymentId  (no auth required)
//   200 -> { paymentId, orderId, amount, amountPaise (string), currency,
//            status, internalStatus, method, completedAt, metadata }
//
// Response shape (matches YoupiCheckoutButton.tsx):
//   { order: orderRow }   on success
//   { error: string }     on failure
//
// DEPLOY:
//   supabase functions deploy verify-youpi-payment
//
// SECRETS:
//   supabase secrets set YOUPI_API_URL=https://pay.gyftkart.in
//   (YOUPI_WEBHOOK_SECRET is only needed by a future server-to-server
//   webhook function; the SDK hands the browser no signature, so there
//   is nothing to HMAC-verify on this path.)
//
// NOTE on order columns: the live `orders` table was created with
// razorpay_order_id / razorpay_payment_id columns. This function
// prefers dedicated youpi_order_id / youpi_payment_id / youpi_utr
// columns (see supabase/migrations/20261017093000_youpi_payment_columns.sql)
// and falls back to the razorpay-named columns when the migration hasn't
// been applied yet, so order recording works before the migration lands.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface VerifyBody {
  order_id: string;
  payment_id: string;
  utr?: string | null;
  total_amount: number; // rupees
  items: unknown[];
}

async function fetchYoupiPayment(apiUrl: string, paymentId: string) {
  const res = await fetch(
    `${apiUrl.replace(/\/+$/, '')}/api/v1/payments/${encodeURIComponent(paymentId)}`
  );
  if (!res.ok) {
    throw new Error('Could not confirm payment with YouPI gateway');
  }
  return res.json() as Promise<{
    paymentId: string;
    orderId: string;
    amountPaise: string;
    status: string;
    internalStatus?: string;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Guest checkout is part of the design (CheckoutPage does
    // `session?.id ?? null`), so an invalid session just means an
    // anonymous order. Only a missing Authorization header is an error,
    // since supabase-js always sends at least the anon key.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    const userId = user?.id ?? null;

    const body: VerifyBody = await req.json();
    const { order_id, payment_id, utr, total_amount, items } = body;

    if (!order_id || !payment_id) {
      return jsonResponse({ error: 'Missing YouPI verification fields' }, 400);
    }
    if (typeof total_amount !== 'number' || total_amount <= 0) {
      return jsonResponse({ error: 'Invalid total_amount' }, 400);
    }

    const youpiApiUrl = Deno.env.get('YOUPI_API_URL');
    if (!youpiApiUrl) {
      console.error('YOUPI_API_URL not set — run `supabase secrets set YOUPI_API_URL=...`');
      return jsonResponse({ error: 'Server misconfiguration' }, 500);
    }

    // ---- 1. Server-to-server status check: the gateway's own record of
    // this session must say SUCCESS and match the expected amount.
    // Without this, a tampered client could post "SUCCESS" straight to
    // this function with no payment behind it.
    const youpiPayment = await fetchYoupiPayment(youpiApiUrl, payment_id);
    const paymentStatus = (youpiPayment.internalStatus ?? youpiPayment.status ?? '').toUpperCase();
    if (paymentStatus !== 'SUCCESS') {
      console.warn('YouPI session not successful:', payment_id, paymentStatus);
      return jsonResponse({ error: 'Payment not confirmed by gateway' }, 400);
    }

    // ---- 2. Amount cross-check (gateway stores paise as a string).
    const expectedPaise = Math.round(total_amount * 100);
    if (Number(youpiPayment.amountPaise) !== expectedPaise) {
      console.error(
        `Amount mismatch on YouPI session ${payment_id}: gateway recorded ${youpiPayment.amountPaise}, client sent ${expectedPaise}`
      );
      return jsonResponse({ error: 'Amount mismatch — payment not accepted' }, 400);
    }

    // ---- 3. Idempotent insert via the service-role client so an RLS
    // policy can't silently swallow the row.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Idempotency: a retried request for a payment already recorded
    // returns the existing row instead of inserting a duplicate order
    // (and, since CheckoutPage's onSuccess issues gift cards off this
    // response, would otherwise double-issue them too).
    const idColumns = ['youpi_payment_id', 'razorpay_payment_id'];
    let existing: Record<string, unknown> | null = null;
    for (const col of idColumns) {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq(col, payment_id)
        .maybeSingle();
      if (!error) {
        existing = data;
        break;
      }
    }

    if (existing) {
      return jsonResponse({ order: existing }, 200);
    }

    // Prefer the youpi_* columns (post-migration); fall back to the
    // razorpay_* columns the table was created with so the order is
    // never lost while the migration is pending.
    const payloads = [
      {
        user_id: userId,
        total_amount,
        status: 'successful',
        youpi_order_id: order_id,
        youpi_payment_id: payment_id,
        youpi_utr: utr ?? null,
        items,
      },
      {
        user_id: userId,
        total_amount,
        status: 'successful',
        razorpay_order_id: order_id,
        razorpay_payment_id: payment_id,
        items,
      },
    ];

    let order: Record<string, unknown> | null = null;
    let lastError: { message: string } | null = null;
    for (const payload of payloads) {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .insert(payload)
        .select('*')
        .single();
      if (!error && data) {
        order = data;
        break;
      }
      lastError = error;
    }

    if (!order) {
      console.error('Order insert failed:', lastError);
      return jsonResponse({ error: lastError?.message ?? 'Could not record order' }, 500);
    }

    return jsonResponse({ order }, 200);
  } catch (err) {
    console.error('verify-youpi-payment crashed:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
