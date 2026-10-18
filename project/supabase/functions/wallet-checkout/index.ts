// supabase/functions/wallet-checkout/index.ts
//
// GyftKart Wallet v1 — pay the entire cart from the wallet balance.
// Auth chain and scaffold are the shared Edge Function pattern (same
// CORS + jsonResponse helpers as the upi-* fns); NO admin gate — this
// is a customer surface.
//
//   POST (auth: Supabase JWT) body { items }  — the SAME cart shape the
//   checkout posts to the gateway intent fns (amount in rupees,
//   quantity, recipient fields…).
//
// Semantics:
//   * total is computed SERVER-SIDE from items — the client total is
//     never trusted;
//   * ensure_wallet first, then ONE atomic wallet_debit RPC call
//     (FOR UPDATE + ledger insert inside the single SQL transaction);
//     'Insufficient balance' from the RPC raise maps to 400;
//   * on debit success the order row is written the same way
//     upi-manual-confirm's reconcile helper does (same tables/fields;
//     no gateway-id columns are touched — the orders schema has no
//     payment_method column, so nothing is invented);
//   * NO upi_payment_sessions row is created — no QR session exists;
//   * no partial redemption in v1 (full-balance debit only).
//
// Gift-card ISSUANCE: upi-manual-confirm's "issue" path writes ONLY the
// orders row (voucher rows in `purchases` are generated client-side via
// genCode() in CheckoutPage in every gateway flow). wallet-checkout
// therefore returns the order row and the checkout reuses the exact
// same client issuance path — identical rows, identical codes.

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
    const items = body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return jsonResponse({ error: 'Invalid items' }, 400);
    }

    // Compute the cart total SERVER-SIDE: amount (rupees) × quantity per
    // item, in paise. Never trust a client-supplied total.
    let totalPaise = 0;
    for (const raw of items) {
      const it = raw as Record<string, unknown> | null;
      if (!it || typeof it !== 'object') {
        return jsonResponse({ error: 'Invalid items' }, 400);
      }
      const amount = Number(it.amount);
      const quantity = Number(it.quantity);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
        return jsonResponse({ error: 'Invalid items' }, 400);
      }
      totalPaise += Math.round(amount * 100) * quantity;
    }
    if (totalPaise <= 0) {
      return jsonResponse({ error: 'Invalid amount' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Safe default wallet (creates the row when missing) before the
    // single atomic debit.
    const { error: ensureError } = await admin.rpc('ensure_wallet', { p_user: user.id });
    if (ensureError) {
      console.error('ensure_wallet failed:', ensureError);
      return jsonResponse({ error: ensureError.message ?? 'Could not resolve wallet' }, 500);
    }

    const orderId = `WALLET-${user.id.slice(0, 8)}-${Date.now()}`;

    // ONE atomic hop: row-lock + balance check + ledger row, all inside
    // the wallet_debit SQL transaction. 'Insufficient balance' from the
    // RPC raise maps here (400 per spec).
    const { data: balanceAfter, error: debitError } = await admin.rpc('wallet_debit', {
      p_user: user.id,
      p_amount: totalPaise,
      p_category: 'VOUCHER_PURCHASE',
      p_order: orderId,
      p_reference: null,
    });
    if (debitError || balanceAfter === null || balanceAfter === undefined) {
      const message = debitError?.message ?? 'Wallet debit failed';
      const isInsufficient = message.toLowerCase().includes('insufficient balance');
      return jsonResponse(
        { error: isInsufficient ? 'Insufficient balance' : message },
        isInsufficient ? 400 : 500
      );
    }

    // Same orders write as the manual-confirm reconcile: identical
    // tables/fields; gateway-id columns stay NULL (the orders schema has
    // no payment_method column to tag 'WALLET' with — not invented here).
    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert({
        user_id: user.id,
        total_amount: totalPaise / 100,
        status: 'successful',
        items,
      })
      .select('*')
      .single();
    if (orderError || !order) {
      // Money already moved and the ledger row carries the same
      // WALLET order id — surface explicitly so the admin path can
      // reconcile manually instead of silently eating the debit.
      console.error('orders insert failed after debit:', orderError);
      return jsonResponse(
        {
          error: 'Order row failed after debit — wallet ledger holds the reference; contact support',
          order_id: orderId,
        },
        500
      );
    }

    return jsonResponse(
      {
        ok: true,
        order_id: orderId,
        balance_after: Number(balanceAfter),
        order,
      },
      200
    );
  } catch (err) {
    console.error('wallet-checkout crashed:', err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    );
  }
});
