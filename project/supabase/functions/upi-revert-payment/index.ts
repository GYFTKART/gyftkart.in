// supabase/functions/upi-revert-payment/index.ts
//
// Admin-side rollback / reversion of a confirmed (SUCCESS) UPI Direct session.
// Authenticated with admin JWT + admins row validation.
//
// When reverting:
// 1. If category === 'TOPUP':
//    - Atomically debits customer balance from `wallets` table.
//    - Appends compensating debit record to `wallet_transactions` ledger.
// 2. Updates `upi_payment_sessions`:
//    - Sets status to 'REVERTED' (or 'REJECTED' if legacy check constraint).
//    - Appends reason to `admin_remark = 'Reverted by Admin: <reason>'`.
//
//   POST (JWT) body { payment_id, order_id?, reason? }
//   <- { ok: true, session, balance_after? } | error

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
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Invalid or expired session' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: adminRow, error: adminSelectError } = await admin
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (adminSelectError) {
      return jsonResponse({ error: `Admin lookup failed: ${adminSelectError.message}` }, 500);
    }
    if (!adminRow) {
      return jsonResponse({ error: `Admins only (bearer: ${user.email ?? user.id})` }, 403);
    }

    const body = await req.json();
    const paymentId = body?.payment_id;
    const orderId = body?.order_id;
    if (!paymentId && !orderId) {
      return jsonResponse({ error: 'Missing payment_id or order_id' }, 400);
    }

    const rawReason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const reason = rawReason || 'Approved in error / payment not credited';

    // 1. Fetch target session
    let query = admin.from('upi_payment_sessions').select('*');
    if (paymentId) {
      query = query.eq('id', paymentId);
    } else {
      query = query.eq('order_id', orderId);
    }

    const { data: session, error: sessionError } = await query.maybeSingle();
    if (sessionError) {
      return jsonResponse({ error: `Session lookup failed: ${sessionError.message}` }, 500);
    }
    if (!session) {
      return jsonResponse({ error: 'Payment session not found' }, 404);
    }

    if (session.status !== 'SUCCESS') {
      return jsonResponse(
        { error: `Session is not confirmed (current status: ${session.status})` },
        400
      );
    }

    let balanceAfter: number | null = null;

    // 2. Step B & C: For TOPUP sessions, deduct wallet balance and add ledger record
    if (session.category === 'TOPUP') {
      const amountPaise = Number(session.amount_paise);
      if (!amountPaise || amountPaise <= 0) {
        return jsonResponse({ error: 'Invalid session amount' }, 400);
      }

      // Try wallet_debit RPC first
      const { data: rpcBalance, error: rpcError } = await admin.rpc('wallet_debit', {
        p_user: session.user_id,
        p_amount: amountPaise,
        p_category: 'REFUND',
        p_order: session.order_id,
        p_reference: `Reversal of top-up session ${session.order_id}`,
      });

      if (!rpcError && rpcBalance !== null && rpcBalance !== undefined) {
        balanceAfter = Number(rpcBalance);
      } else {
        // Fallback: direct table operations using service_role
        const { data: wallet, error: walletError } = await admin
          .from('wallets')
          .select('id, balance, monthly_added_amount')
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (walletError || !wallet) {
          return jsonResponse({ error: 'Customer wallet not found' }, 404);
        }

        if (wallet.balance < amountPaise) {
          return jsonResponse(
            {
              error: `Insufficient customer wallet balance to revert. Current balance: ₹${(
                wallet.balance / 100
              ).toFixed(2)}, required: ₹${(amountPaise / 100).toFixed(2)}`,
            },
            400
          );
        }

        const newBalance = wallet.balance - amountPaise;
        const newMonthly = Math.max(0, (wallet.monthly_added_amount ?? 0) - amountPaise);

        const { error: updWalletError } = await admin
          .from('wallets')
          .update({
            balance: newBalance,
            monthly_added_amount: newMonthly,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', session.user_id);

        if (updWalletError) {
          return jsonResponse(
            { error: `Wallet balance update failed: ${updWalletError.message}` },
            500
          );
        }

        const { error: txError } = await admin.from('wallet_transactions').insert({
          wallet_id: wallet.id,
          user_id: session.user_id,
          type: 'DEBIT',
          category: 'REFUND',
          amount: amountPaise,
          balance_after: newBalance,
          reference_id: `Reversal of top-up session ${session.order_id}`,
          order_id: session.order_id,
        });

        if (txError) {
          console.error('Failed to insert compensating wallet transaction:', txError);
        }

        balanceAfter = newBalance;
      }
    }

    // 3. Step A: Update upi_payment_sessions to REVERTED (or REJECTED if constraint limits)
    const remarkText = `Reverted by Admin: ${reason}`;
    const newRemark = session.admin_remark
      ? `${session.admin_remark} | ${remarkText}`
      : remarkText;

    let upd = await admin
      .from('upi_payment_sessions')
      .update({
        status: 'REVERTED',
        completed_at: new Date().toISOString(),
        admin_remark: newRemark,
      })
      .eq('id', session.id)
      .select('*')
      .maybeSingle();

    if (upd.error) {
      // If check constraint doesn't have REVERTED yet, fallback to REJECTED
      upd = await admin
        .from('upi_payment_sessions')
        .update({
          status: 'REJECTED',
          completed_at: new Date().toISOString(),
          admin_remark: newRemark,
        })
        .eq('id', session.id)
        .select('*')
        .single();
    }

    if (upd.error) {
      return jsonResponse(
        { error: `Session status update failed: ${upd.error.message}` },
        500
      );
    }

    return jsonResponse(
      {
        ok: true,
        session: upd.data,
        balance_after: balanceAfter,
        message: 'Session reverted and wallet balance adjusted successfully',
      },
      200
    );
  } catch (err) {
    console.error('upi-revert-payment crashed:', err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    );
  }
});
