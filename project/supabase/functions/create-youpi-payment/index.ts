// supabase/functions/create-youpi-payment/index.ts
//
// YouPI-PG counterpart of create-razorpay-order. Runs before the YouPI
// checkout modal opens. The session is created server-side because the
// caller is authenticated via their Supabase JWT and because the
// merchant's gateway coordinates (YOUPI_API_URL / YOUPI_MERCHANT_ID)
// live in Supabase secrets, never in the browser.
//
// Gateway contract (apps/payment-api/src/routes/payments.routes.js):
//   POST <YOUPI_API_URL>/api/v1/payments
//   headers: Content-Type, X-Merchant-Id (optional — falls back to the
//            gateway's default merchant when omitted)
//   body:    { orderId, amount (RUPEES — the gateway converts to paise
//            itself), currency, customer{fullName,email,phoneNumber},
//            description, metadata, returnUrl }
//   201 ->   { paymentId, orderId, amount, amountPaise, currency,
//            status, queuePosition, checkoutUrl }
//
// DEPLOY:
//   supabase functions deploy create-youpi-payment
//
// SECRETS:
//   supabase secrets set YOUPI_API_URL=https://pay.gyftkart.in
//   supabase secrets set YOUPI_MERCHANT_ID=your_merchant_id (optional)

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

interface CreatePaymentBody {
  amount: number; // rupees
  customer?: { name?: string; email?: string; phone?: string };
}

interface YoupiCreateResponse {
  paymentId: string;
  orderId: string;
  amount: string;
  amountPaise: string;
  currency: string;
  status: string;
  checkoutUrl: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }

    const body: CreatePaymentBody = await req.json();
    const { amount, customer } = body;

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: 'Invalid amount' }, 400);
    }

    const youpiApiUrl = Deno.env.get('YOUPI_API_URL');
    const youpiMerchantId = Deno.env.get('YOUPI_MERCHANT_ID');

    if (!youpiApiUrl) {
      console.error('YOUPI_API_URL not set — run `supabase secrets set YOUPI_API_URL=...`');
      return jsonResponse({ error: 'Server misconfiguration' }, 500);
    }

    // Mint the authoritative order id here, server-side — same rule as
    // the Razorpay flow (never trust client identifiers).
    const orderId = `GYK-${user.id.slice(0, 8)}-${Date.now()}`;

    // Amount goes out in RUPEES; the gateway's toPaise() does the
    // conversion (64-bit integer minor units rule).
    const youpiRes = await fetch(`${youpiApiUrl.replace(/\/+$/, '')}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(youpiMerchantId ? { 'X-Merchant-Id': youpiMerchantId } : {}),
      },
      body: JSON.stringify({
        orderId,
        amount,
        currency: 'INR',
        customer: customer
          ? {
              fullName: customer.name ?? '',
              email: customer.email ?? '',
              phoneNumber: customer.phone ?? '',
            }
          : undefined,
        description: 'Gift card purchase',
        metadata: {
          user_id: user.id,
          source: 'gyftkart',
        },
        // Server-side backstop if the buyer closes the tab mid-session;
        // the primary success path is the checkout modal's postMessage
        // -> verify-youpi-payment.
        returnUrl: `${Deno.env.get('SITE_URL') ?? 'https://gyftkart.in'}/checkout`,
      }),
    });

    const youpiData = (await youpiRes.json()) as YoupiCreateResponse;

    if (!youpiRes.ok || !youpiData?.checkoutUrl) {
      console.error('YouPI payment session creation failed:', youpiData);
      return jsonResponse(
        { error: (youpiData as { error?: string })?.error ?? 'Could not create YouPI payment session' },
        502
      );
    }

    // YoupiCheckoutButton.tsx reads paymentId / orderId / checkoutUrl /
    // currency directly to drive window.Youpi.pay().
    return jsonResponse(
      {
        paymentId: youpiData.paymentId,
        orderId: youpiData.orderId,
        amount: youpiData.amount,
        currency: youpiData.currency,
        checkoutUrl: youpiData.checkoutUrl,
      },
      200
    );
  } catch (err) {
    console.error('create-youpi-payment crashed:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
