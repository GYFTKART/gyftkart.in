// supabase/functions/_shared/__tests__/upi-direct.test.mjs
//
// node --test suite for the UPI Direct shared logic: parser safety,
// decision matrix, deep links, paise math.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBankCreditEmail,
  isKnownBankSender,
  decideUpiSession,
  buildUpiUri,
  rupeesToPaise,
} from '../upi-direct.js';

const baseSession = {
  id: 'sid',
  user_id: 'user-1',
  order_id: 'UPI-abcdef12-1',
  amount_paise: '49900',
  currency: 'INR',
  status: 'ACTIVE',
  expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
};

test('credited email with UTR parses exactly', () => {
  const r = parseBankCreditEmail({
    from: 'alerts@icicibank.com',
    subject: 'Rs.499.00 credited in your account',
    body: 'Rs.499.00 credited in your a/c XX1234 on 17-10-26 by UPI Ref no 402911847562. Available bal: Rs.10,000.00',
  });
  assert.equal(r.credited, true);
  assert.equal(r.amountPaise, 49900n);
  assert.equal(r.bankRef, '402911847562');
});

test('indian comma format parses', () => {
  const r = parseBankCreditEmail({
    from: 'alerts@hdfcbank.net',
    subject: 'Alert: You have received Rs.1,234.50',
    body: 'UPI payment of Rs.1,234.50 received from 99xxxx@ybl Ref no 123456789012',
  });
  assert.equal(r.amountPaise, 123450n);
  assert.equal(r.bankRef, '123456789012');
});

test('debit alert is rejected (no confirmation)', () => {
  const r = parseBankCreditEmail({
    from: 'alerts@icicibank.com',
    subject: 'Rs.499.00 debited from your a/c',
    body: 'Rs.499.00 debited via UPI on 17-10-26',
  });
  assert.equal(r.credited, false);
  assert.equal(r.reason, 'DEBIT_PHRASE_PRESENT');
});

test('no credit phrase → rejected (balance statements are not credits)', () => {
  const r = parseBankCreditEmail({
    from: 'alerts@sbi.co.in',
    subject: 'e-Statement for Oct',
    body: 'Closing balance Rs.12,000.00',
  });
  assert.equal(r.credited, false);
  assert.equal(r.reason, 'NO_CREDIT_PHRASE');
});

test('credit phrase without an amount → rejected', () => {
  const r = parseBankCreditEmail({
    from: 'alerts@axisbank.com',
    subject: 'Credited',
    body: 'Your money has been credited successfully.',
  });
  assert.equal(r.credited, false);
  assert.equal(r.reason, 'NO_AMOUNT');
});

test('unknown / non-bank sender → rejected by allowlist', () => {
  assert.equal(isKnownBankSender('scammer@example.com'), false);
  assert.equal(isKnownBankSender('alerts@icicibank.com'), true);
  assert.equal(isKnownBankSender(undefined), false);
});

test('decision matrix: SUCCESS → confirm; wrong owner/order/amount → reject', () => {
  const d1 = decideUpiSession({
    session: { ...baseSession, status: 'SUCCESS' },
    claimed: { user_id: 'user-1' },
  });
  assert.equal(d1.action, 'confirm');

  const d2 = decideUpiSession({
    session: baseSession,
    claimed: { user_id: 'user-2' },
  });
  assert.equal(d2.action, 'reject');

  const d3 = decideUpiSession({
    session: { ...baseSession, status: 'SUCCESS', order_id: 'other' },
    claimed: { user_id: 'user-1', order_id: 'UPI-abcdef12-1' },
  });
  assert.equal(d3.action, 'reject');

  const d4 = decideUpiSession({
    session: { ...baseSession, status: 'SUCCESS' },
    claimed: { user_id: 'user-1' },
    expectedPaise: 100,
  });
  assert.equal(d4.action, 'reject');
});

test('decision matrix: pending/expired/terminal paths', () => {
  const pend = decideUpiSession({ session: baseSession, claimed: {} });
  assert.equal(pend.action, 'pending');

  const exp = decideUpiSession({
    session: { ...baseSession, expires_at: new Date(Date.now() - 1000).toISOString() },
    claimed: {},
  });
  assert.equal(exp.action, 'expired');

  const failed = decideUpiSession({ session: { ...baseSession, status: 'FAILED' }, claimed: {} });
  assert.equal(failed.action, 'reject');

  const missing = decideUpiSession({ session: null, claimed: {} });
  assert.equal(missing.action, 'reject');
});

test('deep link contains exact rupee amount and VPA', () => {
  const uri = buildUpiUri({
    vpa: 'gyftkart@idfc',
    payeeName: 'GyftKart',
    amountPaise: 49900,
    note: 'Gift card order',
  });
  assert.match(uri, /^upi:\/\/pay\?/);
  assert.match(uri, /pa=gyftkart%40idfc/);
  assert.match(uri, /am=499\.00/);
  assert.match(uri, /cu=INR/);
});

test('rupeesToPaise exact rounding (no float drift)', () => {
  assert.equal(rupeesToPaise(499.29), 49929);
  assert.equal(rupeesToPaise(1234.5), 123450);
  assert.equal(rupeesToPaise(0), null);
  assert.equal(rupeesToPaise(-1), null);
  assert.equal(rupeesToPaise(NaN), null);
});
