// supabase/functions/upi-reopen-payment/index.ts
//
// Admin-side re-approval / re-open of an accidentally rejected (REJECTED) UPI Direct session.
// Authenticated with admin JWT + admins row validation.
//
// When approving:
// 1. If category === 'TOPUP':
//    - Atomically credits customer balance in `wallets` table.
//    - Appends positive credit record to `wallet_transactions` ledger.
// 2. If category !== 'TOPUP':
//    - Reconciles `orders` row.
//    - Fulfills gift cards by creating `purchases` rows if not present.
// 3. Updates `upi_payment_sessions`:
//    - Sets status to 'CONFIRMED' (or 'SUCCESS' if legacy check constraint).
//    - Updates `admin_remark = <reason>` (default 'Approved after review').
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

function genCode(): string {
  const seg = () => Math.random().toString(16).slice(2, 6).toUpperCase();
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
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
    const reason = rawReason || 'Approved after review';

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

    if (session.status !== 'REJECTED') {
      return jsonResponse(
        { error: `Session is not rejected (current status: ${session.status})` },
        400
      );
    }

    let balanceAfter: number | null = null;

    // 2. For TOPUP sessions, credit wallet balance and add ledger record
    if (session.category === 'TOPUP') {
      const amountPaise = Number(session.amount_paise);
      if (!amountPaise || amountPaise <= 0) {
        return jsonResponse({ error: 'Invalid session amount' }, 400);
      }

      // Try wallet_credit RPC first
      const { data: rpcBalance, error: rpcError } = await admin.rpc('wallet_credit', {
        p_user: session.user_id,
        p_amount: amountPaise,
        p_reference: `${reason}: ${session.order_id}`,
        p_order: session.order_id,
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

        if (walletError) {
          return jsonResponse({ error: 'Customer wallet lookup failed' }, 500);
        }

        let currentWallet = wallet;
        if (!currentWallet) {
          const { data: newW, error: createWError } = await admin
            .from('wallets')
            .insert({ user_id: session.user_id, balance: 0, monthly_added_amount: 0 })
            .select('*')
            .single();
          if (createWError) {
            return jsonResponse({ error: 'Customer wallet creation failed' }, 500);
          }
          currentWallet = newW;
        }

        const newBalance = Number(currentWallet.balance || 0) + amountPaise;
        const newMonthly = Number(currentWallet.monthly_added_amount || 0) + amountPaise;

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
          wallet_id: currentWallet.id,
          user_id: session.user_id,
          type: 'CREDIT',
          category: 'TOPUP',
          amount: amountPaise,
          balance_after: newBalance,
          reference_id: `${reason}: ${session.order_id}`,
          order_id: session.order_id,
        });

        if (txError) {
          console.error('Failed to insert positive credit wallet transaction:', txError);
        }

        balanceAfter = newBalance;
      }
    } else {
      // 3. For VOUCHER sessions, reconcile orders row and fulfill gift cards
      const { data: existingOrder } = await admin
        .from('orders')
        .select('id')
        .or(`upi_payment_id.eq.${session.id},razorpay_payment_id.eq.${session.id},upi_order_id.eq.${session.order_id}`)
        .maybeSingle();

      if (!existingOrder) {
        await admin.from('orders').insert({
          user_id: session.user_id,
          total_amount: Number(session.amount_paise) / 100,
          status: 'successful',
          upi_order_id: session.order_id,
          upi_payment_id: session.id,
          upi_utr: session.bank_ref || session.customer_utr || null,
          items: session.items,
        });
      }

      // Check if purchases exist
      const { data: existingPurchases } = await admin
        .from('purchases')
        .select('id')
        .or(`issued_under_payment_id.eq.${session.id},session_id.eq.${session.order_id}`)
        .limit(1);

      if (!existingPurchases || existingPurchases.length === 0) {
        const items = Array.isArray(session.items) ? session.items : [];
        if (items.length > 0) {
          const totalRupees = Number(session.amount_paise) / 100;
          const rows = items.map((raw) => {
            const it = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
            const brandName = String(it.brand_name || it.brand || it.name || 'Gift Card').trim();
            const brandSlug = String(it.brand_slug || it.slug || brandName.toLowerCase().replace(/\s+/g, '-'));
            const denom = Number(it.amount || it.denomination || 0) || totalRupees;
            const qty = Math.max(1, Number(it.quantity || it.qty || 1));
            return {
              session_id: session.order_id,
              user_id: session.user_id,
              brand_slug: brandSlug,
              brand_name: brandName,
              brand_color: String(it.brand_color || '#6b21a8'),
              brand_color2: String(it.brand_color2 || '#3b0764'),
              amount: denom,
              quantity: qty,
              recipient_name: String(it.recipient_name || ''),
              recipient_email: String(it.recipient_email || ''),
              recipient_phone: String(it.recipient_phone || ''),
              message: String(it.message || ''),
              occasion: String(it.occasion || ''),
              gift_card_code: genCode(),
              status: 'active',
              balance: denom * qty,
              issued_under_payment_id: session.id,
            };
          });

          const { error: purchaseError } = await admin.from('purchases').insert(rows);
          if (purchaseError) {
            console.warn('Purchases creation error (continuing):', purchaseError);
          }
        }
      }
    }

    // 4. Update upi_payment_sessions to CONFIRMED (fallback to SUCCESS if legacy constraint)
    let upd = await admin
      .from('upi_payment_sessions')
      .update({
        status: 'CONFIRMED',
        completed_at: new Date().toISOString(),
        admin_remark: reason,
      })
      .eq('id', session.id)
      .select('*')
      .maybeSingle();

    if (upd.error) {
      upd = await admin
        .from('upi_payment_sessions')
        .update({
          status: 'SUCCESS',
          completed_at: new Date().toISOString(),
          admin_remark: reason,
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
        message: 'Session approved and processed successfully',
      },
      200
    );
  } catch (err) {
    console.error('upi-reopen-payment crashed:', err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    );
  }
});
