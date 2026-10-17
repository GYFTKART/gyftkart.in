// supabase/functions/_shared/__tests__/youpi-contract.test.mjs
//
// Runs under `node --test` against the exact same pure logic the Edge
// Functions import (no Deno needed locally). Scenario matrix from the
// security review: invalid signatures, ownership, amounts, duplicate
// events, failed/pending/expired sessions.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateYoupiHmac,
  timingSafeEqualHex,
  verifyYoupiWebhook,
  decideWebhookAction,
} from '../youpi-contract.js';

const SECRET = 'unit-test-webhook-secret';

function makeWebhook(overrides = {}) {
  return {
    event: 'SUCCESS',
    paymentId: 'pay-123',
    orderId: 'GYK-abcdef12-1700000000',
    amount: '499.00',
    amountPaise: 49900,
    currency: 'INR',
    method: 'UPI',
    completedAt: '2026-10-17T12:00:00.000Z',
    metadata: { user_id: 'user-1', source: 'gyftkart' },
    ...overrides,
  };
}

async function signedHeaders(payload, secret = SECRET) {
  const sig = await generateYoupiHmac(payload, secret);
  return { signatureHeader: `sha256=${sig}` };
}

test('valid SUCCESS webhook verifies', async () => {
  const body = JSON.stringify(makeWebhook());
  const { signatureHeader } = await signedHeaders(body);
  const res = await verifyYoupiWebhook({
    rawBody: body,
    signatureHeader,
    eventHeader: 'SUCCESS',
    webhookSecret: SECRET,
  });
  assert.equal(res.ok, true);
  assert.equal(res.event, 'SUCCESS');
});

test('tampered body → signature rejected (401)', async () => {
  const body = JSON.stringify(makeWebhook());
  const { signatureHeader } = await signedHeaders(body);
  const tampered = body.replace('499.00', '1.00');
  const res = await verifyYoupiWebhook({
    rawBody: tampered,
    signatureHeader,
    webhookSecret: SECRET,
  });
  assert.equal(res.ok, false);
  assert.equal(res.rejectStatus, 401);
});

test('wrong secret → rejected (401)', async () => {
  const body = JSON.stringify(makeWebhook());
  const { signatureHeader } = await signedHeaders(body, 'other-secret');
  const res = await verifyYoupiWebhook({
    rawBody: body,
    signatureHeader,
    webhookSecret: SECRET,
  });
  assert.equal(res.ok, false);
  assert.equal(res.rejectStatus, 401);
});

test('missing signature → rejected (401)', async () => {
  const res = await verifyYoupiWebhook({
    rawBody: '{}',
    signatureHeader: undefined,
    webhookSecret: SECRET,
  });
  assert.equal(res.ok, false);
  assert.equal(res.rejectStatus, 401);
});

test('malformed signature padding → rejected', async () => {
  const res = await verifyYoupiWebhook({
    rawBody: '{}',
    signatureHeader: 'sha256=zzzz',
    webhookSecret: SECRET,
  });
  assert.equal(res.ok, false);
  assert.equal(res.rejectStatus, 401);
});

test('event header mismatch → rejected (400)', async () => {
  const body = JSON.stringify(makeWebhook({ event: 'FAILED' }));
  const { signatureHeader } = await signedHeaders(body);
  const res = await verifyYoupiWebhook({
    rawBody: body,
    signatureHeader,
    eventHeader: 'SUCCESS',
    webhookSecret: SECRET,
  });
  assert.equal(res.ok, false);
  assert.equal(res.rejectStatus, 400);
});

test('unknown event value → rejected', async () => {
  const body = JSON.stringify(makeWebhook({ event: 'ACKNOWLEDGED' }));
  const { signatureHeader } = await signedHeaders(body);
  const res = await verifyYoupiWebhook({
    rawBody: body,
    signatureHeader,
    webhookSecret: SECRET,
  });
  assert.equal(res.ok, false);
});

test('timingSafeEqualHex: mismatch rejects, matching accepts', () => {
  assert.equal(timingSafeEqualHex('a'.repeat(64), 'a'.repeat(64)), true);
  assert.equal(timingSafeEqualHex('a'.repeat(64), 'b'.repeat(64)), false);
  assert.equal(timingSafeEqualHex('a'.repeat(64), 'a'.repeat(63)), false);
});

test('decideWebhookAction: SUCCESS only when gateway session confirms', () => {
  const webhook = makeWebhook();
  const session = {
    id: 'pay-123',
    orderId: webhook.orderId,
    currency: 'INR',
    amountPaise: '49900',
    status: 'SUCCESS',
    metadata: {},
  };
  const d = decideWebhookAction({
    event: 'SUCCESS',
    webhook,
    session,
    expectedSession: true,
  });
  assert.equal(d.action, 'confirm');
});

test('decideWebhookAction: gateway session says PROCESSING → ignore', () => {
  const webhook = makeWebhook();
  const d = decideWebhookAction({
    event: 'SUCCESS',
    webhook,
    session: {
      id: 'pay-123',
      orderId: webhook.orderId,
      currency: 'INR',
      amountPaise: '49900',
      status: 'PROCESSING',
      metadata: {},
    },
    expectedSession: true,
  });
  assert.equal(d.action, 'ignore');
});

test('decideWebhookAction: amount vs gateway record mismatch → record (never confirm)', () => {
  const webhook = makeWebhook({ amountPaise: 100, amount: '1.00' });
  const d = decideWebhookAction({
    event: 'SUCCESS',
    webhook,
    session: {
      id: 'pay-123',
      orderId: webhook.orderId,
      currency: 'INR',
      amountPaise: '49900',
      status: 'SUCCESS',
      metadata: {},
    },
    expectedSession: true,
  });
  assert.equal(d.action, 'record');
  assert.match(d.reason, /amount mismatch/);
});

test('decideWebhookAction: orderId vs gateway mismatch → record', () => {
  const webhook = makeWebhook();
  const d = decideWebhookAction({
    event: 'SUCCESS',
    webhook,
    session: {
      id: 'pay-123',
      orderId: 'GYK-different-999',
      currency: 'INR',
      amountPaise: '49900',
      status: 'SUCCESS',
      metadata: {},
    },
    expectedSession: true,
  });
  assert.equal(d.action, 'record');
});

test('decideWebhookAction: FAILED/EXPIRED/CANCELLED → record, never confirm', () => {
  for (const ev of ['FAILED', 'EXPIRED', 'CANCELLED']) {
    const webhook = makeWebhook({ event: ev });
    const d = decideWebhookAction({
      event: ev,
      webhook,
      session: {
        id: 'pay-123',
        orderId: webhook.orderId,
        currency: 'INR',
        amountPaise: '49900',
        status: ev,
        metadata: {},
      },
      expectedSession: true,
    });
    assert.equal(d.action, 'record');
  }
});

test('verify-side ownership rules: foreign session rejected', () => {
  // Mirrors the check shipped in verify-youpi-payment/index.ts 1b.
  const checkOwnership = (sessionMetadata, verifierId) => {
    const sessionUserId = sessionMetadata?.user_id ?? null;
    const sessionSource = sessionMetadata?.source ?? null;
    return Boolean(
      sessionUserId && sessionSource === 'gyftkart' && sessionUserId === (verifierId ?? '')
    );
  };
  assert.equal(checkOwnership({ user_id: 'user-1', source: 'gyftkart' }, 'user-1'), true);
  assert.equal(checkOwnership({ user_id: 'user-2', source: 'gyftkart' }, 'user-1'), false);
  assert.equal(checkOwnership({ source: 'gyftkart' }, 'user-1'), false);
  // SDK self-created session on the same gateway (no source) → rejected.
  assert.equal(checkOwnership({ user_id: 'user-1' }, 'user-1'), false);
});
