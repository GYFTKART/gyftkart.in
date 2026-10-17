// supabase/functions/observe-upi-payments/index.ts
//
// UPI Direct observer: the replacement for YouPI-PG's resident Gmail
// observer, made serverless-safe. Invoked on a schedule (cron-job.org
// free tier or Supabase pg_cron per migration 20261017203010) and by
// admins; it:
//   1. authorizes via `Authorization: Bearer <OBSERVER_SECRET>`
//   2. lists unread bank-alert Gmail messages via the stored OAuth
//      access token (refreshed from the stored refresh token on 401)
//   3. parses each message with the shared parser (credit-only,
//      debit-guarded, UTR extraction, bank-sender allowlist)
//   4. attributes ONE parsed credit to at most ONE open session:
//      exact paise match, session still ACTIVE/expiring, oldest first
//   5. unique bank_ref index blocks replay (two alerts sharing a UTR
//      can confirm at most one session — the second update fails)
//   6. marks lapsed sessions EXPIRED (lazy expiry, replaces the
//      resident sweepTimer)
//
// Secrets:
//   OBSERVER_SECRET — invocation bearer (в vault/table set by admin)
//   Google-OAuth tokens: stored in table upi_observer_tokens
//     (id, access_token, refresh_token, expires_at) — service-role only.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  parseBankCreditEmail,
  isKnownBankSender,
} from '../_shared/upi-direct.js';

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

const GMAIL_LIST_URL =
  'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=';

async function refreshAccessToken(
  admin: SupabaseClient,
  row: { refresh_token: string },
  clientId: string,
  clientSecret: string
) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: row.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token refresh failed');
  await admin
    .from('upi_observer_tokens')
    .update({
      access_token: data.access_token,
      expires_at: new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString(),
    })
    .eq('refresh_token', row.refresh_token);
  return data.access_token as string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('OBSERVER_SECRET');
  const auth = req.headers.get('Authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return jsonResponse({ error: 'Unauthorized observer' }, 401);
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: tokenRow } = await admin
      .from('upi_observer_tokens')
      .select('access_token, refresh_token, expires_at')
      .limit(1)
      .maybeSingle();
    if (!tokenRow) {
      return jsonResponse({ error: 'Observer not connected (no Gmail token)' }, 503);
    }

    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;
    let accessToken = tokenRow.access_token;
    if (
      !accessToken ||
      new Date(tokenRow.expires_at ?? 0).getTime() < Date.now()
    ) {
      accessToken = await refreshAccessToken(
        admin,
        tokenRow,
        clientId,
        clientSecret
      );
    }

    const query = encodeURIComponent(
      'is:unread (subject:(credited OR "credited to" OR "money received" OR UPI)) newer_than:1d'
    );
    const listRes = await fetch(`${GMAIL_LIST_URL}${query}&maxResults=25`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (listRes.status === 401) {
      accessToken = await refreshAccessToken(admin, tokenRow, clientId, clientSecret);
    }
    if (!listRes.ok) {
      return jsonResponse({ error: `Gmail list failed (${listRes.status})` }, 502);
    }
    const { messages } = (await listRes.json()) as { messages?: { id: string }[] };

    let creditsSeen = 0;
    let confirmed = 0;
    let skipped = 0;

    for (const m of messages ?? []) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) { skipped++; continue; }
      const msg = await msgRes.json();
      const headers = (msg.payload?.headers ?? []) as { name: string; value: string }[];
      const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value ?? '';
      const subject =
        headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';
      // body: prefer text parts
      const bodyPart =
        (msg.payload?.parts ?? []).find(
          (p: { mimeType?: string }) => (p.mimeType ?? '').startsWith('text/plain')
        ) ?? msg.payload;
      const decoded = bodyPart?.body?.data
        ? atob(
            bodyPart.body.data.replace(/-/g, '+').replace(/_/g, '/')
          ).toString()
        : '';

      if (!isKnownBankSender(from)) { skipped++; continue; }
      const parsed = parseBankCreditEmail({ subject, body: decoded, from });
      if (!parsed.credited) { skipped++; continue; }
      creditsSeen += 1;

      // Attribution: exact paise, oldest open session first, mark SUCCESS
      // atomically — bank_ref uniqueness performs the replay guard.
      const { data: candidates } = await admin
        .from('upi_payment_sessions')
        .select('id')
        .eq('amount_paise', String(parsed.amountPaise))
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: true })
        .limit(5);

      let attributed = false;
      for (const c of candidates ?? []) {
        const update = await admin
          .from('upi_payment_sessions')
          .update({
            status: 'SUCCESS',
            bank_ref: parsed.bankRef,
            verification_level: 'GMAIL',
            completed_at: new Date().toISOString(),
          })
          .eq('id', c.id)
          .select('id')
          .single();
        if (!update.error) {
          confirmed += 1;
          attributed = true;
          break;
        }
      }
      if (!attributed) skipped += 1;
    }

    // Lazy expiry sweep (replaces the resident daemon).
    const { data: lapsed } = await admin
      .from('upi_payment_sessions')
      .select('id')
      .eq('status', 'ACTIVE')
      .lt('expires_at', new Date().toISOString());
    for (const row of lapsed ?? []) {
      await admin
        .from('upi_payment_sessions')
        .update({ status: 'EXPIRED' })
        .eq('id', row.id);
    }

    return jsonResponse(
      { ok: true, creditsSeen, confirmed, skipped, expired: (lapsed ?? []).length },
      200
    );
  } catch (err) {
    console.error('observe-upi-payments crashed:', err);
    return jsonResponse({ error: 'Observer crashed' }, 500);
  }
});
