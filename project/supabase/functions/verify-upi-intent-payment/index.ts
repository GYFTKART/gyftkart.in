// supabase/functions/verify-upi-intent-payment/index.ts
//
// UPI Direct: authoritative verification + order reconciliation.
//   POST (auth: Supabase JWT) body { order_id, payment_id, total_amount }
//   <- { status: 'PENDING' | 'EXPIRED' } | { order: orderRow } | error
//
// Guarantees (shared decision matrix in _shared/upi-direct.js):
//   * session ownership = authenticated buyer;
//   * exact paise match vs the client's claimed total;
//   * orderId consistency; INR-only;
//   * idempotent orders row (service-role insert w/ existing-row check,
//     youpi_* columns preferred, razorpay_* fallback columns supported
//     so it works even while migration 20261017093000 is pending);
//   * issuance is NOT done here — the client only receives the verified
//     order row and the DB-level unique issuance barrier
//     (uq_purchases_one_batch_per_payment) prevents double issuance.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decideUpiSession, rupeesToPaise } from '../_shared/upi-direct.js';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    const user_id = user ? user.id : null;

    const body = await req.json();
    const { order_id, payment_id, total_amount } = body;
    if (!order_id || !payment_id) {
      return jsonResponse({ error: 'Missing verification fields' }, 400);
    }
    const expectedPaise = rupeesToPaise(total_amount);
    if (expectedPaise === null) {
      return jsonResponse({ error: 'Invalid total_amount' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: session } = await admin
      .from('upi_payment_sessions')
      .select('*')
      .eq('id', payment_id)
      .maybeSingle();

    const decision = decideUpiSession({
      session,
      claimed: { user_id: user_id ?? undefined, order_id },
      expectedPaise: Number(expectedPaise),
    });

    if (decision.action === 'reject') {
      console.warn('verify-upi-intent:', decision.reason, payment_id);
      return jsonResponse({ error: decision.reason }, 400);
    }
    if (decision.action === 'expired' || decision.action === 'pending') {
      // Idempotent expiry transition while polling; never triggers
      // issuance.
      if (decision.action === 'expired' && session?.status === 'ACTIVE') {
        await admin
          .from('upi_payment_sessions')
          .update({ status: 'EXPIRED' })
          .eq('id', payment_id);
      }
      return jsonResponse(
        { status: decision.action === 'expired' ? 'EXPIRED' : 'PENDING' },
        200
      );
    }

    // session.status === 'SUCCESS'

    // Idempotency: first orders row wins (both gateway row styles).
    const lookupIds = ['youpi_payment_id', 'razorpay_payment_id'];
    for (const col of lookupIds) {
      const { data: existing, error } = await admin
        .from('orders')
        .select('*')
        .eq(col, payment_id)
        .maybeSingle();
      if (!error && existing) {
        return jsonResponse({ order: existing }, 200);
      }
    }

    const payloads = [
      {
        user_id: session!.user_id,
        total_amount: Number(expectedPaise) / 100,
        status: 'successful',
        youpi_order_id: session!.order_id,
        youpi_payment_id: payment_id,
        youpi_utr: session!.bank_ref ?? null,
        items: session!.items,
      },
      {
        user_id: session!.user_id,
        total_amount: Number(expectedPaise) / 100,
        status: 'successful',
        razorpay_order_id: session!.order_id,
        razorpay_payment_id: payment_id,
        items: session!.items,
      },
    ];

    for (const payload of payloads) {
      const { data: order, error } = await admin
        .from('orders')
        .insert(payload)
        .select('*')
        .single();
      if (!error && order) {
        return jsonResponse({ order }, 200);
      }
    }

    console.error('verify-upi-intent order insert failed');
    return jsonResponse({ error: 'Could not record order' }, 500);
  } catch (err) {
    console.error('verify-upi-intent-payment crashed:', err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    );
  }
});
