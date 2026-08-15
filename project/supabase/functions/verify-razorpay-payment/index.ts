// supabase/functions/verify-razorpay-payment/index.ts
//
// Called by RazorpayCheckoutButton.tsx's `handler`, right after
// Razorpay's checkout modal reports success. That callback is never
// trusted by itself — this function recomputes the HMAC signature
// server-side with your Razorpay Key Secret, cross-checks the amount
// against what Razorpay actually recorded for this order, and only
// then writes the `orders` row your revenue trigger / admin panel
// reads from.
//
// Response shape matches what RazorpayCheckoutButton.tsx expects:
//   { order: OrderRow }   on success
//   { error: string }     on failure
//
// DEPLOY:
//   supabase functions deploy verify-razorpay-payment
//
// SECRETS (reuses the same RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET your
// create-razorpay-order function needs — SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are auto-injected into every edge function):
//   supabase secrets set RAZORPAY_KEY_ID=your_key_id
//   supabase secrets set RAZORPAY_KEY_SECRET=your_key_secret

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
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  total_amount: number; // rupees — matches what RazorpayCheckoutButton sends
  items: unknown[];
}

// HMAC-SHA256 over `${order_id}|${payment_id}` via the Web Crypto API
// (crypto.subtle). This is the piece that's almost certainly what was
// crashing before: Deno Deploy doesn't ship Node's `crypto` module, so
// `import crypto from 'crypto'` throws immediately on invocation —
// before any response is ever returned — which is exactly what
// produces "Edge Function returned a non-2xx status code" on the
// frontend and leaves your `orders` table (and admin panel) at zero.
async function verifySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${orderId}|${paymentId}`));
  const generated = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return generated === signature;
}

// Cross-checks the amount Razorpay actually recorded for this order
// against what the client claims it charged. The signature alone only
// proves the payment matches this order_id — it doesn't prove the
// order was created for the right amount in the first place, so a
// tampered `total_amount` in the request body would otherwise sail
// through untouched.
async function fetchRazorpayOrder(orderId: string, keyId: string, keySecret: string) {
  const basicAuth = btoa(`${keyId}:${keySecret}`);
  const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  if (!res.ok) {
    throw new Error('Could not confirm order details with Razorpay');
  }
  return res.json() as Promise<{ amount: number; status: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Identify the user if there is one. Guest checkout is part of
    // your existing design (CheckoutPage does `session?.id ?? null`),
    // so a missing/invalid session is NOT rejected here — it just
    // means an anonymous order, same as your client-side
    // `issueGiftCards()` already assumes. Only a completely missing
    // Authorization header is treated as an error, since supabase-js
    // always sends at least the anon key.
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
    const userId = user?.id ?? null; // null = guest checkout

    const body: VerifyBody = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, total_amount, items } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return jsonResponse({ error: 'Missing Razorpay verification fields' }, 400);
    }
    if (typeof total_amount !== 'number' || total_amount <= 0) {
      return jsonResponse({ error: 'Invalid total_amount' }, 400);
    }

    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — run `supabase secrets set ...`');
      return jsonResponse({ error: 'Server misconfiguration' }, 500);
    }

    // ---- 1. Signature check — proves this payment_id genuinely
    // belongs to this order_id and was signed with your secret.
    const validSignature = await verifySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpayKeySecret
    );
    if (!validSignature) {
      console.warn('Signature mismatch for order', razorpay_order_id);
      return jsonResponse({ error: 'Invalid payment signature' }, 400);
    }

    // ---- 2. Amount cross-check against Razorpay's own record.
    const razorpayOrder = await fetchRazorpayOrder(razorpay_order_id, razorpayKeyId, razorpayKeySecret);
    const expectedPaise = Math.round(total_amount * 100);
    if (razorpayOrder.amount !== expectedPaise) {
      console.error(
        `Amount mismatch on order ${razorpay_order_id}: Razorpay recorded ${razorpayOrder.amount}, client sent ${expectedPaise}`
      );
      return jsonResponse({ error: 'Amount mismatch — payment not accepted' }, 400);
    }

    // ---- 3. Write the order with the service-role client, so an RLS
    // policy on `orders` can't silently swallow the insert — the
    // classic way you'd see "captured in Razorpay" but 0 rows here.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Idempotency: a retried request for a payment already recorded
    // returns the existing row instead of inserting a duplicate order
    // (and, since CheckoutPage's onSuccess issues gift cards off this
    // response, would otherwise double-issue them too).
    const { data: existing } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('razorpay_payment_id', razorpay_payment_id)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ order: existing }, 200);
    }

    const { data: order, error: insertError } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: userId,
        total_amount,
        status: 'successful',
        razorpay_order_id,
        razorpay_payment_id,
        items,
      })
      .select('*')
      .single();

    if (insertError || !order) {
      console.error('Order insert failed:', insertError);
      return jsonResponse({ error: insertError?.message ?? 'Could not record order' }, 500);
    }

    return jsonResponse({ order }, 200);
  } catch (err) {
    console.error('verify-razorpay-payment crashed:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
