// supabase/functions/create-razorpay-order/index.ts
//
// Runs before the Razorpay checkout modal opens. Creating the order
// has to happen server-side because it's authenticated with your Key
// SECRET (via Basic Auth to Razorpay's REST API) — that secret must
// never reach the browser, which is also why `verify-payment` needs a
// server-side signature check afterwards rather than trusting the
// frontend's word that payment succeeded.
//
// DEPLOY:
//   supabase functions deploy create-razorpay-order
//
// SECRETS (in addition to RAZORPAY_KEY_SECRET, which verify-payment
// already needs — this function reuses the same one, plus your key id):
//   supabase secrets set RAZORPAY_KEY_ID=your_razorpay_key_id

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

interface CreateOrderBody {
  amount: number; // rupees, not paise — converted below
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Same pattern as verify-payment: identify the caller from their
    // JWT rather than trusting anything in the body, so the order
    // (and its `notes.user_id`) can't be spoofed to someone else's
    // account.
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
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }

    const body: CreateOrderBody = await req.json();
    const { amount } = body;

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: 'Invalid amount' }, 400);
    }

    // SECURITY NOTE: this trusts the `amount` the frontend sends,
    // same as your original mock-checkout flow did. That's fine for
    // getting payments working end-to-end, but it means a tampered
    // client could ask Razorpay to charge less than the cart's real
    // total. verify-payment's signature check only proves the payment
    // matches THIS order_id/amount — it can't catch the order having
    // been created for the wrong amount in the first place. If that
    // matters for your product, the hardening step is: recompute the
    // total here from your `brands` table denominations (server-side
    // source of truth) instead of accepting `amount` directly, using
    // whatever cart-item shape you pass in. Flagging it rather than
    // building it now since it changes this function's request shape.
    const amountInPaise = Math.round(amount * 100);

    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — run `supabase secrets set ...`');
      return jsonResponse({ error: 'Server misconfiguration' }, 500);
    }

    // Razorpay's Orders API over plain fetch + Basic Auth — no need
    // for their Node SDK (which, like the `crypto` module, isn't a
    // safe assumption to import in a Deno edge function).
    const basicAuth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `receipt_${user.id.slice(0, 8)}_${Date.now()}`,
        notes: {
          user_id: user.id,
        },
      }),
    });

    const razorpayData = await razorpayRes.json();

    if (!razorpayRes.ok) {
      console.error('Razorpay order creation failed:', razorpayData);
      return jsonResponse(
        { error: razorpayData?.error?.description ?? 'Could not create Razorpay order' },
        502
      );
    }

    // RazorpayCheckoutButton.tsx reads `orderData.id`, `orderData.amount`,
    // and `orderData.currency` directly to build the Razorpay modal
    // options — so this returns Razorpay's own order fields as-is,
    // rather than renaming `id` to `order_id` the way an earlier draft
    // of this function did (that mismatch would have made the button
    // throw "Could not start payment" before the modal ever opened).
    return jsonResponse({ id: razorpayData.id, amount: razorpayData.amount, currency: razorpayData.currency }, 200);
  } catch (err) {
    console.error('create-razorpay-order crashed:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
