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
    // Server-side buyer fallback (metadata.name > full_name > email prefix)
    const derivedBuyer = {
      name:
        (user.user_metadata?.name as string | undefined) ??
        (user.user_metadata?.full_name as string | undefined) ??
        user.email?.split('@')[0] ??
        'User',
      email: user.email ?? '',
    };

    const body = await req.json();

    // VOUCHER (default) keeps the original flow: server-priced in rupees,
    // items mandatory. TOPUP carries the paisa amount from the client
    // (validated 1..10000000 here) and needs no items.
    const category = body.category === 'TOPUP' ? 'TOPUP' : 'VOUCHER';
    let amountPaise: number | null = null;
    if (category === 'TOPUP') {
      const n = Number(body.amount);
      amountPaise =
        Number.isInteger(n) && n >= 1 && n <= 10000000 ? n : null;
      if (!amountPaise) return jsonResponse({ error: 'Invalid amount' }, 400);
    } else {
      amountPaise = rupeesToPaise(body.amount);
      if (!amountPaise) return jsonResponse({ error: 'Invalid amount' }, 400);
      if (!Array.isArray(body.items) || body.items.length === 0) {
        return jsonResponse({ error: 'Missing cart items' }, 400);
      }
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Intent-time quota check: the SECURITY DEFINER wallet RPC must not
    // see a top-up slip past the ₹10,000/month cap at confirm time.
    let wallet: { monthly_added_amount: number; last_reset_month: string } | null = null;
    if (category === 'TOPUP') {
      const { data: ensured, error: walletErr } = await admin
        .rpc('ensure_wallet', { p_user: user.id })
        .single();
      if (walletErr || !ensured) {
        console.error('ensure_wallet failed:', walletErr);
        return jsonResponse(
          { error: walletErr?.message ?? 'Could not resolve wallet' },
          500
        );
      }
      wallet = ensured as unknown as {
        monthly_added_amount: number;
        last_reset_month: string;
      };
      const currentMonth = new Date().toISOString().slice(0, 8) + '01';
      const monthlyUsed =
        wallet.last_reset_month === currentMonth
          ? Number(wallet.monthly_added_amount)
          : 0;
      const remaining = 10000000 - monthlyUsed;
      if (Number(amountPaise) > remaining) {
        return jsonResponse(
          {
            error: 'Top-up limit for this month exceeded',
            remaining,
          },
          400
        );
      }
    }

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
        items: category === 'TOPUP' ? [] : body.items,
        buyer:
          body.buyer && typeof body.buyer === 'object'
            ? body.buyer
            : derivedBuyer,
        status: 'AWAITING_PAYMENT',
        expires_at: expiresAt,
        category,
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
