// supabase/functions/upi-reject-payment/index.ts
//
// Admin-side rejection of a pending (or suspicious) UPI Direct
// session. Same admin gating as upi-manual-confirm (Supabase JWT of a
// row in `admins`). Marks the session REJECTED with a mandatory admin
// remark recorded in admin_remark — evidence columns are preserved for
// the audit trail; it never deletes anything.
//
//   POST (JWT) body { payment_id, remark }
//   <- { ok: true } | error

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

const REMARK_MIN = 3;
const REMARK_MAX = 500;

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
    if (!body?.payment_id) return jsonResponse({ error: 'Missing payment_id' }, 400);

    const remark = typeof body?.remark === 'string' ? body.remark.trim() : '';
    if (remark.length < REMARK_MIN) {
      return jsonResponse({ error: `Rejection remark is mandatory (min ${REMARK_MIN} chars)` }, 400);
    }
    if (remark.length > REMARK_MAX) {
      return jsonResponse({ error: `Rejection remark too long (max ${REMARK_MAX} chars)` }, 400);
    }

    const upd = await admin
      .from('upi_payment_sessions')
      .update({
        status: 'REJECTED',
        completed_at: new Date().toISOString(),
        admin_remark: remark,
      })
      .eq('id', body.payment_id)
      .in('status', ['INITIATED', 'ACTIVE', 'AWAITING_PAYMENT', 'QR_GENERATED', 'PENDING_VERIFICATION'])
      .select('id')
      .single();
    if (upd.error || !upd.data) {
      return jsonResponse(
        { error: upd.error?.message ?? 'Not rejectable (already terminal)' },
        400
      );
    }

    // Also update any pending order status to rejected
    await admin
      .from('orders')
      .update({ status: 'rejected' })
      .eq('youpi_payment_id', body.payment_id);

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    console.error('upi-reject-payment crashed:', err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    );
  }
});
