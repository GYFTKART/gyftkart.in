// supabase/functions/upi-manual-confirm/index.ts
//
// UPI Direct fallback confirmation for a merchant admin who has seen
// the money in the bank (e.g. observer is not yet connected, or the
// bank alert mail is delayed). Authoritative but explicitly manual:
//
//   POST (auth: Supabase JWT of a row in `admins`) body:
//     { order_id | payment_id, bank_ref (UTR, mandatory), amount_rupees }
//   -> marks the session SUCCESS (verification_level 'MANUAL') and
//      reconciles the orders row (same path/барьеры as verify).
//
// Guards:
//   * caller must be an admin (admins table row);
//   * exact amount match against the session;
//   * bank_ref mandatory + unique (partial index enforces no replay);
//   * only INITIATED/ACTIVE sessions can be confirmed;
//   * reconciliation is the same idempotent insert as verify.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

async function reconcileOrder(admin: SupabaseClient, session: Record<string, unknown>, paymentId: string) {
  const lookupIds = ['youpi_payment_id', 'razorpay_payment_id'];
  for (const col of lookupIds) {
    const { data: existing } = await admin
      .from('orders')
      .select('*')
      .eq(col, paymentId)
      .maybeSingle();
    if (existing) {
      if (existing.status !== 'successful') {
        const { data: updated } = await admin
          .from('orders')
          .update({
            status: 'successful',
            youpi_utr: session.bank_ref ?? session.customer_utr ?? existing.youpi_utr,
          })
          .eq('id', existing.id)
          .select('*')
          .single();
        return { order: updated ?? existing, err: null as string | null };
      }
      return { order: existing, err: null as string | null };
    }
  }

  const payloads = [
    {
      user_id: session.user_id,
      total_amount: (session.amount_paise as number) / 100,
      status: 'successful',
      youpi_order_id: session.order_id,
      youpi_payment_id: paymentId,
      youpi_utr: session.bank_ref ?? session.customer_utr ?? null,
      items: session.items,
    },
    {
      user_id: session.user_id,
      total_amount: (session.amount_paise as number) / 100,
      status: 'successful',
      razorpay_order_id: session.order_id,
      razorpay_payment_id: paymentId,
      items: session.items,
    },
  ];
  for (const payload of payloads) {
    const { data, error } = await admin
      .from('orders')
      .insert(payload)
      .select('*')
      .single();
    if (!error && data) return { order: data, err: null };
  }
  return { order: null, err: 'ORDER_INSERT_FAILED' };
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

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: adminRow, error: adminSelectError } = await admin
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (adminSelectError) return jsonResponse({ error: `Admin lookup failed: ${adminSelectError.message}` }, 500);
    if (!adminRow) return jsonResponse({ error: `Admins only (bearer: ${user.email ?? user.id}, id: ${user.id})` }, 403);

    const body = await req.json();
    const { order_id, payment_id, bank_ref, amount_rupees } = body;
    if (!bank_ref || typeof bank_ref !== 'string') {
      return jsonResponse({ error: 'bank_ref (UTR) is mandatory for manual confirmation' }, 400);
    }
    const expectedPaise = rupeesToPaise(amount_rupees);
    if (expectedPaise === null) return jsonResponse({ error: 'Invalid amount' }, 400);

    let session = null;
    if (payment_id) {
      const { data } = await admin
        .from('upi_payment_sessions')
        .select('*')
        .eq('id', payment_id)
        .maybeSingle();
      session = data;
    } else if (order_id) {
      const { data } = await admin
        .from('upi_payment_sessions')
        .select('*')
        .eq('order_id', order_id)
        .maybeSingle();
      session = data;
    }

    const decision = decideUpiSession({
      session,
      claimed: { order_id: order_id ?? session?.order_id },
      expectedPaise: Number(expectedPaise),
    });
    if (decision.action !== 'pending' && decision.action !== 'confirm') {
      return jsonResponse({ error: decision.reason ?? 'Not confirmable' }, 400);
    }

    // ============ TOPUP path: credit the wallet, NO voucher issuance ====
    // No orders/gift_cards rows exist or get created for top-ups; the
    // ledger row is the money trail. Response mirrors the voucher
    // variants ({ order } for vouchers, { credited } for top-ups).
    const isTopup = session?.category === 'TOPUP';
    if (isTopup) {
      if (decision.action === 'confirm' && session.bank_ref) {
        // Idempotent replay guard for already-credited top-ups.
        const { data: existingTx } = await admin
          .from('wallet_transactions')
          .select('balance_after, amount')
          .eq('order_id', session.order_id)
          .eq('type', 'CREDIT')
          .eq('category', 'TOPUP')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingTx) {
          return jsonResponse(
            {
              credited: {
                order_id: session.order_id,
                amount_paise: session.amount_paise,
                balance_after: existingTx.balance_after,
              },
              note: 'already credited',
            },
            200
          );
        }
      }

      if (decision.action === 'pending') {
        const upd = await admin
          .from('upi_payment_sessions')
          .update({
            status: 'SUCCESS',
            bank_ref,
            verification_level: 'MANUAL',
            completed_at: new Date().toISOString(),
          })
          .eq('id', session!.id)
          .select('id, order_id, user_id, amount_paise, category')
          .single();
        if (upd.error) {
          // most likely bank_ref replay (unique index) — surface cleanly
          return jsonResponse(
            { error: `Confirmation rejected: ${upd.error.message}` },
            409
          );
        }
        session = upd.data;
      }

      const { data: balanceAfter, error: creditError } = await admin.rpc(
        'wallet_credit',
        {
          p_user: session!.user_id,
          p_amount: session!.amount_paise,
          p_reference: session!.order_id,
          p_order: session!.order_id,
        }
      );
      if (creditError || balanceAfter === null || balanceAfter === undefined) {
        return jsonResponse(
          { error: creditError?.message ?? 'Wallet credit failed' },
          500
        );
      }

      return jsonResponse(
        {
          credited: {
            order_id: session!.order_id,
            amount_paise: session!.amount_paise,
            balance_after: Number(balanceAfter),
          },
        },
        200
      );
    }

    // ================= VOUCHER path: exactly today's behavior ============
    if (decision.action === 'confirm' && session.bank_ref) {
      const { data: existingOrder } = await admin
        .from('orders')
        .select('*')
        .eq('youpi_payment_id', session.id)
        .maybeSingle();
      if (existingOrder) {
        return jsonResponse({ order: existingOrder, note: 'already confirmed' }, 200);
      }
    }

    if (decision.action === 'pending') {
      const upd = await admin
        .from('upi_payment_sessions')
        .update({
          status: 'SUCCESS',
          bank_ref,
          verification_level: 'MANUAL',
          completed_at: new Date().toISOString(),
        })
        .eq('id', session!.id)
        .select('*')
        .single();
      if (upd.error) {
        // most likely bank_ref replay (unique index) — surface cleanly
        return jsonResponse(
          { error: `Confirmation rejected: ${upd.error.message}` },
          409
        );
      }
      session = upd.data;
    }

    const { order, err } = await reconcileOrder(admin, session, session!.id);
    if (err) return jsonResponse({ error: err }, 500);

    return jsonResponse({ order }, 200);
  } catch (err) {
    console.error('upi-manual-confirm crashed:', err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    );
  }
});
