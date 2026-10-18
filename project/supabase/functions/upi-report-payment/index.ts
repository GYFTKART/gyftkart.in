// supabase/functions/upi-report-payment/index.ts
//
// Customer-submitted UTR + screenshot evidence for their own ACTIVE
// UPI Direct session. Review material only — submission NEVER confirms
// a payment; the admin confirm endpoint remains the sole issuer of
// SUCCESS (admin JWT + admins row + bank-verified UTR/dup checks).
//
//   POST (Supabase JWT) body { payment_id, utr (12 digits) }
//   <- { ok: true } | error
//
// Storage upload of the screenshot happens client-side directly into
// bucket `upi-payment-proofs` under `user-<uid>/...` (RLS enforced),
// then this function records the proof_path from the client payload.

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

const UTR_RX = /^\d{12}$/;

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
    if (!user) return jsonResponse({ error: 'Invalid or expired session' }, 401);

    const body = await req.json();
    const { payment_id, utr, proof_path } = body;
    if (!payment_id) return jsonResponse({ error: 'Missing payment_id' }, 400);
    if (typeof utr !== 'string' || !UTR_RX.test(utr.trim())) {
      return jsonResponse({ error: 'UTR must be exactly 12 digits' }, 400);
    }
    if (proof_path != null && typeof proof_path !== 'string') {
      return jsonResponse({ error: 'Invalid proof_path' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Ownership: only the session owner can attach a report.
    const { data: session } = await admin
      .from('upi_payment_sessions')
      .select('id, user_id, order_id, amount_paise, items, category, status, customer_utr')
      .eq('id', payment_id)
      .maybeSingle();
    if (!session) return jsonResponse({ error: 'SESSION_NOT_FOUND' }, 404);
    if (session.user_id !== user.id) return jsonResponse({ error: 'OWNERSHIP_MISMATCH' }, 403);
    if (!['INITIATED', 'ACTIVE', 'AWAITING_PAYMENT', 'QR_GENERATED', 'PENDING_VERIFICATION'].includes(session.status)) {
      return jsonResponse({ error: `SESSION_${session.status}` }, 400);
    }

    // Guard: same UTR already bound to a DIFFERENT session (replay try).
    if (session.customer_utr && session.customer_utr !== utr.trim()) {
      return jsonResponse({ error: 'A different UTR is already reported for this session' }, 409);
    }
    const dup = await admin
      .from('upi_payment_sessions')
      .select('id')
      .eq('customer_utr', utr.trim())
      .neq('id', payment_id)
      .limit(1);
    if (!dup.error && (dup.data ?? []).length > 0) {
      return jsonResponse({ error: 'This UTR is already reported on another payment' }, 409);
    }

    const upd = await admin
      .from('upi_payment_sessions')
      .update({
        customer_utr: utr.trim(),
        proof_path: proof_path ?? null,
        status: 'PENDING_VERIFICATION',
      })
      .eq('id', payment_id)
      .select('id')
      .single();
    if (upd.error || !upd.data) {
      console.error('upi-report-payment update failed:', upd.error);
      return jsonResponse({ error: 'Could not record submission' }, 500);
    }

    // Insert or update pending order row in public.orders for non-TOPUP (voucher) checkouts
    if (session.category !== 'TOPUP') {
      const { data: existingOrder } = await admin
        .from('orders')
        .select('id')
        .or(`youpi_payment_id.eq.${payment_id},youpi_order_id.eq.${session.order_id}`)
        .maybeSingle();

      const orderAmount = Number(session.amount_paise) / 100;

      if (existingOrder) {
        await admin
          .from('orders')
          .update({
            status: 'PENDING_VERIFICATION',
            youpi_utr: utr.trim(),
            total_amount: orderAmount,
          })
          .eq('id', existingOrder.id);
      } else {
        await admin
          .from('orders')
          .insert({
            user_id: session.user_id,
            total_amount: orderAmount,
            status: 'PENDING_VERIFICATION',
            youpi_order_id: session.order_id,
            youpi_payment_id: payment_id,
            youpi_utr: utr.trim(),
            items: session.items,
          });
      }
    }

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    console.error('upi-report-payment crashed:', err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    );
  }
});
