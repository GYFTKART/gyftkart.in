// supabase/functions/upi-observer-oauth/index.ts
//
// One-time Gmail observer connect for the UPI Direct flow.
//   POST (auth: Supabase JWT of a row in `admins`) body:
//     { code, redirect_uri }                       — exchange auth code
//     { refresh_token }                            — store directly
// Either path stores the refresh token in `upi_observer_tokens`
// (service-role only). The observe-upi-payments function then rotates
// access tokens automatically.
//
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

async function storeToken(admin: SupabaseClient, refreshToken: string, accessToken?: string, expiresIn?: number) {
  await admin.from('upi_observer_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('upi_observer_tokens').insert({
    refresh_token: refreshToken,
    access_token: accessToken ?? null,
    expires_at: expiresIn
      ? new Date(Date.now() + (Number(expiresIn) - 60) * 1000).toISOString()
      : null,
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

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: adminRow } = await admin
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (!adminRow) return jsonResponse({ error: 'Admins only' }, 403);

    const body = await req.json();

    if (body.refresh_token) {
      await storeToken(admin, String(body.refresh_token));
      return jsonResponse({ ok: true, mode: 'refresh_token' }, 200);
    }

    const { code, redirect_uri } = body;
    if (!code || !redirect_uri) {
      return jsonResponse({ error: 'Provide code+redirect_uri or refresh_token' }, 400);
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!,
        redirect_uri: String(redirect_uri),
        grant_type: 'authorization_code',
        access_type: 'offline',
        prompt: 'consent',
      }),
    });
    const data = await tokenRes.json();
    if (!data.refresh_token) {
      return jsonResponse(
        { error: data.error_description ?? data.error ?? 'No refresh token returned' },
        400
      );
    }

    await storeToken(admin, data.refresh_token, data.access_token, data.expires_in);
    return jsonResponse({ ok: true, mode: 'authorization_code' }, 200);
  } catch (err) {
    console.error('upi-observer-oauth crashed:', err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    );
  }
});
