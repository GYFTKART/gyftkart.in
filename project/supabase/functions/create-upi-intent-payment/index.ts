// supabase/functions/create-upi-intent-payment/index.ts
//
// UPI Direct: creates an authenticated, server-priced session row so the
// buyer can pay the merchant's UPI VPA directly and the credit is later
// verified server-side (observer or manual admin confirmation).
//
//   POST (auth: Supabase JWT) body { amount (rupees), items, buyer? }
//   -> { paymentId, orderId, amount, upiUri, vpa, payeeName, expiresInMinutes }
//
// Secrets/Vars: none needed beyond the session row's config table.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildUpiUri, rupeesToPaise } from '../_shared/upi-direct.js';

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

const MAX_SESSION_MINUTES = 30;

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
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Invalid or expired session' }, 401);

    const body = await req.json();
    const amountPaise = rupeesToPaise(body.amount);
    if (!amountPaise) return jsonResponse({ error: 'Invalid amount' }, 400);
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return jsonResponse({ error: 'Missing cart items' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: config, error: configErr } = await admin
      .from('upi_gateway_config')
      .select('vpa, payee_name')
      .eq('id', true)
      .maybeSingle();
    if (configErr || !config?.vpa) {
      console.error('upi config missing:', configErr);
      return jsonResponse({ error: 'UPI Direct is not configured yet' }, 503);
    }

    const orderId = `UPI-${user.id.slice(0, 8)}-${Date.now()}`;
    const expiresAt = new Date(
      Date.now() + MAX_SESSION_MINUTES * 60 * 1000
    ).toISOString();

    const insert = await admin
      .from('upi_payment_sessions')
      .insert({
        user_id: user.id,
        order_id: orderId,
        amount_paise: Number(amountPaise),
        items: body.items,
        buyer: body.buyer ?? null,
        status: 'ACTIVE',
        expires_at: expiresAt,
      })
      .select('id, order_id, amount_paise')
      .single();

    if (insert.error || !insert.data) {
      console.error('upi session insert failed:', insert.error);
      return jsonResponse(
        { error: insert.error?.message ?? 'Could not create payment' },
        500
      );
    }

    const upiUri = buildUpiUri({
      vpa: config.vpa,
      payeeName: config.payee_name,
      amountPaise: insert.data.amount_paise,
      note: `GyftKart ${orderId}`,
    });

    return jsonResponse(
      {
        paymentId: insert.data.id,
        orderId: insert.data.order_id,
        amount: (insert.data.amount_paise / 100).toFixed(2),
        upiUri,
        vpa: config.vpa,
        payeeName: config.payee_name,
        expiresInMinutes: MAX_SESSION_MINUTES,
      },
      200
    );
  } catch (err) {
    console.error('create-upi-intent-payment crashed:', err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    );
  }
});
