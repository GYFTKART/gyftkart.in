// supabase/functions/upi-direct-status/index.ts
//
// UPI Direct: lightweight status point for the checkout UI's poll loop.
//   POST (auth: Supabase JWT) body { order_id, payment_id, total_amount }
//   <- { status: 'PENDING'|'EXPIRED'|'SUCCESS', upiUri }, or error.
// Reads-only; SUCCESS transitions are performed by the observer or the
// admin confirm endpoint (this endpoint never escalates a session).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decideUpiSession, rupeesToPaise, buildUpiUri } from '../_shared/upi-direct.js';

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
    if (!user) return jsonResponse({ error: 'Invalid or expired session' }, 401);

    const body = await req.json();
    const { order_id, payment_id, total_amount } = body;
    const expectedPaise = rupeesToPaise(total_amount);
    if (!payment_id || expectedPaise === null) {
      return jsonResponse({ error: 'Invalid request' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: config } = await admin
      .from('upi_gateway_config')
      .select('vpa, payee_name')
      .eq('id', true)
      .maybeSingle();

    const { data: session } = await admin
      .from('upi_payment_sessions')
      .select('id, order_id, user_id, amount_paise, currency, status, expires_at, bank_ref, category')
      .eq('id', payment_id)
      .maybeSingle();

    const decision = decideUpiSession({
      session,
      claimed: { user_id: user.id, order_id },
      expectedPaise: Number(expectedPaise),
    });

    if (decision.action === 'reject') {
      return jsonResponse({ error: decision.reason }, 400);
    }
    if (decision.action === 'pending' && session && session.status === 'ACTIVE' &&
        new Date(session.expires_at).getTime() < Date.now()) {
      return jsonResponse({ status: 'EXPIRED' }, 200);
    }

    return jsonResponse(
      {
        status:
          decision.action === 'confirm' ? 'SUCCESS' :
          decision.action === 'expired' ? 'EXPIRED' : 'PENDING',
        upiUri: config
          ? buildUpiUri({
              vpa: config.vpa,
              payeeName: config.payee_name,
              amountPaise: session!.amount_paise,
              note: `GyftKart ${session!.order_id}`,
            })
          : undefined,
      },
      200
    );
  } catch (err) {
    console.error('upi-direct-status crashed:', err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    );
  }
});
